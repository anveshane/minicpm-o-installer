"""
FastAPI 路由定义
"""
import datetime
import os
import threading
from fastapi import APIRouter, Depends, HTTPException, Query, Path
import uuid

import random
import requests

from common.utils.audio_converter_util import convert_audio_to_wav_base64
from .entity.token import LoginRequest, LoginResponse, LogoutResponse, LogoutRequest
from .robot_service import room_start_monitor

from services.inference_service_manager import InferenceService, get_service_manager
from livekit import api
import asyncio
from enhanced_logging_config import get_enhanced_logger

# 导入配置系统
from config import get_livekit_settings

# 获取日志器
logger = get_enhanced_logger('voice_chat')

router = APIRouter()

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """登录接口 - 获取一个可用的token"""
    lock_service_id = None
    try:
        logger.info(f"登录请求: {request}")
        # 获取可用的推理服务
        inference_service_manager = await get_service_manager()
        inference_services = await inference_service_manager.get_available_services(model_type=request.modelType, session_type=request.sessionType, service_name=request.serviceName)
        if not inference_services:
            raise HTTPException(status_code=503, detail="没有可用的推理服务")
        inference_service: InferenceService = inference_services[0]
        user_id = str(uuid.uuid4())
        sessionId = f"{user_id}{random.randint(1, 100)}"
        user_name = f"{user_id}_name"
        
        token = getToken(user_id, user_name, sessionId)
        if not token:
            raise HTTPException(status_code=503, detail="没有可用的token")
        # 锁定推理服务
        locked_service = await inference_service_manager.lock_service(inference_service.service_id, user_id)
        if locked_service is None:
            raise HTTPException(status_code=503, detail="无法锁定推理服务")
        inference_service = locked_service  # 使用锁定后的服务对象
        lock_service_id = inference_service.service_id
        # 注册机器人的token
        robot_token = getToken(str(uuid.uuid4()), str(uuid.uuid4()), sessionId)
        if not robot_token:
            raise HTTPException(status_code=503, detail="无法创建机器人token")
        request.userId = user_id
        request.sessionId = sessionId
        timbreBase64 = None
        # 用户音色转换为wav格式
        if request.base64String is not None:
            timbreBase64 = convert_audio_to_wav_base64(request.base64String, request.audioFormat)
            request.base64String = timbreBase64
        # 异步启动机器人监听服务
        asyncio.create_task(room_start_monitor(sessionId, robot_token, request, inference_service, inference_service_manager))
        logger.info(f"启动机器人监听服务: room_name={sessionId}")
        
        return LoginResponse(
            success=True,
            userId=user_id,
            sessionId=sessionId,
            token=token,
            message="登录成功",
            expires_in=600
        )
    except Exception as e:
        logger.error(f"登录失败: {str(e)}")
        if lock_service_id:
            await inference_service_manager.release_service_lock(lock_service_id, user_id)
        raise HTTPException(status_code=500, detail=f"登录失败: {str(e)}")

@router.post("/logout", response_model=LogoutResponse)
async def logout(request: LogoutRequest):
    """登出接口 - 释放指定的token"""
    try:
        # 根据user_id释放推理服务锁定
        inference_service_manager = await get_service_manager()
        all_services = await inference_service_manager.get_all_services()
        released = False
        for service in all_services:
            if service.locked_by and service.locked_by == request.userId:
                await inference_service_manager.release_service_lock(service.service_id, request.userId)
                logger.info(f"注销推理服务: {service.service_id} (用户: {request.userId})")
                released = True
                break
        if not released:
            # 单服务模式：如果只有一个服务且是 busy，直接释放
            busy_services = [s for s in all_services if s.status.value == 'busy']
            if len(busy_services) == 1:
                await inference_service_manager.release_service_lock(busy_services[0].service_id, busy_services[0].locked_by)
                logger.info(f"强制释放唯一繁忙服务: {busy_services[0].service_id}")
                released = True
            else:
                logger.warning(f"用户 {request.userId} 没有占用推理服务，跳过释放")
        return LogoutResponse(
                success=True,
                message="登出成功"
            )
    except Exception as e:
        logger.error(f"登出失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"登出失败: {str(e)}")


async def restart_model(ip: str, port: int) -> dict:
    """重启模型"""
    try:
        url = f"http://{ip}:{port}/restart"
        response = requests.post(url)
        if response.status_code == 200:
            return {"message": "OK"}
        else:
            raise HTTPException(status_code=500, detail=f"模型重启失败: {response.text}")   
    except Exception as e:
        logger.error(f"模型重启失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"模型重启失败: {str(e)}")

# 获取系统时间
@router.get("/get_system_time")
async def get_system_time():
    """获取系统时间"""
    return {"time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")}


def getToken(user_id: str, user_name: str, room_name: str) -> str:
    """获取 LiveKit 访问令牌"""
    try:
        # 从配置系统获取LiveKit配置
        livekit_config = get_livekit_settings()
        
        # 验证配置
        if not livekit_config.api_key or not livekit_config.api_secret:
            logger.error("LiveKit API Key 或 API Secret 未配置")
            raise ValueError("LiveKit API Key 或 API Secret 未配置，请在 config/{env}.yaml 中配置")
        
        # 创建访问令牌
        token = api.AccessToken(livekit_config.api_key, livekit_config.api_secret) \
            .with_identity(user_id) \
            .with_name(user_name) \
            .with_ttl(datetime.timedelta(hours=24)) \
            .with_grants(api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True
            ))
        return token.to_jwt()
    except Exception as e:
        logger.error(f"获取LiveKit访问令牌失败: {str(e)}")
        return None

def run_async_in_thread(target, args=(), kwargs={}, daemon=True) -> threading.Thread:
    """
    在新线程中运行协程的包装函数
    Args:
        target: 要运行的协程函数
        args: 要传递给协程函数的参数
        kwargs: 要传递给协程函数的关键字参数
        daemon: 是否为守护线程
    Returns:
        threading.Thread: 返回新线程对象（未启动，需要调用 start()）
    """
    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(target(*args, **kwargs))
        except Exception as e:
            logger.error(f"线程中运行协程失败: {e}", exc_info=True)
        finally:
            # 等待所有任务完成后再关闭
            pending = asyncio.all_tasks(loop)
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.close()
    
    thread = threading.Thread(target=_run, daemon=daemon)
    return thread