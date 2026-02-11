"""
推理服务管理器
基于Redis实现推理服务的注册、心跳监控、资源锁定等功能
使用单个Redis Set集合管理所有服务状态
"""

import asyncio
import json
import os
import random
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from enum import Enum

import aiohttp

from common.enums.model_type import ModelType
from common.redis.redis_client import get_redis_client
from enhanced_logging_config import get_enhanced_logger
from config.settings import get_inference_service_settings

logger = get_enhanced_logger('inference_service_manager')


class ServiceStatus(Enum):
    """服务状态枚举"""
    AVAILABLE = "available"      # 可用
    BUSY = "busy"               # 忙碌（被占用）
    OFFLINE = "offline"         # 离线


@dataclass
class InferenceService:
    """推理服务信息"""
    service_id: str
    ip: str
    port: int
    model_port: int
    service_name: str
    model_type: str
    session_type: str
    status: ServiceStatus
    heartbeat_time: datetime
    locked_by: Optional[str] = None  # 被哪个用户锁定
    lock_time: Optional[datetime] = None
    create_time: datetime = None
    
    def __post_init__(self):
        if self.create_time is None:
            self.create_time = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'service_id': self.service_id,
            'ip': self.ip,
            'port': self.port,
            'model_port': self.model_port,
            'service_name': self.service_name,
            'model_type': self.model_type,
            'session_type': self.session_type,
            'status': self.status.value,
            'heartbeat_time': self.heartbeat_time.isoformat(),
            'locked_by': self.locked_by,
            'lock_time': self.lock_time.isoformat() if self.lock_time else None,
            'create_time': self.create_time.isoformat() if self.create_time else None
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'InferenceService':
        """从字典创建实例"""
        return cls(
            service_id=data['service_id'],
            ip=data['ip'],
            port=data['port'],
            model_port=data['model_port'],
            service_name=data['service_name'],
            model_type=data.get('model_type', ''),  # 兼容旧数据，默认 simplex
            session_type=data.get('session_type', ''),  # 兼容旧数据，默认 single
            status=ServiceStatus(data['status']),
            heartbeat_time=datetime.fromisoformat(data['heartbeat_time']),
            locked_by=data.get('locked_by'),
            lock_time=datetime.fromisoformat(data['lock_time']) if data.get('lock_time') else None,
            create_time=datetime.fromisoformat(data['create_time']) if data.get('create_time') else None
        )




class InferenceServiceManager:
    """推理服务管理器"""
    
    def __init__(self):
        self.redis_client = None
        
        # 从配置文件读取配置
        service_config = get_inference_service_settings()
        self.heartbeat_timeout = service_config.heartbeat_timeout
        self.lock_timeout = service_config.lock_timeout
        self.SERVICES_KEY = service_config.services_key
        
        logger.info(f"推理服务管理器初始化成功, SERVICES_KEY: {self.SERVICES_KEY}")
        
    async def initialize(self):
        """初始化Redis连接"""
        try:
            self.redis_client = await get_redis_client("inference")
            await self.redis_client.connect()
            logger.info("推理服务管理器初始化成功")
            return True
        except Exception as e:
            logger.error(f"推理服务管理器初始化失败: {e}")
            return False
    
    # ==================== 服务注册相关 ====================
    
    async def register_service(self, ip: str, port: int, model_port: int, service_name: str, model_type: str, session_type: str) -> str:
        """
        注册推理服务
        
        Args:
            ip: 服务IP地址
            port: 服务端口
            service_name: 服务名称
            
        Returns:
            服务ID
        """
        try:
            service_id = f"{ip}:{port}"
            
            # 创建服务信息
            service = InferenceService(
                service_id=service_id,
                ip=ip,
                port=port,
                model_port=model_port,
                service_name=service_name,
                model_type=model_type,
                session_type=session_type,
                status=ServiceStatus.AVAILABLE,
                heartbeat_time=datetime.now()
            )
            
            # 存储到Redis Hash中
            await self.redis_client.hset(self.SERVICES_KEY, service_id, json.dumps(service.to_dict()))
            
            logger.info(f"推理服务注册成功: {service_id} ({service_name})")
            return service_id
            
        except Exception as e:
            logger.error(f"注册推理服务失败: {e}")
            raise
    
    async def unregister_service(self, service_id: str) -> bool:
        """
        注销推理服务
        
        Args:
            service_id: 服务ID
            
        Returns:
            是否成功
        """
        try:
            # 获取服务信息
            service_data = await self.redis_client.hget(self.SERVICES_KEY, service_id)
            
            if service_data:
                service_dict = self._parse_service_data(service_data)
                if service_dict:
                    service: InferenceService = InferenceService.from_dict(service_dict)
                    # 从Hash中删除
                    await self.redis_client.hdel(self.SERVICES_KEY, service_id)
                    logger.info(f"推理服务注销成功: {service_id}, 名称: {service.service_name}")
                    return True
            else:
                logger.info(f"服务不存在或已经注销: {service_id}")
                return False
                
        except Exception as e:
            logger.error(f"注销推理服务失败: {e}")
            return False

            
    # ==================== 服务管理相关 ====================
    
    def _parse_service_data(self, service_data: Any) -> Optional[Dict[str, Any]]:
        """
        解析服务数据（处理可能已经反序列化的情况）
        
        Args:
            service_data: 从Redis获取的服务数据（可能是字符串或字典）
            
        Returns:
            解析后的字典，如果解析失败返回None
        """
        if service_data is None:
            return None
        
        try:
            if isinstance(service_data, dict):
                # 已经是字典，直接返回
                return service_data
            elif isinstance(service_data, str):
                # 是字符串，需要反序列化
                return json.loads(service_data)
            else:
                logger.info(f"服务数据格式不正确: {type(service_data)}")
                return None
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"解析服务数据失败: {e}")
            return None
    
    async def get_all_services(self) -> List[InferenceService]:
        """获取所有服务"""
        try:
            services_data = await self.redis_client.hgetall(self.SERVICES_KEY)
            services = []
            
            for _, service_data in services_data.items():
                try:
                    service_dict = self._parse_service_data(service_data)
                    if service_dict is None:
                        continue
                    
                    service = InferenceService.from_dict(service_dict)
                    services.append(service)
                except Exception as e:
                    logger.error(f"解析服务数据失败: {e}")
                    continue
            
            return services
            
        except Exception as e:
            logger.error(f"获取所有服务失败: {e}")
            return []
    
    async def get_service(self, service_id: str) -> Optional[InferenceService]:
        """
        获取单个服务信息
        
        Args:
            service_id: 服务ID
            
        Returns:
            服务信息对象
        """
        try:
            service_data = await self.redis_client.hget(self.SERVICES_KEY, service_id)
            
            if service_data:
                service_dict = self._parse_service_data(service_data)
                if service_dict:
                    return InferenceService.from_dict(service_dict)
            
            return None
            
        except Exception as e:
            logger.error(f"获取服务信息失败: {e}")
            return None
    
    async def update_service(self, service: InferenceService) -> bool:
        """
        更新服务信息
        
        Args:
            service: 服务信息对象
            
        Returns:
            是否成功
        """
        try:
            # 直接更新Hash中的服务信息
            res = await self.redis_client.hset(self.SERVICES_KEY, service.service_id, json.dumps(service.to_dict()))
            # logger.info(f"更新服务信息: {service.service_id}, 状态: {service.status}, 结果: {res}")
            return True
            
        except Exception as e:
            logger.error(f"更新服务信息失败: {e}")
            return False
    
    # ==================== 心跳监控相关 ====================

    async def get_available_services(self, model_type: str = None, session_type: str = None, service_name: str = None) -> List[InferenceService]:
        """
        获取可用的推理服务列表
        
        Returns:
            可用服务列表
        """
        try:
            available_services = []
            all_services = await self.get_all_services()
            for service in all_services:
                # 检查服务是否健康
                if await self.is_service_healthy(service):
                    if service.status == ServiceStatus.AVAILABLE:
                        if service_name is not None and service.service_name != service_name:
                            continue
                        if service.model_type == ModelType.RELEASE.value:
                            available_services.append(service)
                        elif model_type is not None and service.model_type == model_type:
                            if service.session_type == ModelType.RELEASE.value:
                                available_services.append(service)
                            else:
                                if session_type is not None and service.session_type == session_type:
                                    available_services.append(service)
            if len(available_services) > 1:
                # 随机打乱列表，保证每次获取的可用服务列表是随机的
                random.shuffle(available_services)
            return available_services
            
        except Exception as e:
            logger.error(f"获取可用服务列表失败: {e}")
            return []
    
    async def is_service_healthy(self, service: InferenceService) -> bool:
        """
        检查服务是否健康
        
        Args:
            service: 服务信息对象
            
        Returns:
            是否健康
        """
        try:
            time_diff = (datetime.now() - service.heartbeat_time).total_seconds()
            return time_diff <= self.heartbeat_timeout
            
        except Exception as e:
            logger.error(f"检查服务健康状态失败: {e}")
            return False
    
    # ==================== 资源锁定相关 ====================
    
    async def lock_service(self, service_id: str, user_id: str) -> Optional[InferenceService]:
        """
        锁定推理服务
        
        Args:
            service_id: 服务ID
            user_id: 用户ID
            
        Returns:
            成功返回 InferenceService，失败返回 None
        """
        try:
            # 直接获取服务信息
            service_data = await self.redis_client.hget(self.SERVICES_KEY, service_id)
            
            if not service_data:
                logger.info(f"服务不存在: {service_id}")
                return None
            
            service_dict = self._parse_service_data(service_data)
            if not service_dict:
                return None
            
            service = InferenceService.from_dict(service_dict)
            
            # 检查服务是否已被锁定
            if service.status == ServiceStatus.BUSY and service.locked_by != user_id:
                logger.info(f"服务已被其他用户锁定: {service_id}")
                return None
            
            # 锁定服务
            service.status = ServiceStatus.BUSY
            service.locked_by = user_id
            service.lock_time = datetime.now()
            
            await self.update_service(service)
            
            logger.info(f"服务锁定成功: {service_id} -> 用户 {user_id}")
            return service
            
        except Exception as e:
            logger.error(f"锁定服务失败: {e}")
            return None
    
    async def release_service_lock(self, service_id: str, user_id: Optional[str] = None) -> bool:
        """
        释放服务锁定
        
        Args:
            service_id: 服务ID
            user_id: 用户ID（可选，用于验证）
            
        Returns:
            是否成功释放
        """
        try:
            # 直接获取服务信息
            service_data = await self.redis_client.hget(self.SERVICES_KEY, service_id)
            
            if not service_data:
                logger.info(f"服务不存在: {service_id}")
                return False
            
            service_dict = self._parse_service_data(service_data)
            if not service_dict:
                return False
            
            service = InferenceService.from_dict(service_dict)
            
            # 如果指定了用户ID，验证是否为同一用户
            if user_id and service.locked_by != user_id:
                logger.info(f"用户 {user_id} 尝试释放其他用户的锁定 : {service_id}, 服务状态: {service.status}, 锁定用户: {service.locked_by}, 当前用户: {user_id}")
                return False
            
            # 释放锁定
            service.status = ServiceStatus.AVAILABLE
            service.locked_by = None
            service.lock_time = None
            
            await self.update_service(service)
            
            logger.info(f"服务锁定释放成功: {service_id}")
            return True
            
        except Exception as e:
            logger.error(f"释放服务锁定失败: {e}")
            return False
    
    # 资源锁续命功能
    async def renew_service_lock(self, user_id: str, service_id: str) -> bool:
        """
        续命服务锁定
        
        Args:
            service_id: 服务ID
            user_id: 用户ID
        """ 
        try:
            # 直接获取服务信息
            service_data = await self.redis_client.hget(self.SERVICES_KEY, service_id)
            
            if not service_data:
                logger.info(f"服务不存在: {service_id}")
                return False
            service_dict = self._parse_service_data(service_data)
            if not service_dict:
                return False
            
            service = InferenceService.from_dict(service_dict)
            
            # 检查服务是否已被锁定
            if service.status != ServiceStatus.BUSY or service.locked_by != user_id:
                logger.info(f"服务未被锁定或被其他用户锁定: {service_id}, 服务状态: {service.status}, 锁定用户: {service.locked_by}, 当前用户: {user_id}")
                return False
            # 续命服务锁定
            service.lock_time = datetime.now()
            await self.update_service(service)
            logger.info(f"服务锁定续命成功: {service_id}")
            return True
        except Exception as e:
            logger.error(f"续命服务锁定失败: {e}")
            return False
    
    # ==================== 清理和监控任务 ====================
    
    async def _cleanup_expired_locks(self):
        """清理过期的锁定"""
        try:
            services = await self.get_all_services()
            current_time = datetime.now()
            
            for service in services:
                if service.status == ServiceStatus.BUSY and service.lock_time:
                    # 检查锁定是否过期
                    if (current_time - service.lock_time).total_seconds() > self.lock_timeout:
                        logger.info(f"清理过期锁定: {service.service_id} (用户: {service.locked_by})")
                        await self.release_service_lock(service.service_id, service.locked_by)
            
        except Exception as e:
            logger.error(f"清理过期锁定失败: {e}")
    
    async def _cleanup_offline_services(self):
        """清理离线服务"""
        try:
            services = await self.get_all_services()
            
            for service in services:
                # 检查服务健康状态
                if not await self.is_service_healthy(service):
                    if service.status != ServiceStatus.OFFLINE:
                        service.status = ServiceStatus.OFFLINE
                        service.locked_by = None
                        service.lock_time = None
                        await self.update_service(service)
                        logger.info(f"服务离线: {service.service_id}")
            
        except Exception as e:
            logger.error(f"清理离线服务失败: {e}")


# 全局服务管理器实例
_service_manager: Optional[InferenceServiceManager] = None


async def get_service_manager() -> InferenceServiceManager:
    """获取服务管理器实例（单例模式）"""
    global _service_manager
    
    if _service_manager is None:
        _service_manager = InferenceServiceManager()
        await _service_manager.initialize()
    
    return _service_manager
