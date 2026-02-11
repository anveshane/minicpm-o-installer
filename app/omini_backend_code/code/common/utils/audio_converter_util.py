"""
音频格式转换工具类
支持将 wav、mp3、m4a 格式的 base64 音频字符串统一转换为 wav 格式的 base64 字符串
"""

import base64
import io
from typing import Literal
from pydub import AudioSegment
import numpy as np
import soundfile as sf

from enhanced_logging_config import get_enhanced_logger

# 获取日志器
logger = get_enhanced_logger('audio_converter_util')

# 支持的音频格式类型
AudioFormat = Literal['wav', 'mp3', 'm4a']


def convert_audio_to_wav_base64(audio_base64: str, source_format: AudioFormat) -> str:
    """
    将指定格式的 base64 音频字符串转换为 wav 格式的 base64 字符串
    
    Args:
        audio_base64: base64 编码的音频字符串
        source_format: 源音频格式，支持 'wav', 'mp3', 'm4a'
    
    Returns:
        转换后的 wav 格式 base64 字符串
        
    Raises:
        ValueError: 当音频格式不支持或转换失败时抛出
    """
    try:
        # 验证音频格式
        supported_formats = ['wav', 'mp3', 'm4a']
        if source_format not in supported_formats:
            raise ValueError(f"不支持的音频格式: {source_format}，支持的格式: {supported_formats}")
        
        logger.info(f"开始转换音频格式: {source_format} -> wav")
        
        # 解码 base64 字符串为字节数据
        audio_bytes = base64.b64decode(audio_base64)
        logger.info(f"解码 base64 数据成功，大小: {len(audio_bytes)} bytes ({len(audio_bytes)/1024:.2f} KB)")
        
        # 如果源格式已经是 wav，直接返回
        if source_format == 'wav':
            logger.info("源格式已经是 wav，直接返回原数据")
            return audio_base64
        
        # 使用 pydub 加载音频数据
        audio_io = io.BytesIO(audio_bytes)
        
        # 根据源格式加载音频
        if source_format == 'mp3':
            audio_segment = AudioSegment.from_mp3(audio_io)
        elif source_format == 'm4a':
            audio_segment = AudioSegment.from_file(audio_io, format='m4a')
        else:
            # 其他格式使用通用加载方法
            audio_segment = AudioSegment.from_file(audio_io, format=source_format)
        
        logger.info(
            f"音频加载成功 - 采样率: {audio_segment.frame_rate}Hz, "
            f"声道数: {audio_segment.channels}, "
            f"时长: {len(audio_segment)/1000:.2f}秒, "
            f"位深度: {audio_segment.sample_width * 8}bit"
        )
        
        # 导出为 wav 格式
        wav_io = io.BytesIO()
        audio_segment.export(
            wav_io,
            format='wav',
            parameters=[
                "-acodec", "pcm_s16le",  # 使用 16-bit PCM 编码
            ]
        )
        
        # 获取 wav 字节数据
        wav_bytes = wav_io.getvalue()
        logger.info(f"转换为 wav 成功，大小: {len(wav_bytes)} bytes ({len(wav_bytes)/1024:.2f} KB)")
        
        # 编码为 base64 字符串
        wav_base64 = base64.b64encode(wav_bytes).decode('utf-8')
        logger.info(f"base64 编码成功，字符串长度: {len(wav_base64)}")
        
        return wav_base64
        
    except Exception as e:
        error_msg = f"音频转换失败 ({source_format} -> wav): {str(e)}"
        logger.error(error_msg)
        raise ValueError(error_msg)


def convert_audio_to_wav_base64_with_params(
    audio_base64: str,
    source_format: AudioFormat,
    target_sample_rate: int = None,
    target_channels: int = None
) -> str:
    """
    将指定格式的 base64 音频字符串转换为 wav 格式的 base64 字符串，并可指定目标采样率和声道数
    
    Args:
        audio_base64: base64 编码的音频字符串
        source_format: 源音频格式，支持 'wav', 'mp3', 'm4a'
        target_sample_rate: 目标采样率（Hz），如 16000, 44100, 48000 等，None 则保持原采样率
        target_channels: 目标声道数，1 为单声道，2 为立体声，None 则保持原声道数
    
    Returns:
        转换后的 wav 格式 base64 字符串
        
    Raises:
        ValueError: 当音频格式不支持或转换失败时抛出
    """
    try:
        # 验证音频格式
        supported_formats = ['wav', 'mp3', 'm4a']
        if source_format not in supported_formats:
            raise ValueError(f"不支持的音频格式: {source_format}，支持的格式: {supported_formats}")
        
        logger.info(
            f"开始转换音频格式: {source_format} -> wav "
            f"(目标采样率: {target_sample_rate or '保持原值'}, "
            f"目标声道数: {target_channels or '保持原值'})"
        )
        
        # 解码 base64 字符串为字节数据
        audio_bytes = base64.b64decode(audio_base64)
        logger.info(f"解码 base64 数据成功，大小: {len(audio_bytes)} bytes ({len(audio_bytes)/1024:.2f} KB)")
        
        # 使用 pydub 加载音频数据
        audio_io = io.BytesIO(audio_bytes)
        
        # 根据源格式加载音频
        if source_format == 'wav':
            audio_segment = AudioSegment.from_wav(audio_io)
        elif source_format == 'mp3':
            audio_segment = AudioSegment.from_mp3(audio_io)
        elif source_format == 'm4a':
            audio_segment = AudioSegment.from_file(audio_io, format='m4a')
        else:
            audio_segment = AudioSegment.from_file(audio_io, format=source_format)
        
        logger.info(
            f"音频加载成功 - 原始采样率: {audio_segment.frame_rate}Hz, "
            f"原始声道数: {audio_segment.channels}, "
            f"时长: {len(audio_segment)/1000:.2f}秒, "
            f"位深度: {audio_segment.sample_width * 8}bit"
        )
        
        # 调整采样率
        if target_sample_rate and target_sample_rate != audio_segment.frame_rate:
            logger.info(f"调整采样率: {audio_segment.frame_rate}Hz -> {target_sample_rate}Hz")
            audio_segment = audio_segment.set_frame_rate(target_sample_rate)
        
        # 调整声道数
        if target_channels and target_channels != audio_segment.channels:
            logger.info(f"调整声道数: {audio_segment.channels} -> {target_channels}")
            audio_segment = audio_segment.set_channels(target_channels)
        
        # 导出为 wav 格式
        wav_io = io.BytesIO()
        audio_segment.export(
            wav_io,
            format='wav',
            parameters=[
                "-acodec", "pcm_s16le",  # 使用 16-bit PCM 编码
            ]
        )
        
        # 获取 wav 字节数据
        wav_bytes = wav_io.getvalue()
        logger.info(f"转换为 wav 成功，大小: {len(wav_bytes)} bytes ({len(wav_bytes)/1024:.2f} KB)")
        
        # 编码为 base64 字符串
        wav_base64 = base64.b64encode(wav_bytes).decode('utf-8')
        logger.info(f"base64 编码成功，字符串长度: {len(wav_base64)}")
        
        return wav_base64
        
    except Exception as e:
        error_msg = f"音频转换失败 ({source_format} -> wav): {str(e)}"
        logger.error(error_msg)
        raise ValueError(error_msg)


def get_audio_info(audio_base64: str, audio_format: AudioFormat) -> dict:
    """
    获取音频信息
    
    Args:
        audio_base64: base64 编码的音频字符串
        audio_format: 音频格式，支持 'wav', 'mp3', 'm4a'
    
    Returns:
        包含音频信息的字典，包括：
        - sample_rate: 采样率（Hz）
        - channels: 声道数
        - duration: 时长（秒）
        - sample_width: 样本宽度（字节）
        - bit_depth: 位深度（bit）
        - size: 音频数据大小（bytes）
    """
    try:
        # 解码 base64 字符串为字节数据
        audio_bytes = base64.b64decode(audio_base64)
        
        # 使用 pydub 加载音频数据
        audio_io = io.BytesIO(audio_bytes)
        
        # 根据格式加载音频
        if audio_format == 'wav':
            audio_segment = AudioSegment.from_wav(audio_io)
        elif audio_format == 'mp3':
            audio_segment = AudioSegment.from_mp3(audio_io)
        elif audio_format == 'm4a':
            audio_segment = AudioSegment.from_file(audio_io, format='m4a')
        else:
            audio_segment = AudioSegment.from_file(audio_io, format=audio_format)
        
        # 构建音频信息字典
        audio_info = {
            'sample_rate': audio_segment.frame_rate,
            'channels': audio_segment.channels,
            'duration': len(audio_segment) / 1000.0,  # 毫秒转秒
            'sample_width': audio_segment.sample_width,
            'bit_depth': audio_segment.sample_width * 8,
            'size': len(audio_bytes)
        }
        
        logger.info(f"音频信息获取成功: {audio_info}")
        return audio_info
        
    except Exception as e:
        error_msg = f"获取音频信息失败: {str(e)}"
        logger.error(error_msg)
        raise ValueError(error_msg)
