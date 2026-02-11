"""
FastAPI 主应用文件
"""
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import os

from voice_chat.vad.vad_preloader import preload_vad_model

# 加载环境变量（可选，新配置系统会自动处理环境变量）
# load_dotenv()

# 导入新的配置系统
from config import get_settings, get_logging_settings, get_cors_settings, get_server_settings

# 获取配置
settings = get_settings()
log_config = get_logging_settings()
cors_config = get_cors_settings()
server_config = get_server_settings()

# 初始化增强日志系统
from enhanced_logging_config import setup_enhanced_logging, get_enhanced_logger

# 使用配置系统设置日志
setup_enhanced_logging({
    'log_level': log_config.level,
    'enable_console': log_config.enable_console,
    'enable_file': log_config.enable_file,
    'enable_unified_file': log_config.enable_unified_file,
    'max_file_size': log_config.max_file_size,
    'backup_count': log_config.backup_count,
})

# 获取应用日志器
logger = get_enhanced_logger('fastapi')

# Redis服务生命周期管理
from common.redis.redis_client import get_redis_client, close_redis_client

# 全局异步 HTTP 客户端生命周期管理
from common.utils.httpUtil import close_async_http_util

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动事件
    logger.info("应用启动中...")
    try:
        # 初始化内存存储（替代Redis）
        redis_client = await get_redis_client("app")
        logger.info("内存存储初始化完成（本地模式，无需Redis）")
    except Exception as e:
        logger.error(f"内存存储初始化失败: {e}")

    # 预加载VAD模型
    try:
        
        success, stats = preload_vad_model(warmup=True)
        
        if success:
            logger.info(f"VAD模型预加载成功: 加载={stats['preload_time']*1000:.2f}ms, "
                       f"预热={stats['warmup_time']*1000:.2f}ms, "
                       f"总计={stats['total_time']*1000:.2f}ms")
        else:
            logger.error(f"VAD模型预加载失败: {stats.get('error', '未知错误')}")
            logger.warning("VAD模型将在首次使用时加载，可能影响首次检测性能")
            
    except Exception as e:
        logger.error(f"VAD模型预加载异常: {e}")
        logger.warning("VAD模型将在首次使用时加载，可能影响首次检测性能")
    
    # 启动推理服务管理后台任务
    try:
        import asyncio
        from services.heartbeat_monitor import start_heartbeat_monitoring
        
        # 启动心跳监控任务
        asyncio.create_task(start_heartbeat_monitoring())
        logger.info("推理服务心跳监控任务已启动")
        
    except Exception as e:
        logger.error(f"启动推理服务管理任务失败: {e}")
        logger.warning("推理服务管理功能可能不可用")
    
    yield
    
    # 关闭事件
    logger.info("应用关闭中...")
    try:
        # 停止推理服务管理任务
        from services.heartbeat_monitor import stop_heartbeat_monitoring
        
        await stop_heartbeat_monitoring()
        logger.info("推理服务管理任务已停止")
        
    except Exception as e:
        logger.error(f"停止推理服务管理任务时出错: {e}")
    
    # 注意：现在使用 asyncio.to_thread()，无需显式关闭线程池
    
    try:
        # 关闭Redis服务
        await close_redis_client()
        logger.info("Redis服务已关闭")
    except Exception as e:
        logger.error(f"关闭Redis服务时出错: {e}")
    
    try:
        # 关闭全局异步 HTTP 客户端连接池
        await close_async_http_util()
        logger.info("全局异步 HTTP 客户端连接池已关闭")
    except Exception as e:
        logger.error(f"关闭全局异步 HTTP 客户端时出错: {e}")

# 创建 FastAPI 应用（使用配置系统）
app = FastAPI(
    title=settings.app_name,
    description=f"{settings.app_name} FastAPI - Environment: {settings.app_env}",
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS 中间件（使用配置系统）
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_config.allow_origins,
    allow_credentials=cors_config.allow_credentials,
    allow_methods=cors_config.allow_methods,
    allow_headers=cors_config.allow_headers,
)

# 请求追踪中间件
from middleware.request_trace import RequestTraceMiddleware
app.add_middleware(RequestTraceMiddleware)

# 导入路由
from voice_chat.routes import router as voice_chat_router
from api.inference_service_routes import router as inference_service_router

# 注册路由
app.include_router(voice_chat_router, prefix="/api", tags=["token"])
app.include_router(inference_service_router, prefix="/api", tags=["inference-service"])

@app.get("/")
async def root():
    """根路径"""
    logger.info("访问根路径")
    return {
        "message": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """健康检查"""
    logger.info("健康检查请求")
    return {"status": "healthy", "service": "minicpmo-backend"}

@app.get("/health/redis")
async def redis_health_check():
    """存储健康检查（本地模式使用内存存储）"""
    return {
        "status": "healthy",
        "redis": {
            "connected": True,
            "mode": "in-memory",
            "version": "memory-store-1.0",
        },
        "service": "minicpmo-backend"
    }

@app.get("/download/test")
async def download_test_file():
    """下载测试文件 test.txt"""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, "test.txt")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(file_path, media_type="text/plain", filename="test.txt")

if __name__ == "__main__":
    # 使用配置系统获取配置
    # 可以通过环境变量覆盖：export APP_ENV=prod
    
    # 处理日志级别，确保符合uvicorn要求
    log_level = log_config.level.lower()
    valid_log_levels = ["critical", "error", "warning", "info", "debug", "trace"]
    if log_level not in valid_log_levels:
        log_level = "info"
        print(f"⚠️  无效的日志级别，使用默认值: {log_level}")
    
    # 记录应用启动信息
    logger.info(f"=" * 60)
    logger.info(f"启动 {settings.app_name} v{settings.app_version}")
    logger.info(f"=" * 60)
    logger.info(f"环境: {settings.app_env}")
    logger.info(f"监听地址: {server_config.host}:{server_config.port}")
    logger.info(f"调试模式: {server_config.debug}")
    logger.info(f"自动重载: {server_config.reload}")
    logger.info(f"日志级别: {log_level}")
    logger.info(f"=" * 60)
    if server_config.debug:
        os.environ["DEBUG"] = "True"
    try:
        uvicorn.run(
            "main:app",
            host=server_config.host,
            port=server_config.port,
            reload=server_config.reload,
            log_level=log_level,
            workers=server_config.workers if not server_config.reload else 1,  # reload模式下只能单进程
        )
    except Exception as e:
        logger.error(f"应用启动失败: {str(e)}")
        print(f"❌ 应用启动失败: {str(e)}")
        sys.exit(1)