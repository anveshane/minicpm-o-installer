"""
配置模块 - 类似Spring Boot Profiles的配置体系
通过APP_ENV环境变量激活不同环境的配置
"""
from .settings import (
    Settings,
    get_settings,
    get_redis_settings,
    get_livekit_settings,
    get_server_settings,
    get_logging_settings,
    get_cors_settings,
    get_heartbeat_settings,
    get_inference_service_settings,
    get_voice_chat_settings,
)

__all__ = [
    "Settings",
    "get_settings",
    "get_redis_settings",
    "get_livekit_settings",
    "get_server_settings",
    "get_logging_settings",
    "get_cors_settings",
    "get_heartbeat_settings",
    "get_inference_service_settings",
    "get_voice_chat_settings",
]

