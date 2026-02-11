"""
定时任务调度管理器
基于 APScheduler 提供统一的定时任务管理接口
支持装饰器和方法两种方式注册定时任务
"""

import asyncio
import functools
from typing import Callable, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR, EVENT_JOB_MISSED
from apscheduler.jobstores.memory import MemoryJobStore

from enhanced_logging_config import get_enhanced_logger

logger = get_enhanced_logger('scheduler_manager')


class TriggerType(Enum):
    """触发器类型"""
    INTERVAL = "interval"  # 间隔触发
    CRON = "cron"          # Cron表达式
    DATE = "date"          # 指定日期


class SchedulerManager:
    """定时任务调度管理器（单例模式）"""
    
    _instance: Optional['SchedulerManager'] = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self.scheduler: Optional[AsyncIOScheduler] = None
            self._started = False
            self._jobs: Dict[str, Dict[str, Any]] = {}  # 存储任务信息
            SchedulerManager._initialized = True
    
    def initialize(self, jobstores: Optional[Dict] = None, executors: Optional[Dict] = None):
        """
        初始化调度器
        
        Args:
            jobstores: 任务存储配置（可选，默认使用内存存储）
            executors: 执行器配置（可选，默认使用异步执行器）
        """
        if self.scheduler is not None:
            logger.warning("调度器已经初始化，跳过重复初始化")
            return
        
        try:
            # 默认使用内存存储
            if jobstores is None:
                jobstores = {
                    'default': MemoryJobStore()
                }
            
            # 创建调度器
            # 注意：executors=None 会导致错误，所以只在提供时传递
            scheduler_kwargs = {'jobstores': jobstores}
            if executors is not None:
                scheduler_kwargs['executors'] = executors
            
            self.scheduler = AsyncIOScheduler(**scheduler_kwargs)
            
            # 添加事件监听器
            self.scheduler.add_listener(
                self._job_listener,
                EVENT_JOB_EXECUTED | EVENT_JOB_ERROR | EVENT_JOB_MISSED
            )
            
            logger.info("定时任务调度器初始化成功")
        except Exception as e:
            logger.error(f"初始化调度器失败: {e}")
            raise
    
    def start(self):
        """启动调度器"""
        if self.scheduler is None:
            raise RuntimeError("调度器未初始化，请先调用 initialize()")
        
        if self._started:
            logger.warning("调度器已经启动，跳过重复启动")
            return
        
        try:
            self.scheduler.start()
            self._started = True
            logger.info("定时任务调度器启动成功")
        except Exception as e:
            logger.error(f"启动调度器失败: {e}")
            raise
    
    def shutdown(self, wait: bool = True):
        """关闭调度器"""
        if self.scheduler is None or not self._started:
            return
        
        try:
            self.scheduler.shutdown(wait=wait)
            self._started = False
            logger.info("定时任务调度器已关闭")
        except Exception as e:
            logger.error(f"关闭调度器失败: {e}")
    
    def _job_listener(self, event):
        """任务执行监听器"""
        if event.exception:
            logger.error(
                f"定时任务执行失败 [Job ID: {event.job_id}]: {event.exception}",
                exc_info=event.exception
            )
        elif event.code == EVENT_JOB_MISSED:
            logger.warning(f"定时任务错过执行时间 [Job ID: {event.job_id}]")
        else:
            logger.debug(f"定时任务执行成功 [Job ID: {event.job_id}]")
    
    # ==================== 方法方式添加任务 ====================
    
    def add_interval_job(
        self,
        func: Callable,
        seconds: int = 0,
        minutes: int = 0,
        hours: int = 0,
        days: int = 0,
        job_id: Optional[str] = None,
        max_instances: int = 1,
        replace_existing: bool = True,
        **kwargs
    ) -> str:
        """
        添加间隔触发的定时任务
        
        Args:
            func: 要执行的函数（可以是异步函数）
            seconds: 秒数
            minutes: 分钟数
            hours: 小时数
            days: 天数
            job_id: 任务ID（可选，默认使用函数名）
            max_instances: 最大并发实例数
            replace_existing: 如果任务已存在是否替换
            **kwargs: 传递给函数的额外参数
            
        Returns:
            任务ID
        """
        if self.scheduler is None:
            raise RuntimeError("调度器未初始化，请先调用 initialize()")
        
        if job_id is None:
            job_id = f"{func.__name__}_{id(func)}"
        
        try:
            trigger = IntervalTrigger(seconds=seconds, minutes=minutes, hours=hours, days=days)
            
            self.scheduler.add_job(
                func,
                trigger=trigger,
                id=job_id,
                max_instances=max_instances,
                replace_existing=replace_existing,
                **kwargs
            )
            
            self._jobs[job_id] = {
                'type': 'interval',
                'func': func.__name__,
                'trigger': f"{days}d {hours}h {minutes}m {seconds}s"
            }
            
            logger.info(f"添加间隔任务成功 [Job ID: {job_id}, 间隔: {days}d {hours}h {minutes}m {seconds}s]")
            return job_id
            
        except Exception as e:
            logger.error(f"添加间隔任务失败: {e}")
            raise
    
    def add_cron_job(
        self,
        func: Callable,
        year: Optional[Union[int, str]] = None,
        month: Optional[Union[int, str]] = None,
        day: Optional[Union[int, str]] = None,
        week: Optional[Union[int, str]] = None,
        day_of_week: Optional[Union[int, str]] = None,
        hour: Optional[Union[int, str]] = None,
        minute: Optional[Union[int, str]] = None,
        second: Optional[Union[int, str]] = None,
        job_id: Optional[str] = None,
        max_instances: int = 1,
        replace_existing: bool = True,
        **kwargs
    ) -> str:
        """
        添加Cron触发的定时任务
        
        Args:
            func: 要执行的函数（可以是异步函数）
            year, month, day, week, day_of_week, hour, minute, second: Cron表达式参数
            job_id: 任务ID（可选，默认使用函数名）
            max_instances: 最大并发实例数
            replace_existing: 如果任务已存在是否替换
            **kwargs: 传递给函数的额外参数
            
        Returns:
            任务ID
        """
        if self.scheduler is None:
            raise RuntimeError("调度器未初始化，请先调用 initialize()")
        
        if job_id is None:
            job_id = f"{func.__name__}_{id(func)}"
        
        try:
            trigger = CronTrigger(
                year=year, month=month, day=day, week=week,
                day_of_week=day_of_week, hour=hour, minute=minute, second=second
            )
            
            self.scheduler.add_job(
                func,
                trigger=trigger,
                id=job_id,
                max_instances=max_instances,
                replace_existing=replace_existing,
                **kwargs
            )
            
            self._jobs[job_id] = {
                'type': 'cron',
                'func': func.__name__,
                'trigger': f"year={year}, month={month}, day={day}, hour={hour}, minute={minute}"
            }
            
            logger.info(f"添加Cron任务成功 [Job ID: {job_id}]")
            return job_id
            
        except Exception as e:
            logger.error(f"添加Cron任务失败: {e}")
            raise
    
    def add_date_job(
        self,
        func: Callable,
        run_date: datetime,
        job_id: Optional[str] = None,
        max_instances: int = 1,
        replace_existing: bool = True,
        **kwargs
    ) -> str:
        """
        添加指定日期触发的定时任务
        
        Args:
            func: 要执行的函数（可以是异步函数）
            run_date: 执行日期时间
            job_id: 任务ID（可选，默认使用函数名）
            max_instances: 最大并发实例数
            replace_existing: 如果任务已存在是否替换
            **kwargs: 传递给函数的额外参数
            
        Returns:
            任务ID
        """
        if self.scheduler is None:
            raise RuntimeError("调度器未初始化，请先调用 initialize()")
        
        if job_id is None:
            job_id = f"{func.__name__}_{id(func)}"
        
        try:
            trigger = DateTrigger(run_date=run_date)
            
            self.scheduler.add_job(
                func,
                trigger=trigger,
                id=job_id,
                max_instances=max_instances,
                replace_existing=replace_existing,
                **kwargs
            )
            
            self._jobs[job_id] = {
                'type': 'date',
                'func': func.__name__,
                'trigger': run_date.isoformat()
            }
            
            logger.info(f"添加日期任务成功 [Job ID: {job_id}, 执行时间: {run_date}]")
            return job_id
            
        except Exception as e:
            logger.error(f"添加日期任务失败: {e}")
            raise
    
    # ==================== 任务管理 ====================
    
    def remove_job(self, job_id: str):
        """移除任务"""
        if self.scheduler is None:
            return
        
        try:
            self.scheduler.remove_job(job_id)
            self._jobs.pop(job_id, None)
            logger.info(f"移除任务成功 [Job ID: {job_id}]")
        except Exception as e:
            logger.error(f"移除任务失败 [Job ID: {job_id}]: {e}")
    
    def pause_job(self, job_id: str):
        """暂停任务"""
        if self.scheduler is None:
            return
        
        try:
            self.scheduler.pause_job(job_id)
            logger.info(f"暂停任务成功 [Job ID: {job_id}]")
        except Exception as e:
            logger.error(f"暂停任务失败 [Job ID: {job_id}]: {e}")
    
    def resume_job(self, job_id: str):
        """恢复任务"""
        if self.scheduler is None:
            return
        
        try:
            self.scheduler.resume_job(job_id)
            logger.info(f"恢复任务成功 [Job ID: {job_id}]")
        except Exception as e:
            logger.error(f"恢复任务失败 [Job ID: {job_id}]: {e}")
    
    def get_jobs(self):
        """获取所有任务"""
        if self.scheduler is None:
            return []
        return self.scheduler.get_jobs()
    
    def get_job(self, job_id: str):
        """获取指定任务"""
        if self.scheduler is None:
            return None
        return self.scheduler.get_job(job_id)
    
    @property
    def is_running(self) -> bool:
        """调度器是否运行中"""
        return self._started and self.scheduler is not None and self.scheduler.running


# ==================== 装饰器方式 ====================

def scheduled_job(
    trigger_type: TriggerType = TriggerType.INTERVAL,
    seconds: int = 0,
    minutes: int = 0,
    hours: int = 0,
    days: int = 0,
    job_id: Optional[str] = None,
    max_instances: int = 1,
    **kwargs
):
    """
    定时任务装饰器（间隔触发）
    
    使用示例:
        @scheduled_job(seconds=30)
        async def my_task():
            print("执行任务")
    
    Args:
        trigger_type: 触发器类型
        seconds, minutes, hours, days: 时间间隔
        job_id: 任务ID
        max_instances: 最大并发实例数
        **kwargs: 其他参数
    """
    def decorator(func: Callable):
        # 将任务信息存储到函数的元数据中
        if not hasattr(func, '_scheduled_job_info'):
            func._scheduled_job_info = []
        
        func._scheduled_job_info.append({
            'trigger_type': trigger_type,
            'seconds': seconds,
            'minutes': minutes,
            'hours': hours,
            'days': days,
            'job_id': job_id or func.__name__,
            'max_instances': max_instances,
            'kwargs': kwargs
        })
        
        return func
    return decorator


def cron_job(
    year: Optional[Union[int, str]] = None,
    month: Optional[Union[int, str]] = None,
    day: Optional[Union[int, str]] = None,
    week: Optional[Union[int, str]] = None,
    day_of_week: Optional[Union[int, str]] = None,
    hour: Optional[Union[int, str]] = None,
    minute: Optional[Union[int, str]] = None,
    second: Optional[Union[int, str]] = None,
    job_id: Optional[str] = None,
    max_instances: int = 1,
    **kwargs
):
    """
    定时任务装饰器（Cron触发）
    
    使用示例:
        @cron_job(hour=2, minute=0)
        async def daily_task():
            print("每天凌晨2点执行")
    """
    def decorator(func: Callable):
        if not hasattr(func, '_scheduled_job_info'):
            func._scheduled_job_info = []
        
        func._scheduled_job_info.append({
            'trigger_type': TriggerType.CRON,
            'year': year,
            'month': month,
            'day': day,
            'week': week,
            'day_of_week': day_of_week,
            'hour': hour,
            'minute': minute,
            'second': second,
            'job_id': job_id or func.__name__,
            'max_instances': max_instances,
            'kwargs': kwargs
        })
        
        return func
    return decorator


def register_scheduled_jobs(scheduler_manager: SchedulerManager, *modules):
    """
    注册使用装饰器标注的定时任务
    
    使用示例:
        from services import my_module
        register_scheduled_jobs(scheduler_manager, my_module)
    
    Args:
        scheduler_manager: 调度器管理器实例
        *modules: 要扫描的模块列表
    """
    for module in modules:
        for name in dir(module):
            obj = getattr(module, name)
            if callable(obj) and hasattr(obj, '_scheduled_job_info'):
                for job_info in obj._scheduled_job_info:
                    try:
                        trigger_type = job_info['trigger_type']
                        job_id = job_info['job_id']
                        max_instances = job_info['max_instances']
                        kwargs = job_info.get('kwargs', {})
                        
                        if trigger_type == TriggerType.INTERVAL:
                            scheduler_manager.add_interval_job(
                                obj,
                                seconds=job_info.get('seconds', 0),
                                minutes=job_info.get('minutes', 0),
                                hours=job_info.get('hours', 0),
                                days=job_info.get('days', 0),
                                job_id=job_id,
                                max_instances=max_instances,
                                **kwargs
                            )
                        elif trigger_type == TriggerType.CRON:
                            scheduler_manager.add_cron_job(
                                obj,
                                year=job_info.get('year'),
                                month=job_info.get('month'),
                                day=job_info.get('day'),
                                week=job_info.get('week'),
                                day_of_week=job_info.get('day_of_week'),
                                hour=job_info.get('hour'),
                                minute=job_info.get('minute'),
                                second=job_info.get('second'),
                                job_id=job_id,
                                max_instances=max_instances,
                                **kwargs
                            )
                        
                        logger.info(f"注册装饰器任务成功: {obj.__name__} [Job ID: {job_id}]")
                    except Exception as e:
                        logger.error(f"注册装饰器任务失败: {obj.__name__}: {e}")


# 全局单例实例
_scheduler_manager: Optional[SchedulerManager] = None


def get_scheduler_manager() -> SchedulerManager:
    """获取调度器管理器单例"""
    global _scheduler_manager
    if _scheduler_manager is None:
        _scheduler_manager = SchedulerManager()
    return _scheduler_manager

