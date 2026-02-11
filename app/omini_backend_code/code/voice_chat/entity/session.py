import asyncio


class SharedSessionState:
    """
    协程间共享的会话状态
    用于在多个协程之间共享可修改的状态变量
    使用 asyncio.Lock 保证协程安全
    """
    def __init__(self, highRefresh: bool = False):
        self.round_count = 1  # 会话轮次
        # 当前图片和音频片对应的id
        self.current_image_audio_id = 1
        self.image_number = 0
        self.highRefresh = highRefresh
        # 协程锁，保护共享状态的修改
        self._lock = asyncio.Lock()
    
    async def increment_round(self) -> int:
        """增加轮次计数（协程安全）"""
        async with self._lock:
            self.round_count += 1
            return self.round_count
    
    async def get_round(self) -> int:
        """获取当前轮次（协程安全）"""
        async with self._lock:
            return self.round_count


    async def increment_image_audio_id(self):
        """增加图片和音频片对应的id（协程安全）"""
        async with self._lock:
            self.current_image_audio_id += 1
            # 重置图片数量
            self.image_number = 0
    
    async def is_max_image_number(self) -> bool:
        """是否达到最大图片数量（协程安全）"""
        async with self._lock:
            if self.highRefresh:
                return self.image_number >= 5
            else:
                return self.image_number >= 1
    
    async def increment_image_number(self):
        """增加图片数量（协程安全）"""
        async with self._lock:
            self.image_number += 1
    
    async def get_current_image_audio_id(self) -> int:
        """获取当前图片和音频片对应的id（协程安全）"""
        async with self._lock:
            return self.current_image_audio_id
    
    async def get_image_number(self) -> int:
        """获取当前图片数量（协程安全）"""
        async with self._lock:
            return self.image_number
