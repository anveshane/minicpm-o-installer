"""
内存存储客户端 - 替代 Redis
本地部署模式下使用 Python 字典代替 Redis，零外部依赖
"""

import json
import logging
import asyncio
from typing import Any, Optional, Dict, List

logger = logging.getLogger(__name__)


class RedisClient:
    """内存存储客户端（接口兼容原 Redis 客户端）"""
    
    def __init__(self, key_prefix: str = ""):
        self.key_prefix = key_prefix
        self._store: Dict[str, Any] = {}
        self._hash_store: Dict[str, Dict[str, str]] = {}
        self._connected = True
    
    async def connect(self) -> bool:
        self._connected = True
        logger.info(f"内存存储初始化完成 (prefix={self.key_prefix})")
        return True
    
    async def disconnect(self):
        self._connected = False
        logger.info("内存存储已关闭")
    
    def _format_key(self, key: str) -> str:
        if self.key_prefix:
            return f"{self.key_prefix}:{key}"
        return key
    
    def _serialize_value(self, value: Any) -> str:
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)
    
    def _deserialize_value(self, value: str) -> Any:
        if value is None:
            return None
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
    
    # ==================== 基本操作 ====================
    
    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        formatted_key = self._format_key(key)
        self._store[formatted_key] = self._serialize_value(value)
        return True
    
    async def setnx(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        formatted_key = self._format_key(key)
        if formatted_key in self._store:
            return False
        self._store[formatted_key] = self._serialize_value(value)
        return True
    
    async def get(self, key: str, default: Any = None) -> Any:
        formatted_key = self._format_key(key)
        value = self._store.get(formatted_key)
        if value is None:
            return default
        return self._deserialize_value(value)
    
    async def delete(self, *keys: str) -> int:
        count = 0
        for key in keys:
            formatted_key = self._format_key(key)
            if formatted_key in self._store:
                del self._store[formatted_key]
                count += 1
            if formatted_key in self._hash_store:
                del self._hash_store[formatted_key]
                count += 1
        return count
    
    async def exists(self, key: str) -> bool:
        formatted_key = self._format_key(key)
        return formatted_key in self._store or formatted_key in self._hash_store
    
    async def expire(self, key: str, seconds: int) -> bool:
        return True  # 内存模式忽略过期
    
    async def ttl(self, key: str) -> int:
        return -1
    
    # ==================== 哈希操作 ====================
    
    async def hset(self, key: str, field: str, value: Any) -> bool:
        formatted_key = self._format_key(key)
        if formatted_key not in self._hash_store:
            self._hash_store[formatted_key] = {}
        self._hash_store[formatted_key][field] = self._serialize_value(value)
        return True
    
    async def hget(self, key: str, field: str, default: Any = None) -> Any:
        formatted_key = self._format_key(key)
        hash_data = self._hash_store.get(formatted_key, {})
        value = hash_data.get(field)
        if value is None:
            return default
        return self._deserialize_value(value)
    
    async def hgetall(self, key: str) -> Dict[str, Any]:
        formatted_key = self._format_key(key)
        hash_data = self._hash_store.get(formatted_key, {})
        return {field: self._deserialize_value(value) for field, value in hash_data.items()}
    
    async def hdel(self, key: str, *fields: str) -> int:
        formatted_key = self._format_key(key)
        hash_data = self._hash_store.get(formatted_key, {})
        count = 0
        for field in fields:
            if field in hash_data:
                del hash_data[field]
                count += 1
        return count
    
    # ==================== 其他操作 ====================
    
    async def ping(self) -> bool:
        return True
    
    async def info(self) -> Dict[str, Any]:
        return {
            "redis_version": "memory-store-1.0",
            "uptime_in_seconds": 0,
            "used_memory_human": "0B",
            "connected_clients": 1
        }
    
    async def keys(self, pattern: str = "*") -> List[str]:
        return list(self._store.keys())
    
    async def flushdb(self) -> bool:
        self._store.clear()
        self._hash_store.clear()
        return True


# 全局客户端实例
_redis_client: Optional[RedisClient] = None


async def get_redis_client(key_prefix: str = "") -> RedisClient:
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisClient(key_prefix)
        await _redis_client.connect()
    return _redis_client


async def close_redis_client():
    global _redis_client
    if _redis_client:
        await _redis_client.disconnect()
        _redis_client = None
