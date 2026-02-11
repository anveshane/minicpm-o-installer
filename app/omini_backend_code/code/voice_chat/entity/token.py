# Pydantic模型定义
from typing import Optional, Dict
from pydantic import BaseModel


class ModelConfig(BaseModel):
    media_type: Optional[str] = None
    audio_prompt_text: Optional[str] = None
    task_prompt_text: Optional[str] = None
    timbre_id: Optional[int] = None
    checkpoint_id: Optional[int] = None

class LoginRequest(BaseModel):
    userId: Optional[str] = "default_user"
    modelType: Optional[str] = "simplex"
    serviceName: Optional[str] = None
    durVadTime: Optional[float] = 0.4
    durVadThreshold: Optional[float] = 0.1
    vadRace: Optional[bool] = False
    sessionId: Optional[str] = None
    sessionType: Optional[str] = None
    saveData: Optional[bool] = True
    modelConfig: Optional[ModelConfig] = ModelConfig()
    highRefresh: Optional[bool] = False
    # 高清图片
    highImage: Optional[bool] = False
    language: Optional[str] = None

    # 克隆音色
    timbreId: Optional[int] = None
    base64String: Optional[str] = None
    audioFormat: Optional[str] = "wav"

class LoginResponse(BaseModel):
    success: bool
    userId: Optional[str] = None
    sessionId: Optional[str] = None
    token: Optional[str] = None
    message: str
    expires_in: Optional[int] = None

class LogoutRequest(BaseModel):
    userId: str
    token: str

class LogoutResponse(BaseModel):
    success: bool
    message: str

class StatusResponse(BaseModel):
    success: bool
    tokens: Dict

class HealthResponse(BaseModel):
    success: bool
    message: str
    timestamp: str

class SessionFeedbackRequest(BaseModel):
    userId: str
    sessionId: str
    cancel: Optional[bool] = False
    like: Optional[bool] = False
    feedback: Optional[str] = None

class SessionFeedbackResponse(BaseModel):
    success: bool
    message: str