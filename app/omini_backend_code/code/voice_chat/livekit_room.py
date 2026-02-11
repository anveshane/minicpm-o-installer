from collections import deque
import json
import time
from livekit import rtc
import asyncio
import cv2
import numpy as np
from PIL import Image
from scipy.signal import resample_poly

from common.enums.model_type import ModelType
from enhanced_logging_config import get_enhanced_logger, set_request_trace
from services.inference_service_manager import InferenceService, InferenceServiceManager, ServiceStatus, get_service_manager

# 导入配置系统
from config import get_livekit_settings
from voice_chat.entity.token import LoginRequest
from voice_chat.model_call import MiniCpmModel
from voice_chat.entity.session import SharedSessionState

# 获取日志器
logger = get_enhanced_logger('voice_chat')


class LiveKitRoom:
    def __init__(self, liveKit_token: str, request: LoginRequest,
    audio_input_queue: asyncio.Queue, 
    audio_output_queue: asyncio.Queue,
    inference_service: InferenceService,
    inference_service_manager: InferenceServiceManager,
    model_cpm:MiniCpmModel,
    stop_event: asyncio.Event,
    shared_state: SharedSessionState):
        self.liveKit_token = liveKit_token
        self.inference_service = inference_service
        self.room = None
        self.session_id = request.sessionId
        self.connected_participants = set()
        self.stop_event = stop_event
        self.inference_service_manager = inference_service_manager  # 使用传入的实例，而不是类
        self.last_audio_timestamp = time.time()
        self.last_image_process_time = time.time()  # 上次图片处理时间
        self.image_process_interval = 0.18 if request.highRefresh else 0.85
        self.model_cpm = model_cpm
        self.active_tasks = []
        self.tasks = set()

        # 接收liveKit中的文本、图片和音频流的队列
        self.audio_input_queue = audio_input_queue
        self.audio_output_queue = audio_output_queue
        self.start_audio_trace = False

        self.WEBRTC_SAMPLE_RATE = 48000
        self.NUM_CHANNELS = 1

        # 协程间共享的会话状态
        self.shared_state = shared_state
        self.image_frame_count = 0
        self.highRefresh = request.highRefresh
        
        # 前端用户连接事件，用于等待用户进入房间后再发送关键消息
        self.participant_connected_event = asyncio.Event()


    # 初始化房间监听
    async def init_room_listener(self) -> rtc.AudioSource:
        # 设置日志追踪上下文，用于关联同一会话的所有日志
        set_request_trace(
            request_id=self.session_id[:8] if self.session_id else None,
            session_id=self.session_id
        )
        
        loop = asyncio.get_event_loop()
        self.room = rtc.Room(loop=loop)

        try:
            # 从配置系统获取LiveKit配置
            livekit_config = get_livekit_settings()
            livekit_url = livekit_config.url
            
            logger.info(f"Init_room_listener liveKit url: {livekit_url}")
            if not livekit_url:
                raise ValueError("LIVEKIT_URL 配置未设置，请在 config/{env}.yaml 中配置或通过环境变量 LIVEKIT__URL 设置")
            
            # 启动连接
            await self.room.connect(livekit_url, self.liveKit_token)
            logger.info(f"LiveKit 连接房间成功, url={livekit_url},token={self.liveKit_token}")
            
            # 在正确的事件循环中创建资源监听任务
            asyncio.create_task(self._resource_monitor())
    
        except Exception as e:
            logger.error(f"LiveKit 连接失败: {str(e)}")
            raise
        
        # 注册断开事件监听
        @self.room.on("disconnected")
        def on_disconnected():
            logger.info("LiveKit 房间连接已断开")
        
        @self.room.on("connection_state_changed")
        def on_connection_state_changed(state):
            if state == 0:  # DISCONNECTED
                logger.info("LiveKit 连接状态变化: 连接已断开")
            elif state == 1:  # CONNECTED
                logger.info("LiveKit 连接状态变化: 连接成功!")
            elif state == 2:  # RECONNECTING
                logger.info("LiveKit 连接状态变化: 正在重连...")


        # 注册断开事件监听
        @self.room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant):
            self.connected_participants.add(participant.identity)
            # 设置事件，通知等待的任务用户已连接
            self.participant_connected_event.set()
            logger.info(f"前端用户已连接, identity: {participant.identity}")

        @self.room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant):
            logger.info(f"参与者断开连接: {participant.identity}")
            self.connected_participants.discard(participant.identity)
            self.stop_event.set()
            # 取消所有 pending 任务，避免 "Task was destroyed but it is pending" 警告
            if self.tasks:
                for task in list(self.tasks):
                    if not task.done():
                        task.cancel()
                self.tasks.clear()
                logger.info("参与者断开，已取消所有 pending 任务")
            # 使用 asyncio.create_task 来异步执行断开连接
            asyncio.create_task(self.room.disconnect())
            logger.info("机器人已经调用离开房间")
            # 释放推理服务
            # asyncio.create_task(self.release_inference_service())

        @self.room.on("track_subscribed")
        def on_track_subscribed(track: rtc.Track, *_):
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                logger.info("subscribed to track: " + track.name)
                video_stream = rtc.VideoStream(
                    track, format=rtc.VideoBufferType.RGB24)
                task = asyncio.create_task(self.input_image(video_stream))
                self.tasks.add(task)
                task.add_done_callback(lambda t: self.tasks.discard(t))

            if track.kind == rtc.TrackKind.KIND_AUDIO:
                logger.info("subscribed to track: " + track.name)
                audio_stream = rtc.AudioStream(track)
                task1 = asyncio.create_task(self.input_audio(audio_stream))
                self.tasks.add(task1)
                task1.add_done_callback(lambda t: self.tasks.discard(t))

        @self.room.on("track_unsubscribed")
        def on_track_unsubscribed(track: rtc.Track, *_):
            logger.info(f"取消订阅轨道: {track.name}")
            # 安全地取消所有任务（包括视频和音频轨道）
            if self.tasks:
                for task in list(self.tasks):  # 创建副本避免在迭代时修改集合
                    if not task.done():
                        task.cancel()
                self.tasks.clear()
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                logger.info("音频轨道取消订阅，清空音频状态")
            elif track.kind == rtc.TrackKind.KIND_VIDEO:
                logger.info("视频轨道取消订阅，已取消相关任务")
        
        # 注册断开事件监听
        @self.room.on("disconnected")
        def on_disconnected(reason: str):
            logger.info(f"LiveKit 房间连接已断开: {reason}")
            # 停止OmniStream线程服务
            self.stop_event.set()
            # 取消所有 pending 任务，避免 "Task was destroyed but it is pending" 警告
            if self.tasks:
                for task in list(self.tasks):
                    if not task.done():
                        task.cancel()
                self.tasks.clear()
                logger.info("房间断开，已取消所有 pending 任务")
            
        # 注册文本流处理器,接收用户的文字输入（用于 stream_text 方式）
        self.room.register_text_stream_handler(
            "lk.chat",
            self._handle_text_stream
        )
        logger.info("文本流处理器注册成功,topic: lk.chat")
        
        # 注册数据接收事件,接收用户的 publish_data 数据
        @self.room.on("data_received")
        def on_data_received(packet):
            """
            处理 publish_data 接收的数据
            packet 是 DataPacket 对象，包含：
            - data: bytes 数据
            - kind: 传输类型 (KIND_RELIABLE 或 KIND_LOSSY)
            - participant: 发送者
            - topic: 主题
            """
            try:
                # 从 DataPacket 中提取数据
                data = packet.data
                topic = packet.topic
                participant = packet.participant
                kind = packet.kind
                
                # 安全获取参与者身份
                participant_identity = "unknown"
                if participant is not None:
                    participant_identity = getattr(participant, 'identity', None) or getattr(participant, 'sid', None) or 'unknown'
                
                logger.info(f"======= 收到 publish_data 数据 =======, topic: {topic}, 参与者: {participant_identity}, kind: {kind}")
                
                if topic == "lk.chat":
                    text_message = data.decode('utf-8')
                    logger.info(f"收到文本消息: {text_message}")
                    # 异步处理消息
                    asyncio.create_task(self._handle_data_message(text_message, participant))
            except Exception as e:
                logger.error(f"处理 publish_data 消息失败: {e}", exc_info=True)
        
        logger.info("数据接收事件注册成功")
        # publish a track
        source = rtc.AudioSource(
            self.WEBRTC_SAMPLE_RATE, self.NUM_CHANNELS, 50)   
        track = rtc.LocalAudioTrack.create_audio_track("sinewave", source)
        options = rtc.TrackPublishOptions()
        options.source = rtc.TrackSource.SOURCE_MICROPHONE
        publication = await self.room.local_participant.publish_track(track, options)
        logger.info(f"published track {publication.sid}")
        return source


    def _handle_text_stream(self, reader, participant_identity):
        """处理文本流的回调函数"""
        logger.info(f"======= 收到文本流回调 =======, 参与者身份: {participant_identity}, 当前活跃任务数: {len(self.active_tasks)}")
        
        try:
            task = asyncio.create_task(
                self.input_text(reader, participant_identity))
            self.active_tasks.append(task)
            task.add_done_callback(lambda t: self.active_tasks.remove(t) if t in self.active_tasks else None)
            logger.info(f"文本流处理任务已创建,任务ID: {id(task)}")
        except Exception as e:
            logger.error(f"创建文本流处理任务失败: {e}")
            raise

    async def input_image(self, video_stream: rtc.VideoStream) -> None:
        async for frame_event in video_stream:     
            # 检查是否达到500ms间隔
            if await self.shared_state.is_max_image_number():
                continue
            
            if (time.time() - self.last_image_process_time) < self.image_process_interval:
                # 未达到间隔时间，跳过处理
                continue
            # 如果是单工并且正在输出，则直接返回
            if self.model_cpm.model_type == ModelType.SIMPLEX and not self.model_cpm.play_end_event.is_set():
                continue
            await self.shared_state.increment_image_number()
            # 保存图片到队列
            try:
                current_time = time.time()  
                buffer = frame_event.frame
                arr = np.frombuffer(buffer.data, dtype=np.uint8)
                arr = arr.reshape((buffer.height, buffer.width, 3))
                arr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
                # 转换为PIL Image格式
                pil_image = Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))

                asyncio.create_task(self.model_cpm.model_prefill(session_id=self.session_id, image_data=pil_image))                
                # 计算距上次处理的间隔时间
                interval = current_time - self.last_image_process_time
                # 更新上次处理时间
                self.last_image_process_time = current_time
                logger.info(f"图片已处理并放入队列，距上次间隔: {interval:.3f}s")
            except Exception as e:
                logger.error(f"图片处理异常: {e}")
                
            self.image_frame_count += 1
            if self.image_frame_count % 100 == 0:
                logger.info(f"第 {await self.shared_state.get_round()} 轮对话, 已处理 {self.image_frame_count} 帧")
    
    async def _handle_data_message(self, text_message: str, participant):
        """处理通过 publish_data 接收到的消息"""
        participant_identity = participant.identity if participant else "unknown"
        await self._process_text_command(text_message, participant_identity)
    
    async def _process_text_command(self, full_text: str, participant_identity: str):
        """处理文本命令的通用方法"""
        logger.info(f"处理来自 {participant_identity} 的消息: '{full_text}'")
        
        if full_text == "<state><play_end>":
            # 重制图片处理的计数
            await self.model_cpm.play_end()
            await self.push_text_output("<state><play_end_success>")
            return
        
        # 尝试解析JSON指令
        try:
            json_data = json.loads(full_text)
            logger.info(f"解析到JSON指令: {json_data}")

            # 处理不同的接口指令
            if json_data.get("interface") == "init":
                await self.push_text_output("<state><session_init>")
                self.start_audio_trace = True
            elif json_data.get("interface") == "stop":
                logger.info("======= 收到会话停止指令 =======")
                self.stop_event.set()
                await self.push_text_output("<state><session_stop>")
            elif json_data.get("interface") == "break":
                logger.info("======= 收到单轮打断指令 =======")
                await self.model_cpm.streaming_break(self.session_id, text=f"用户打断, 当前轮次: {await self.shared_state.get_round()}")
                logger.info("======= 当前轮对话已打断 =======")
            else:
                logger.error(f"[错误] 未知的接口指令: {json_data.get('interface', 'None')}")

        except json.JSONDecodeError:
            # 不是JSON格式，当作普通文本处理
            logger.info(f"普通文本消息,非JSON格式: {full_text}")

    async def input_text(self, reader: rtc.TextStreamReader, participant_identity: str):
        """处理输入的文本消息（通过 stream_text 发送的）"""
        try:
            full_text = await reader.read_all()
            await self._process_text_command(full_text, participant_identity)
        except Exception as e:
            logger.error(f"处理文本输入时出错: {str(e)}")

    # 需要等待用户连接后才能发送的关键消息
    WAIT_PARTICIPANT_MESSAGES = [
        "<state><model_init_success>",
        "<state><model_init_failed>",
    ]

    # 向liveKit房间推送文本消息（使用 reliable 模式保证送达）
    async def push_text_output(self, text_message: str, max_retries: int = 3):
        if not self.room:
            logger.error("房间未初始化，无法发送消息")
            return False
        
        # 对于关键消息，等待前端用户连接后再发送
        if text_message in self.WAIT_PARTICIPANT_MESSAGES:
            if text_message == "<state><model_init_failed>":
                self.stop_event.set()
            if not self.participant_connected_event.is_set():
                logger.info(f"等待前端用户连接后再发送关键消息: {text_message}")
                try:
                    # 最多等待 5 秒
                    await asyncio.wait_for(
                        self.participant_connected_event.wait(),
                        timeout=8.0
                    )
                    logger.info(f"前端用户已连接，开始发送关键消息: {text_message}")
                    # 发送空的音频片
                    asyncio.create_task(self.send_silence_audio())
                except asyncio.TimeoutError:
                    logger.info(f"等待前端用户连接超时(5s)，仍然发送消息: {text_message}")
        
        for attempt in range(max_retries):
            try:
                # 检查连接状态
                if self.room.connection_state != 1:  # 不是 CONNECTED 状态
                    logger.error(f"连接状态异常，无法发送消息。当前状态: {self.room.connection_state}")
                    return False
                
                # 使用 publish_data 方法，reliable=True 保证可靠传输
                await asyncio.wait_for(
                    self.room.local_participant.publish_data(
                        payload=text_message,
                        reliable=True,  # 使用可靠传输模式
                        topic="lk.chat"
                    ),
                    timeout=5.0
                )
                logger.info(f"文本消息已发送(reliable): {text_message}")
                return True
                
            except asyncio.TimeoutError:
                logger.error(f"发送超时 (尝试 {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.5)
            except Exception as e:
                logger.error(f"发送失败 (尝试 {attempt + 1}/{max_retries}): {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.5)
        
        logger.error(f"文本消息发送失败，已重试 {max_retries} 次: {text_message}")
        return False

    async def send_silence_audio(self):
        silence_samples = int(self.WEBRTC_SAMPLE_RATE * 1)  # 48000个样本
        silence_audio = np.zeros(silence_samples, dtype=np.int16)  # 静音数据
        # 将1秒静音数据分块放入队列
        silence_chunks = self.process_audio_chunk(
            silence_audio, self.WEBRTC_SAMPLE_RATE, self.WEBRTC_SAMPLE_RATE, self.WEBRTC_SAMPLE_RATE//10)
        for chunk in silence_chunks:
            await self.audio_output_queue.put(chunk)
    

    def process_audio_chunk(self, audio_data, input_rate, output_rate, chunk_size):
        try:
            resampled_data = resample_poly(
                audio_data, output_rate, input_rate, padtype='line')
            resampled_data = np.clip(
                resampled_data, -32768, 32767).astype(np.int16)
            total_chunks = len(resampled_data) // chunk_size
            chunks = []
            for i in range(total_chunks):
                start_idx = i * chunk_size
                end_idx = start_idx + chunk_size
                chunk = resampled_data[start_idx:end_idx]
                chunks.append(chunk)
            return chunks
        except Exception as e:
            print(f"音频处理错误: {str(e)}")
            return []


    async def input_audio(self, audio_stream: rtc.AudioStream):
        """处理音频输入流"""
        logger.info("开始处理音频输入流")
        current_connection_id = self.session_id

        frame_count = 0
        async for frame_event in audio_stream:
            if not self.start_audio_trace:
                continue
            # 检查连接是否仍然有效
            current_time = time.time()

            # 检查音频数据是否过期（超过2秒的数据被认为是过期的）
            if current_time - self.last_audio_timestamp > 2.0:
                logger.info(
                    f"检测到音频数据可能过期，跳过处理 (时间差: {current_time - self.last_audio_timestamp:.2f}s)")
                self.last_audio_timestamp = current_time
                continue

            audio_data = frame_event.frame.data.tobytes()
            audio_array = np.frombuffer(audio_data, dtype=np.int16)

            # 添加时间戳信息（通过元组包装）
            timestamped_audio = (audio_array, current_time,
                                 current_connection_id)
            await self.audio_input_queue.put(timestamped_audio)

            frame_count += 1
            if frame_count % 1000 == 0:  # 每1000帧打印一次状态
                logger.info(f"已处理 {frame_count} 个音频帧,连接ID: {current_connection_id}")

            self.last_audio_timestamp = current_time

            # if play_audio:
            #     stream.write(audio_data)

        logger.info(f"音频流处理结束,连接ID: {current_connection_id}，总共处理了 {frame_count} 帧")


    async def _resource_monitor(self):
        while True:
            try:
                if self.stop_event.is_set():
                    break
                inference_service = await self.inference_service_manager.get_service(self.inference_service.service_id)
                if inference_service:
                    if inference_service.status != ServiceStatus.BUSY:
                        logger.info(f"推理服务状态已被释放, 释放推理服务: service_id: {self.inference_service.service_id}, status: {inference_service.status}")
                        self.stop_event.set()
                        await self.push_text_output("<state><robot_exit>")
                        await self.room.disconnect()
                        logger.info(f"推理服务离线: {self.inference_service.service_id}, 断开房间连接")
                        break
                else:
                    self.stop_event.set()
                    await self.push_text_output("<state><robot_exit>")
                    await self.room.disconnect()
                    logger.info(f"推理服务不存在: {self.inference_service.service_id}, 断开房间连接")
                    break
                await asyncio.sleep(3)
            except Exception as e:
                logger.error(f"推理服务资源监听异常: {e}")
                break

async def send_text_message(room: rtc.Room, text_message: str) -> bool:
    try:
        text_writer = await asyncio.wait_for(
            room.local_participant.stream_text(topic="lk.chat"),
            timeout=5.0  # 5秒超时
        )
        for char in text_message:
            await text_writer.write(char)
        await text_writer.aclose()
        logger.info(f"文本消息已发送: {text_message}")
    except Exception as e:
        logger.error(f"发送文本消息时出错: {e}, text_message: {text_message}")
        return False
    return True