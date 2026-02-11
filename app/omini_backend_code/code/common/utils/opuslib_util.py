

import os
import numpy as np
import opuslib
import soundfile
from scipy.signal import resample_poly

from enhanced_logging_config import get_enhanced_logger

# 获取日志器
logger = get_enhanced_logger('opuslib_util')


def compress_audio_with_opus(audio: np.ndarray, sample_rate: int = 48000, bitrate: int = 32000) -> bytes:
    """
    使用 opuslib 压缩1秒的音频数据
    
    Args:
        audio: 1秒的音频数据向量（numpy数组，可以是 int16 或 float32 格式）
               支持单声道 (samples,) 或立体声 (samples, 2)
        sample_rate: 输入音频的采样率，默认48kHz
        bitrate: Opus编码比特率，默认32 kbps（有效范围：6-510 kbps）
    
    Returns:
        压缩后的Opus音频数据（字节）
    """
    try:
        # 这里对audio进行copy防止影响外部的对象
        audio = audio.copy()
        if audio is None or len(audio) == 0:
            return "".encode("utf-8")
        # 检查音频是否为立体声（双通道）
        if audio.ndim == 2:
            # 立体声转单声道：取平均值
            logger.info(f"检测到立体声音频，通道数: {audio.shape[1]}，转换为单声道")
            audio = np.mean(audio, axis=1)
        
        # 如果输入是 int16 格式，先转换为 float32
        if audio.dtype == np.int16:
            audio = audio.astype(np.float32) / 32768.0
        elif audio.dtype != np.float32:
            audio = audio.astype(np.float32)
        
        # 重采样到 16kHz（Opus 常用采样率）
        target_sample_rate = 16000
        if sample_rate != target_sample_rate:
            audio = resample_poly(audio, target_sample_rate, sample_rate)
        
        # 转换为 int16 PCM 格式用于 Opus 编码
        audio_int16 = np.clip(audio * 32767, -32768, 32767).astype(np.int16)
        
        # 计算原始 PCM 数据大小（1秒音频在16kHz采样率下 = 16000 samples * 2 bytes = 32000 bytes）
        original_size = len(audio_int16) * 2  # int16 = 2 bytes per sample
        
        # 使用 Opus 编码压缩音频
        # Opus 编码器参数：采样率 16000Hz，声道数 1（单声道），应用类型 VOIP
        encoder = opuslib.Encoder(target_sample_rate, 1, opuslib.APPLICATION_VOIP)
        
        # 设置比特率（Opus 有效范围：6-510 kbps）
        # 如果设置失败，使用默认比特率
        actual_bitrate = "default (encoder auto)"
        
        # Opus 编码需要固定帧大小，通常使用 20ms 的帧（16000 * 0.02 = 320 samples）
        frame_size = 320  # 20ms @ 16kHz
        opus_data = bytearray()
        frame_sizes = []  # 记录每帧编码后的大小，用于解码
        
        # 分帧编码
        for i in range(0, len(audio_int16), frame_size):
            frame = audio_int16[i:i + frame_size]
            # 如果最后一帧不足，需要填充到固定大小
            if len(frame) < frame_size:
                padded_frame = np.zeros(frame_size, dtype=np.int16)
                padded_frame[:len(frame)] = frame
                frame = padded_frame
            
            # 将 numpy 数组转换为字节（opuslib 需要字节数据）
            frame_bytes = frame.tobytes()
            
            # 编码帧
            encoded_frame = encoder.encode(frame_bytes, frame_size)
            opus_data.extend(encoded_frame)
            frame_sizes.append(len(encoded_frame))  # 记录这一帧的大小
        
        # 转换为 bytes
        compressed_data = bytes(opus_data)
        
        # 将帧大小信息编码到数据前面（使用简单的格式：每帧大小用2字节表示，最多65535字节）
        # 格式：前2字节是帧数量，然后每2字节是一个帧的大小
        num_frames = len(frame_sizes)
        header = bytearray()
        header.extend(num_frames.to_bytes(2, 'big'))  # 帧数量（2字节）
        for size in frame_sizes:
            header.extend(size.to_bytes(2, 'big'))  # 每帧大小（2字节）
        
        # 将头部信息和数据组合
        compressed_data_with_header = bytes(header) + compressed_data
        compressed_size = len(compressed_data_with_header)
        compression_ratio = (1 - compressed_size / original_size) * 100 if original_size > 0 else 0
        
        bitrate_str = f"{actual_bitrate} bps" if isinstance(actual_bitrate, int) else actual_bitrate
        logger.info(
            f"音频压缩完成 - 原始大小: {original_size} bytes ({original_size/1024:.2f} KB), "
            f"压缩后大小: {compressed_size} bytes ({compressed_size/1024:.2f} KB), "
            f"压缩率: {compression_ratio:.2f}%, "
            f"比特率: {bitrate_str}, "
            f"音频时长: {len(audio_int16)/target_sample_rate:.2f}秒"
        )
        
        return compressed_data_with_header
        
    except Exception as e:
        logger.error(f"音频压缩失败: {str(e)}")
        raise Exception(f"音频压缩失败: {str(e)}")


def decompress_opus_to_wav(opus_data: bytes, sample_rate: int = 16000) -> np.ndarray:
    """
    将压缩后的 Opus 音频数据解码并保存为可播放的 WAV 文件
    
    Args:
        opus_data: 压缩后的 Opus 音频数据（字节）
        sample_rate: 输出音频的采样率，默认16kHz
                    注意：必须是 Opus 支持的采样率 (8000, 12000, 16000, 24000, 48000)
                    由于压缩时统一使用16kHz，解码时也应该使用16kHz
    
    Returns:
        解码后的音频数据（numpy数组）
    """
    try:
        # 读取头部信息（帧大小信息）
        if len(opus_data) < 2:
            raise ValueError("Opus 数据太短，无法读取头部信息")
        
        # 读取帧数量（前2字节）
        num_frames = int.from_bytes(opus_data[0:2], 'big')
        
        # 读取每帧的大小（接下来的 2*num_frames 字节）
        if len(opus_data) < 2 + 2 * num_frames:
            raise ValueError("Opus 数据不完整，无法读取帧大小信息")
        
        frame_sizes = []
        for i in range(num_frames):
            frame_size_bytes = opus_data[2 + i * 2:2 + (i + 1) * 2]
            frame_size = int.from_bytes(frame_size_bytes, 'big')
            frame_sizes.append(frame_size)
        
        # 计算数据部分的起始位置
        header_size = 2 + 2 * num_frames
        opus_data_only = opus_data[header_size:]
        
        # 创建 Opus 解码器
        # Opus 解码器参数：采样率，声道数 1（单声道）
        decoder = opuslib.Decoder(sample_rate, 1)
        
        # Opus 帧大小（20ms @ 16kHz = 320 samples），与编码时一致
        frame_size = 320
        
        # 存储解码后的 PCM 数据
        decoded_audio = []
        
        # 使用记录的帧大小逐帧解码
        offset = 0
        for frame_size_bytes in frame_sizes:
            if offset + frame_size_bytes > len(opus_data_only):
                logger.warning(f"帧数据不完整，期望 {frame_size_bytes} 字节，但只有 {len(opus_data_only) - offset} 字节")
                break
            
            frame_data = opus_data_only[offset:offset + frame_size_bytes]
            
            try:
                # 解码这一帧
                decoded_frame = decoder.decode(frame_data, frame_size)
                
                if decoded_frame and len(decoded_frame) > 0:
                    # 将字节数据转换回 numpy 数组
                    frame_array = np.frombuffer(decoded_frame, dtype=np.int16)
                    decoded_audio.append(frame_array)
                else:
                    logger.warning(f"帧解码后为空，帧大小: {frame_size_bytes} 字节")
            except Exception as e:
                logger.warning(f"解码帧失败: {str(e)}, 帧大小: {frame_size_bytes} 字节")
            
            offset += frame_size_bytes
        
        if not decoded_audio:
            raise ValueError("无法解码 Opus 数据，可能数据格式不正确或为空")
        
        # 合并所有解码后的帧
        audio_int16 = np.concatenate(decoded_audio)
        
        # 转换为 float32 格式（-1.0 到 1.0）
        audio_float = audio_int16.astype(np.float32) / 32768.0

        return audio_float
            
    except Exception as e:
        logger.error(f"Opus 解码失败: {str(e)}")
        raise Exception(f"Opus 解码失败: {str(e)}")