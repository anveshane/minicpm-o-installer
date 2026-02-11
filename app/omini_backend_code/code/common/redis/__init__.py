"""
Redis包初始化文件
提供简化的Redis客户端，支持阿里云Redis
"""

from .redis_client import RedisClient, get_redis_client, close_redis_client

__all__ = [
    'RedisClient',
    'get_redis_client',
    'close_redis_client'
]