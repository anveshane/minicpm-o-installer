"""
VAD模型预加载工具
提供VAD模型的预加载、预热和性能监控功能
"""
import time
import numpy as np
from typing import Tuple

from enhanced_logging_config import get_enhanced_logger
from voice_chat.vad import vad_utils

logger = get_enhanced_logger('vad_preloader')


class VADPreloader:
    """VAD模型预加载器"""
    
    def __init__(self):
        self._model_loaded = False
        self._preload_time = 0.0
        self._warmup_time = 0.0
        self._model = None
    
    def preload_model(self, warmup: bool = True) -> Tuple[bool, dict]:
        """
        预加载VAD模型
        
        Args:
            warmup: 是否进行模型预热测试
            
        Returns:
            (成功标志, 性能统计)
        """
        try:
            logger.info("开始VAD模型预加载...")
            start_time = time.time()
            
            # 导入VAD工具
            from . import vad_utils
            
            # 加载模型
            model_start = time.time()
            self._model = vad_utils.get_vad_model()
            self._preload_time = time.time() - model_start
            
            logger.info(f"VAD模型加载完成，耗时: {self._preload_time*1000:.2f}ms")
            
            # 模型预热
            if warmup:
                self._warmup_model()
            
            self._model_loaded = True
            
            stats = {
                'preload_time': self._preload_time,
                'warmup_time': self._warmup_time,
                'total_time': self._preload_time + self._warmup_time,
                'model_loaded': True
            }
            
            logger.info(f"VAD模型预加载完成，总耗时: {stats['total_time']*1000:.2f}ms")
            return True, stats
            
        except Exception as e:
            logger.error(f"VAD模型预加载失败: {e}")
            return False, {
                'preload_time': 0.0,
                'warmup_time': 0.0,
                'total_time': 0.0,
                'model_loaded': False,
                'error': str(e)
            }
    
    def _warmup_model(self):
        """模型预热测试"""
        try:
            logger.info("开始VAD模型预热测试...")
            warmup_start = time.time()
            
            # 生成测试音频数据
            test_audio = np.random.randn(48000).astype(np.float32)  # 1秒测试音频
            vad_utils.run_vad(test_audio.tobytes(), 48000)
            
            self._warmup_time = time.time() - warmup_start
            logger.info(f"VAD模型预热测试完成，耗时: {self._warmup_time*1000:.2f}ms")
            
        except Exception as e:
            logger.warning(f"VAD模型预热测试失败: {e}")
            self._warmup_time = 0.0
    
    def is_model_loaded(self) -> bool:
        """检查模型是否已加载"""
        return self._model_loaded
    
    def get_performance_stats(self) -> dict:
        """获取性能统计信息"""
        return {
            'model_loaded': self._model_loaded,
            'preload_time': self._preload_time,
            'warmup_time': self._warmup_time,
            'total_time': self._preload_time + self._warmup_time
        }


# 全局预加载器实例
_vad_preloader = VADPreloader()


def preload_vad_model(warmup: bool = True) -> Tuple[bool, dict]:
    """
    预加载VAD模型的便捷函数
    
    Args:
        warmup: 是否进行模型预热测试
        
    Returns:
        (成功标志, 性能统计)
    """
    return _vad_preloader.preload_model(warmup)


def is_vad_model_loaded() -> bool:
    """检查VAD模型是否已加载"""
    return _vad_preloader.is_model_loaded()


def get_vad_performance_stats() -> dict:
    """获取VAD预加载性能统计"""
    return _vad_preloader.get_performance_stats()


def check_vad_model_availability() -> Tuple[bool, str]:
    """
    检查VAD模型可用性
    
    Returns:
        (是否可用, 状态信息)
    """
    try:
        from . import vad_utils
        vad_utils.get_vad_model()
        return True, "VAD模型已预加载，性能优化生效"
    except Exception as e:
        return False, f"VAD模型未预加载: {e}"
