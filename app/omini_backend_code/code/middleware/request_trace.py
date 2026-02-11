"""
请求追踪中间件
为每个请求生成唯一的追踪ID
"""
import uuid
import time
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from enhanced_logging_config import set_request_trace, clear_request_trace, get_enhanced_logger

class RequestTraceMiddleware(BaseHTTPMiddleware):
    """请求追踪中间件"""
    
    def __init__(self, app):
        super().__init__(app)
        self.logger = get_enhanced_logger('request_trace')
    
    async def dispatch(self, request: Request, call_next):
        # 生成请求追踪信息
        request_id = str(uuid.uuid4())[:8]
        start_time = time.time()
        
        # 设置请求上下文
        set_request_trace(
            request_id=request_id,
            user_id=self._extract_user_id(request),
            session_id=self._extract_session_id(request)
        )
        
        # 记录请求开始
        self.logger.info(
            f"请求开始: {request.method} {request.url.path} "
            f"from {request.client.host if request.client else 'unknown'}"
        )
        
        try:
            # 处理请求
            response = await call_next(request)
            
            # 计算处理时间
            process_time = time.time() - start_time
            
            # 记录请求完成
            self.logger.info(
                f"请求完成: {request.method} {request.url.path} "
                f"status={response.status_code} "
                f"time={process_time:.3f}s"
            )
            
            # 添加响应头
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = str(process_time)
            
            return response
            
        except Exception as e:
            # 计算处理时间
            process_time = time.time() - start_time
            
            # 记录请求错误
            self.logger.error(
                f"请求错误: {request.method} {request.url.path} "
                f"error={str(e)} time={process_time:.3f}s"
            )
            
            raise
        
        finally:
            # 清除请求上下文
            clear_request_trace()
    
    def _extract_user_id(self, request: Request) -> str:
        """从请求中提取用户ID"""
        # 从请求头中获取用户ID
        user_id = request.headers.get('X-User-ID')
        if user_id:
            return user_id
        
        # 从查询参数中获取用户ID
        user_id = request.query_params.get('user_id')
        if user_id:
            return user_id
        
        # 从认证信息中获取用户ID（如果有的话）
        # 这里可以根据实际的认证方式来实现
        return None
    
    def _extract_session_id(self, request: Request) -> str:
        """从请求中提取会话ID"""
        # 从请求头中获取会话ID
        session_id = request.headers.get('X-Session-ID')
        if session_id:
            return session_id
        
        # 从Cookie中获取会话ID
        session_id = request.cookies.get('session_id')
        if session_id:
            return session_id
        
        return None
