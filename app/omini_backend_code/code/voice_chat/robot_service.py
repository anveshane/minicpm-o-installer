import asyncio
from datetime import datetime
import json
import os
import time
import uuid
import numpy as np
import cv2
from collections import deque
from livekit import rtc
from signal import SIGINT, SIGTERM

from scipy.signal import resample_poly
from enhanced_logging_config import get_enhanced_logger, set_request_trace
from services.inference_service_manager import InferenceService, InferenceServiceManager
from voice_chat.entity.session import SharedSessionState
from voice_chat.entity.token import LoginRequest
from voice_chat.livekit_room import LiveKitRoom
from voice_chat.model_call import MiniCpmModel
from voice_chat.omni_stream import OmniStream

# 获取日志器
logger = get_enhanced_logger('voice_chat')


class Mini_Server:
    def __init__(self, stop_event: asyncio.Event, liveKitRoom: LiveKitRoom, 
    audio_output_queue: asyncio.Queue, text_output_queue: asyncio.Queue, 
    first_tts: asyncio.Event):
        self.liveKitRoom = liveKitRoom
        self.stop_event = stop_event

        # 音频配置
        self.WEBRTC_SAMPLE_RATE = 48000
        self.NUM_CHANNELS = 1
        self.UPDATE_SIZE = self.WEBRTC_SAMPLE_RATE//50

        self.audio_output_queue = audio_output_queue
        self.text_output_queue = text_output_queue
        self.first_tts = first_tts

    async def server(self, source: rtc.AudioSource, model_generating_flag: asyncio.Event) -> None:
        asyncio.create_task(self.output_audio(source, model_generating_flag))
        asyncio.create_task(self.text_put_detail())

    async def text_put_detail(self):
        while not self.stop_event.is_set():
            try:
                # 使用带超时的阻塞等待，避免CPU空转，同时能及时响应stop_event
                text = await asyncio.wait_for(
                    self.text_output_queue.get(),
                    timeout=1  # 1s超时，定期检查stop_event
                )
                logger.info(f"收到文本: {text}")
                await self.liveKitRoom.push_text_output(text_message=text)
            except asyncio.TimeoutError:
                # 超时，继续循环检查stop_event
                continue
            except Exception as e:
                logger.error(f"处理文本输出错误: {e}")
                await asyncio.sleep(0.01)
                continue

    async def output_audio(self, source: rtc.AudioSource, model_generating_flag: asyncio.Event):
        try:
            logger.info(f"开始监听输出音频队列")
            audio_frame = rtc.AudioFrame.create(
                self.WEBRTC_SAMPLE_RATE, self.NUM_CHANNELS, self.UPDATE_SIZE)
            audio_data = np.frombuffer(audio_frame.data, dtype=np.int16)

            frame_count = 0
            # 维护剩余音频缓冲区，用于拼接不足0.1s的音频片段
            remaining_audio = None

            while not self.stop_event.is_set():
                try:
                    # 策略1：如果有剩余音频且足够发送，先发送剩余音频
                    if remaining_audio is not None and len(remaining_audio) >= self.UPDATE_SIZE:
                        chunk_to_send = remaining_audio[:self.UPDATE_SIZE]
                        np.copyto(audio_data, chunk_to_send)
                        await source.capture_frame(audio_frame)
                        
                        frame_count += 1
                        remaining_audio = remaining_audio[self.UPDATE_SIZE:]
                        if len(remaining_audio) == 0:
                            remaining_audio = None
                        continue  # 继续下一次循环，不阻塞等待
                    
                    # 策略2：尝试从队列获取新数据（带超时的阻塞等待）
                    try:
                        chunk_data = await asyncio.wait_for(
                            self.audio_output_queue.get(), 
                            timeout=0.2  # 200ms超时，定期检查状态
                        )
                        
                        # 标记首次音频开始
                        if self.first_tts.is_set():
                            self.text_output_queue.put_nowait("<state><audio_start>")
                        
                        # 拼接新数据与剩余音频
                        if remaining_audio is not None:
                            combined_audio = np.concatenate([remaining_audio, chunk_data])
                        else:
                            combined_audio = chunk_data
                        
                        # 循环发送所有完整的音频片段
                        while len(combined_audio) >= self.UPDATE_SIZE:
                            chunk_to_send = combined_audio[:self.UPDATE_SIZE]
                            np.copyto(audio_data, chunk_to_send)
                            await source.capture_frame(audio_frame)
                            
                            if self.first_tts.is_set():
                                self.text_output_queue.put_nowait(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')} - 发送首响音频成功")
                                self.first_tts.clear()
                            
                            frame_count += 1
                            combined_audio = combined_audio[self.UPDATE_SIZE:]
                        
                        # 保存剩余的不足一个片段的音频
                        remaining_audio = combined_audio if len(combined_audio) > 0 else None
                        
                    except asyncio.TimeoutError:
                        # 策略3：超时无新数据，如果模型不再生成，发送剩余音频（即使不足UPDATE_SIZE）
                        if remaining_audio is not None and not model_generating_flag.is_set():
                            # 用零填充到UPDATE_SIZE
                            padded_audio = np.zeros(self.UPDATE_SIZE, dtype=np.int16)
                            padded_audio[:len(remaining_audio)] = remaining_audio
                            np.copyto(audio_data, padded_audio)
                            await source.capture_frame(audio_frame)
                            frame_count += 1
                            remaining_audio = None
                            logger.debug(f"发送填充后的剩余音频")
                        # 短暂让出CPU
                        await asyncio.sleep(0)
                        
                except Exception as e:
                    logger.error(f"处理音频输出错误: {e}")
                    await asyncio.sleep(0.01)
                    
            logger.info(f"结束监听输出音频队列，共发送 {frame_count} 帧")
        except Exception as e:
            logger.error(f"output_audio error: {str(e)}")


async def room_start_monitor(session_id: str, liveKitToken: str, request: LoginRequest, inference_service: InferenceService, inference_service_manager: InferenceServiceManager):
    # 设置日志追踪上下文，用于关联同一会话的所有日志
    set_request_trace(
        request_id=session_id[:8] if session_id else None,
        session_id=session_id
    )
    logger.info(f"启动监听服务 - 房间ID: {session_id}, LiveKitToken: {liveKitToken}")
    try:
        logger.info(f"启动监听服务 - 房间ID: {session_id}, LiveKitToken: {liveKitToken}, request: {request}, 推理服务: {inference_service.service_id}")
        # 初始化监听和输出队列 - 使用异步队列替代同步队列
        audio_input_queue = asyncio.Queue(maxsize=1000)  # 添加maxsize防止内存无限增长
        audio_output_queue = asyncio.Queue(maxsize=1000)
        text_output_queue = asyncio.Queue(maxsize=200)

        # 使用异步Event替代threading.Event
        stop_event = asyncio.Event()
        first_tts = asyncio.Event()
        model_generating_flag = asyncio.Event()
        
        # 创建协程间共享的会话状态
        shared_state = SharedSessionState(highRefresh=request.highRefresh)
        
        model_cpm = MiniCpmModel(inference_service=inference_service, request=request, 
            text_output_queue=text_output_queue, audio_output_queue=audio_output_queue, 
            first_tts=first_tts, shared_state=shared_state,
            model_generating_flag=model_generating_flag)
        # 启动omniStream服务
        omni_stream = OmniStream(inference_service=inference_service, request=request, audio_input_queue=audio_input_queue, audio_output_queue=audio_output_queue, 
            text_output_queue=text_output_queue, stop_event=stop_event, model_cpm=model_cpm, shared_state=shared_state)

        # 创建音频缓冲区并启动异步流处理
        audio_buffer = deque(maxlen=omni_stream.BUFFER_SIZE)
        asyncio.create_task(omni_stream._async_stream_detail(audio_buffer))
        # 初始化房间的监听
        liveKit_room = LiveKitRoom(liveKit_token=liveKitToken, request=request, 
        audio_input_queue=audio_input_queue, audio_output_queue=audio_output_queue, inference_service=inference_service, 
        inference_service_manager=inference_service_manager, model_cpm=model_cpm, stop_event=stop_event, 
        shared_state=shared_state)
        source = await liveKit_room.init_room_listener()

        # 初始化模型配置
        asyncio.create_task(model_cpm.model_init())

        mini_server = Mini_Server(
            stop_event=stop_event,
            liveKitRoom=liveKit_room,
            audio_output_queue=audio_output_queue,
            text_output_queue=text_output_queue,
            first_tts=first_tts)
        
        # 启动模型服务逻辑（非阻塞）
        await mini_server.server(source, model_generating_flag)
        logger.info("模型服务已启动，函数即将返回")
        
    except Exception as e:
        logger.error(f"房间监听服务启动失败: {e}")
        raise