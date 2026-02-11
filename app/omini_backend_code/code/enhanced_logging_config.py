"""
增强的日志配置
包含统一日志记录和请求追踪功能
"""
import os
import logging
import logging.handlers
import uuid
import time
from pathlib import Path
from typing import Optional, Dict, Any
from contextvars import ContextVar
from datetime import datetime
import inspect

try:
    from concurrent_log_handler import ConcurrentRotatingFileHandler
    CONCURRENT_LOG_HANDLER_AVAILABLE = True
except ImportError:
    CONCURRENT_LOG_HANDLER_AVAILABLE = False
    import warnings
    warnings.warn(
        "concurrent-log-handler is not installed. "
        "Multi-process logging may not be safe. "
        "Install with: pip install concurrent-log-handler"
    )

# 请求追踪上下文变量
request_id_var: ContextVar[Optional[str]] = ContextVar('request_id', default=None)
user_id_var: ContextVar[Optional[str]] = ContextVar('user_id', default=None)
session_id_var: ContextVar[Optional[str]] = ContextVar('session_id', default=None)

class RequestTraceFilter(logging.Filter):
    """请求追踪过滤器"""
    
    def filter(self, record):
        # 添加请求追踪信息
        record.request_id = request_id_var.get() or 'N/A'
        record.user_id = user_id_var.get() or 'N/A'
        record.session_id = session_id_var.get() or 'N/A'
        
        # 添加时间戳
        record.timestamp = datetime.now().isoformat()
        
        return True

class BusinessContextFilter(logging.Filter):
    """业务上下文过滤器 - 显示真正的业务代码位置"""
    
    def filter(self, record):
        # 获取调用栈信息
        frame = inspect.currentframe()
        try:
            # 向上查找，跳过日志相关的调用
            for _ in range(10):  # 最多向上查找10层
                frame = frame.f_back
                if frame is None:
                    break
                
                # 获取文件名和函数名
                filename = frame.f_code.co_filename
                function_name = frame.f_code.co_name
                line_number = frame.f_lineno
                
                # 跳过日志相关的文件
                if any(skip in filename for skip in ['logging', 'enhanced_logging_config', 'unified_logger']):
                    continue
                
                # 跳过中间件文件（除非是业务逻辑）
                if 'middleware' in filename and 'request_trace' in filename:
                    continue
                
                # 找到业务代码位置
                record.business_file = os.path.basename(filename)
                record.business_function = function_name
                record.business_line = line_number
                break
            else:
                # 如果没找到合适的业务代码位置，使用原始位置
                record.business_file = os.path.basename(record.filename)
                record.business_function = record.funcName
                record.business_line = record.lineno
        finally:
            del frame
        
        # 确保所有必需的字段都存在
        if not hasattr(record, 'business_file'):
            record.business_file = os.path.basename(record.filename)
        if not hasattr(record, 'business_function'):
            record.business_function = record.funcName
        if not hasattr(record, 'business_line'):
            record.business_line = record.lineno
        
        return True

class EnhancedFormatter(logging.Formatter):
    """增强的日志格式化器"""
    
    def __init__(self, include_trace=True, include_business_context=True):
        self.include_trace = include_trace
        self.include_business_context = include_business_context
        super().__init__()
    
    def format(self, record):
        # 基础格式
        if self.include_trace and self.include_business_context:
            fmt = (
                "%(asctime)s - %(name)s - %(levelname)s - "
                "[%(request_id)s|%(user_id)s|%(session_id)s] - "
                "%(business_file)s:%(business_line)d:%(business_function)s - %(message)s"
            )
        elif self.include_trace:
            fmt = (
                "%(asctime)s - %(name)s - %(levelname)s - "
                "[%(request_id)s|%(user_id)s|%(session_id)s] - "
                "%(filename)s:%(lineno)d - %(message)s"
            )
        else:
            fmt = (
                "%(asctime)s - %(name)s - %(levelname)s - "
                "%(filename)s:%(lineno)d - %(message)s"
            )
        
        formatter = logging.Formatter(fmt)
        return formatter.format(record)

class UnifiedLogHandler(logging.Handler):
    """统一日志处理器 - 将所有日志写入一个文件"""
    
    def __init__(self, log_file: str, max_bytes: int = 50 * 1024 * 1024, backup_count: int = 50):
        super().__init__()
        self.log_file = log_file
        
        # 使用多进程安全的日志处理器
        if CONCURRENT_LOG_HANDLER_AVAILABLE:
            self.handler = ConcurrentRotatingFileHandler(
                log_file,
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding='utf-8',
                use_gzip=False  # 不压缩旧日志文件
            )
        else:
            # 降级到标准的 RotatingFileHandler（不支持多进程）
            self.handler = logging.handlers.RotatingFileHandler(
                log_file,
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding='utf-8'
            )
        
        self.handler.setFormatter(EnhancedFormatter(include_business_context=True))
        self.addFilter(RequestTraceFilter())
        self.addFilter(BusinessContextFilter())
    
    def emit(self, record):
        # 统一处理所有级别的日志
        self.handler.emit(record)

class EnhancedLogger:
    """增强的日志管理器"""
    
    _initialized = False
    _loggers = {}
    
    @classmethod
    def setup_logging(cls, 
                      log_dir: str = None,
                      log_level: str = 'INFO',
                      enable_console: bool = True,
                      enable_file: bool = True,
                      enable_unified_file: bool = True,
                      max_file_size: int = 10 * 1024 * 1024,
                      backup_count: int = 5):
        """设置增强的日志配置"""
        
        if cls._initialized:
            return
        
        # 设置日志目录
        if log_dir is None:
            log_dir = Path(__file__).parent / 'logs'
        else:
            log_dir = Path(log_dir)
        
        log_dir.mkdir(exist_ok=True)
        
        # 获取日志级别
        level = getattr(logging, log_level.upper(), logging.INFO)
        
        # 清除现有的处理器
        root_logger = logging.getLogger()
        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)
        
        # 控制台处理器
        if enable_console:
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(EnhancedFormatter(include_business_context=True))
            console_handler.addFilter(RequestTraceFilter())
            console_handler.addFilter(BusinessContextFilter())
            root_logger.addHandler(console_handler)
        
        # 统一文件处理器（包含所有级别的日志）
        if enable_unified_file:
            unified_handler = UnifiedLogHandler(
                log_dir / 'app.log',
                max_file_size,
                backup_count
            )
            root_logger.addHandler(unified_handler)
        
        # 错误日志处理器（仅ERROR和CRITICAL级别）
        if enable_file:
            # 使用多进程安全的日志处理器
            if CONCURRENT_LOG_HANDLER_AVAILABLE:
                error_handler = ConcurrentRotatingFileHandler(
                    log_dir / 'error.log',
                    maxBytes=max_file_size // 2,  # 25MB（主日志的一半）
                    backupCount=backup_count,
                    encoding='utf-8',
                    use_gzip=False
                )
            else:
                error_handler = logging.handlers.RotatingFileHandler(
                    log_dir / 'error.log',
                    maxBytes=max_file_size // 2,
                    backupCount=backup_count,
                    encoding='utf-8'
                )
            
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(EnhancedFormatter(include_business_context=True))
            error_handler.addFilter(RequestTraceFilter())
            error_handler.addFilter(BusinessContextFilter())
            root_logger.addHandler(error_handler)
        
        # 设置根日志级别
        root_logger.setLevel(level)
        
        # 配置特定模块的日志级别
        cls._configure_module_loggers()
        
        cls._initialized = True
    
    @classmethod
    def _configure_module_loggers(cls):
        """配置特定模块的日志级别"""
        module_configs = {
            'uvicorn': logging.INFO,
            'uvicorn.access': logging.INFO,
            'fastapi': logging.INFO,
            'sqlalchemy': logging.WARNING,
            'pymysql': logging.WARNING,
            'voice_chat': logging.INFO,
            'model_service': logging.INFO,
            'enhanced_logger': logging.INFO,
        }
        
        for module, level in module_configs.items():
            logger = logging.getLogger(module)
            logger.setLevel(level)
    
    @classmethod
    def get_logger(cls, name: str) -> logging.Logger:
        """获取日志器"""
        if not cls._initialized:
            cls.setup_logging()
        
        if name not in cls._loggers:
            cls._loggers[name] = logging.getLogger(name)
        
        return cls._loggers[name]
    
    @classmethod
    def set_request_context(cls, request_id: str = None, user_id: str = None, session_id: str = None):
        """设置请求上下文"""
        if request_id is None:
            request_id = str(uuid.uuid4())[:8]
        
        request_id_var.set(request_id)
        if user_id:
            user_id_var.set(user_id)
        if session_id:
            session_id_var.set(session_id)
        
        return request_id
    
    @classmethod
    def clear_request_context(cls):
        """清除请求上下文"""
        request_id_var.set(None)
        user_id_var.set(None)
        session_id_var.set(None)

# 默认配置
DEFAULT_CONFIG = {
    'log_dir': None,
    'log_level': os.getenv('LOG_LEVEL', 'INFO'),
    'enable_console': True,
    'enable_file': True,
    'enable_unified_file': True,
    'max_file_size': 10 * 1024 * 1024,  # 10MB
    'backup_count': 5,
}

def setup_enhanced_logging(config: Dict[str, Any] = None):
    """设置增强的日志配置"""
    if config is None:
        config = DEFAULT_CONFIG.copy()
    
    EnhancedLogger.setup_logging(**config)

def get_enhanced_logger(name: str) -> logging.Logger:
    """获取增强的日志器"""
    return EnhancedLogger.get_logger(name)

def set_request_trace(request_id: str = None, user_id: str = None, session_id: str = None) -> str:
    """设置请求追踪信息"""
    return EnhancedLogger.set_request_context(request_id, user_id, session_id)

def clear_request_trace():
    """清除请求追踪信息"""
    EnhancedLogger.clear_request_context()

# 自动初始化
if os.getenv('AUTO_SETUP_LOGGING', 'True').lower() == 'true':
    setup_enhanced_logging()