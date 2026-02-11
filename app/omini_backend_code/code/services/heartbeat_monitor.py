"""
心跳监控服务
定时检查推理服务的健康状态，自动清理离线服务
"""

import asyncio
import os
import aiohttp
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json

from services.inference_service_manager import get_service_manager, InferenceServiceManager, ServiceStatus
from enhanced_logging_config import get_enhanced_logger
from config.settings import get_heartbeat_settings

logger = get_enhanced_logger('heartbeat_monitor')


class HeartbeatMonitor:
    """心跳监控器"""
    
    def __init__(self):
        self.manager: Optional[InferenceServiceManager] = None
        
        # 从配置文件读取配置
        heartbeat_config = get_heartbeat_settings()
        self.monitoring_interval = heartbeat_config.monitoring_interval
        self.cleanup_interval = heartbeat_config.cleanup_interval
        self.lock_timeout = heartbeat_config.lock_timeout
        self.lock_key = heartbeat_config.lock_key
        
        self.is_running = False
        logger.info(f"心跳监控器初始化成功, lock_key: {self.lock_key}")
        
    async def initialize(self):
        """初始化监控器"""
        try:
            self.manager = await get_service_manager()
            logger.info("心跳监控器初始化成功")
            return True
        except Exception as e:
            logger.error(f"心跳监控器初始化失败: {e}")
            return False
    
    async def acquire_heartbeat_lock(self) -> bool:
        """
        获取心跳检查分布式锁（使用 SETNX 原子操作）
        
        Returns:
            是否成功获取锁
        """
        try:
            if not self.manager:
                return False
            
            # 使用 SETNX (SET if Not eXists) 原子操作获取锁
            lock_value = f"heartbeat_monitor_{int(time.time())}"
            result = await self.manager.redis_client.setnx(
                self.lock_key, 
                lock_value, 
                ex=self.lock_timeout  # 只在键不存在时设置，原子操作，避免竞态条件
            )
            
            if result:
                logger.info("成功获取心跳检查锁")
                return True
            else:
                logger.info("心跳检查锁已被其他节点持有")
                return False
                
        except Exception as e:
            logger.error(f"获取心跳检查锁失败: {e}")
            return False
    
    async def release_heartbeat_lock(self) -> bool:
        """
        释放心跳检查分布式锁
        
        Returns:
            是否成功释放锁
        """
        try:
            if not self.manager:
                return False
            
            # 删除锁
            result = await self.manager.redis_client.delete(self.lock_key)
            if result:
                logger.info("成功释放心跳检查锁")
                return True
            else:
                logger.info("心跳检查锁不存在或已被释放")
                return False
                
        except Exception as e:
            logger.error(f"释放心跳检查锁失败: {e}")
            return False
    
    async def check_service_health_direct(self, service_id: str, ip: str, port: int) -> bool:
        """
        直接检查服务健康状态(通过HTTP请求)
        
        Args:
            service_id: 服务ID
            ip: 服务IP
            port: 服务端口
            
        Returns:
            是否健康
        """
        try:
            # 构建健康检查URL
            health_url = f"http://{ip}:{port+1}/health"
            
            # 设置超时时间
            timeout = aiohttp.ClientTimeout(total=5)
            
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(health_url) as response:
                    if response.status == 200:
                        # logger.info(f"服务健康检查成功: {service_id}")
                        return True
                    else:
                        logger.info(f"服务健康检查失败: {service_id}, 状态码: {response.status}")
                        return False
                        
        except asyncio.TimeoutError:
            logger.error(f"服务健康检查超时: {service_id}")
            return False
        except Exception as e:
            logger.error(f"服务健康检查异常: {service_id}, 错误: {e}")
            return False
    
    async def monitor_services(self):
        """监控所有服务的健康状态"""
        try:
            if not self.manager:
                logger.error("服务管理器未初始化")
                return
            # 获取所有服务
            services = await self.manager.get_all_services()
            # logger.info(f"开始检查 {len(services)} 个服务的健康状态")
            for service in services:
                try:
                    # 检查服务健康状态
                    is_healthy = await self.check_service_health_direct(
                        service.service_id, 
                        service.ip, 
                        service.port
                    )
                    
                    if not is_healthy:
                        # 服务不健康，标记为离线
                        logger.info(f"服务不健康，标记为离线: {service.service_id}")
                        
                        # 如果服务被锁定，释放锁定
                        if service.locked_by:
                            await self.manager.release_service_lock(service.service_id, service.locked_by)
                            logger.info(f"释放离线服务的锁定: {service.service_id}")

                        # 如果上次服务已经是离线就从服务列表中移除
                        if service.status == ServiceStatus.OFFLINE:
                            await self.manager.unregister_service(service.service_id)
                            logger.info(f"从服务列表中移除离线服务: {service.service_id}")
                        else:
                            # 更新服务状态为离线
                            service.status = ServiceStatus.OFFLINE
                            await self.manager.update_service(service)
                    else:
                        # 服务健康，根据当前状态处理
                        if service.status == ServiceStatus.OFFLINE:
                            # 离线服务恢复，改为可用状态
                            logger.info(f"服务离线恢复为可用: {service.service_id}")
                            service.heartbeat_time = datetime.now()
                            service.status = ServiceStatus.AVAILABLE
                            service.locked_by = None
                            service.lock_time = None
                            await self.manager.update_service(service)
                        else:
                            # AVAILABLE 或 BUSY 状态，重新读取最新状态再更新
                            # 避免覆盖并发修改的状态
                            current_service = await self.manager.get_service(service.service_id)
                            if current_service:
                                # 只更新心跳时间，保持其他字段不变
                                current_service.heartbeat_time = datetime.now()
                                await self.manager.update_service(current_service)
                                # logger.info(f"服务健康检查通过: {service.service_id}, 状态: {current_service.status}")
                            else:
                                logger.info(f"服务已被移除: {service.service_id}")
                    
                except Exception as e:
                    logger.error(f"监控服务 {service.service_id} 失败: {e}")
            
            # logger.info("心跳检查完成")
        except Exception as e:
            logger.error(f"监控服务失败: {e}")
    
    async def cleanup_expired_resources(self):
        """清理过期资源"""
        try:
            if not self.manager:
                return
            
            # 清理过期锁定
            await self.manager._cleanup_expired_locks()
            
            # 清理离线服务
            # await self.manager._cleanup_offline_services()
            
        except Exception as e:
            logger.error(f"清理过期资源失败: {e}")
    
    async def start_monitoring(self):
        """启动监控（多节点分布式锁模式）"""
        try:
            if not await self.initialize():
                return
            
            self.is_running = True
            logger.info("心跳监控器启动（分布式锁模式）")
            
            last_cleanup = datetime.now()

            lock_acquired = False
            while self.is_running:
                try:
                    # 尝试获取分布式锁
                    lock_acquired = await self.acquire_heartbeat_lock()
                    if not lock_acquired:
                        logger.info("心跳检查锁被其他节点持有，跳过本次检查")
                        continue
                    # 监控服务（使用分布式锁）
                    await self.monitor_services()
                    
                    # 定期清理过期资源（只有持有锁的节点才执行）
                    now = datetime.now()
                    if (now - last_cleanup).total_seconds() >= self.cleanup_interval:
                        # 尝试获取清理锁
                        await self.cleanup_expired_resources()
                        last_cleanup = now
                        logger.info("过期资源清理完成")
                    
                except Exception as e:
                    logger.error(f"监控循环异常: {e}")
                finally:
                    if lock_acquired:
                        await self.release_heartbeat_lock()
                        lock_acquired = False
                    # 等待下次监控（5秒间隔）
                    await asyncio.sleep(self.monitoring_interval)
                    
        except Exception as e:
            logger.error(f"启动监控失败: {e}")
        finally:
            self.is_running = False
            logger.info("心跳监控器停止")
    
    async def stop_monitoring(self):
        """停止监控"""
        self.is_running = False
        logger.info("心跳监控器停止请求")


# 全局监控器实例
_heartbeat_monitor: Optional[HeartbeatMonitor] = None


async def get_heartbeat_monitor() -> HeartbeatMonitor:
    """获取心跳监控器实例（单例模式）"""
    global _heartbeat_monitor
    
    if _heartbeat_monitor is None:
        _heartbeat_monitor = HeartbeatMonitor()
    
    return _heartbeat_monitor


async def start_heartbeat_monitoring():
    """启动心跳监控（在应用启动时调用）"""
    try:
        monitor = await get_heartbeat_monitor()
        await monitor.start_monitoring()
    except Exception as e:
        logger.error(f"启动心跳监控失败: {e}")


async def stop_heartbeat_monitoring():
    """停止心跳监控（在应用关闭时调用）"""
    try:
        monitor = await get_heartbeat_monitor()
        await monitor.stop_monitoring()
    except Exception as e:
        logger.error(f"停止心跳监控失败: {e}")
