"""
推理服务管理API路由
基于Redis的推理服务注册、心跳、锁定等功能
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from services.inference_service_manager import get_service_manager, InferenceServiceManager
from enhanced_logging_config import get_enhanced_logger

logger = get_enhanced_logger('inference_service_api')

router = APIRouter(prefix="/inference", tags=["inference-service"])


# ==================== 请求/响应模型 ====================

class ServiceRegisterRequest(BaseModel):
    """服务注册请求"""
    ip: str = Field(..., description="服务IP地址")
    port: int = Field(..., description="服务端口")
    model_port: int = Field(..., description="模型端口")
    service_name: str = Field(..., description="服务名称")
    model_type: str = Field(..., description="模型类型")
    session_type: str = Field(..., description="会话类型")


class ServiceRegisterResponse(BaseModel):
    """服务注册响应"""
    service_id: str = Field(..., description="服务ID")
    message: str = Field(..., description="响应消息")


class ServiceInfo(BaseModel):
    """服务信息"""
    service_id: str = Field(..., description="服务ID")
    ip: str = Field(..., description="服务IP")
    port: int = Field(..., description="服务端口")
    model_port: int = Field(..., description="模型端口")
    service_name: str = Field(..., description="服务名称")
    model_type: str = Field(..., description="模型类型")
    session_type: str = Field(..., description="会话类型")
    status: str = Field(..., description="服务状态")
    heartbeat_time: Optional[datetime] = Field(None, description="心跳时间")
    locked_by: Optional[str] = Field(None, description="被锁定用户")
    lock_time: Optional[datetime] = Field(None, description="锁定时间")


class ServiceListResponse(BaseModel):
    """服务列表响应"""
    services: List[ServiceInfo] = Field(..., description="服务列表")
    total: int = Field(..., description="总数量")


# ==================== 服务注册相关接口 ====================

@router.post("/register", response_model=ServiceRegisterResponse, summary="注册推理服务")
async def register_service(
    request: ServiceRegisterRequest,
    manager: InferenceServiceManager = Depends(get_service_manager)
):
    """注册推理服务"""
    try:
        service_id = await manager.register_service(
            ip=request.ip,
            port=request.port,
            model_port=request.model_port,
            service_name=request.service_name,
            model_type=request.model_type,
            session_type=request.session_type
        )
        
        logger.info(f"推理服务注册成功: {service_id}")
        return ServiceRegisterResponse(
            service_id=service_id,
            message="服务注册成功"
        )
        
    except Exception as e:
        logger.error(f"注册推理服务失败: {e}")
        raise HTTPException(status_code=500, detail=f"注册服务失败: {str(e)}")


@router.delete("/unregister/{service_id}", summary="注销推理服务")
async def unregister_service(
    service_id: str = Path(..., description="服务ID"),
    manager: InferenceServiceManager = Depends(get_service_manager)
):
    """注销推理服务"""
    try:
        success = await manager.unregister_service(service_id)
        
        if success:
            logger.info(f"推理服务注销成功: {service_id}")
            return {"message": "服务注销成功"}
        else:
            raise HTTPException(status_code=404, detail="服务不存在或注销失败")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"注销推理服务失败: {e}")
        raise HTTPException(status_code=500, detail=f"注销服务失败: {str(e)}")

# ==================== 服务列表相关接口 ====================

@router.get("/services", response_model=ServiceListResponse, summary="获取服务列表")
async def get_services(
    available_only: bool = Query(False, description="仅显示可用服务"),
    manager: InferenceServiceManager = Depends(get_service_manager)
):
    """获取服务列表"""
    try:
        if available_only:
            services = await manager.get_available_services()
        else:
            services = await manager.get_all_services() 
        
        service_list = []
        for service in services:
            service_info = ServiceInfo(
                service_id=service.service_id,
                ip=service.ip,
                port=service.port,
                model_port=service.model_port,
                service_name=service.service_name,
                model_type=service.model_type,
                session_type=service.session_type,
                status=service.status.value,
                heartbeat_time=service.heartbeat_time,
                locked_by=service.locked_by,
                lock_time=service.lock_time
            )
            service_list.append(service_info)
        
        return ServiceListResponse(
            services=service_list,
            total=len(service_list)
        )
        
    except Exception as e:
        logger.error(f"获取服务列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取服务列表失败: {str(e)}")