"""
HTTP工具模块
提供HTTP请求相关的工具函数
"""
import asyncio
import aiohttp
import requests
import json
import time
from typing import Dict, Any, Optional, Union, List, Callable, AsyncGenerator, Generator
from urllib.parse import urljoin, urlparse
from enhanced_logging_config import get_enhanced_logger

# 获取日志器
logger = get_enhanced_logger('http_util')

class HTTPUtil:
    """HTTP工具类"""
    
    def __init__(self, 
                 timeout: int = 30,
                 max_retries: int = 3,
                 retry_delay: float = 1.0,
                 default_headers: Optional[Dict[str, str]] = None):
        """
        初始化HTTP工具
        
        Args:
            timeout: 请求超时时间（秒）
            max_retries: 最大重试次数
            retry_delay: 重试延迟时间（秒）
            default_headers: 默认请求头
        """
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.default_headers = default_headers or {
            'Content-Type': 'application/json',
            'User-Agent': 'MiniCPMO-Backend/1.0'
        }
    
    def _prepare_headers(self, headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """准备请求头"""
        final_headers = self.default_headers.copy()
        if headers:
            final_headers.update(headers)
        return final_headers
    
    def _prepare_data(self, data: Any) -> Union[str, Dict, None]:
        """准备请求数据"""
        if data is None:
            return None
        
        if isinstance(data, (dict, list)):
            return json.dumps(data, ensure_ascii=False)
        
        if isinstance(data, str):
            return data
        
        return str(data)
    
    def get(self, 
            url: str, 
            params: Optional[Dict[str, Any]] = None,
            headers: Optional[Dict[str, str]] = None,
            timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        发送GET请求
        
        Args:
            url: 请求URL
            params: 查询参数
            headers: 请求头
            timeout: 超时时间
            
        Returns:
            响应结果字典
        """
        return self._request('GET', url, params=params, headers=headers, timeout=timeout)
    
    def post(self, 
             url: str, 
             data: Any = None,
             json_data: Optional[Dict[str, Any]] = None,
             headers: Optional[Dict[str, str]] = None,
             timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        发送POST请求
        
        Args:
            url: 请求URL
            data: 请求数据
            json_data: JSON数据
            headers: 请求头
            timeout: 超时时间
            
        Returns:
            响应结果字典
        """
        return self._request('POST', url, data=data, json_data=json_data, headers=headers, timeout=timeout)
    
    def put(self, 
            url: str, 
            data: Any = None,
            json_data: Optional[Dict[str, Any]] = None,
            headers: Optional[Dict[str, str]] = None,
            timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        发送PUT请求
        
        Args:
            url: 请求URL
            data: 请求数据
            json_data: JSON数据
            headers: 请求头
            timeout: 超时时间
            
        Returns:
            响应结果字典
        """
        return self._request('PUT', url, data=data, json_data=json_data, headers=headers, timeout=timeout)
    
    def delete(self, 
               url: str, 
               headers: Optional[Dict[str, str]] = None,
               timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        发送DELETE请求
        
        Args:
            url: 请求URL
            headers: 请求头
            timeout: 超时时间
            
        Returns:
            响应结果字典
        """
        return self._request('DELETE', url, headers=headers, timeout=timeout)
    
    def stream_get(self, 
                   url: str, 
                   params: Optional[Dict[str, Any]] = None,
                   headers: Optional[Dict[str, str]] = None,
                   timeout: Optional[int] = None,
                   chunk_callback: Optional[Callable[[str], None]] = None) -> Generator[str, None, None]:
        """
        发送流式GET请求
        
        Args:
            url: 请求URL
            params: 查询参数
            headers: 请求头
            timeout: 超时时间
            chunk_callback: 数据块回调函数
            
        Yields:
            流式数据块
        """
        return self._stream_request('GET', url, params=params, headers=headers, timeout=timeout, chunk_callback=chunk_callback)
    
    def stream_post(self, 
                    url: str, 
                    data: Any = None,
                    json_data: Optional[Dict[str, Any]] = None,
                    headers: Optional[Dict[str, str]] = None,
                    timeout: Optional[int] = None,
                    chunk_callback: Optional[Callable[[str], None]] = None) -> Generator[str, None, None]:
        """
        发送流式POST请求
        
        Args:
            url: 请求URL
            data: 请求数据
            json_data: JSON数据
            headers: 请求头
            timeout: 超时时间
            chunk_callback: 数据块回调函数
            
        Yields:
            流式数据块
        """
        return self._stream_request('POST', url, data=data, json_data=json_data, headers=headers, timeout=timeout, chunk_callback=chunk_callback)
    
    def _request(self, 
                 method: str, 
                 url: str, 
                 params: Optional[Dict[str, Any]] = None,
                 data: Any = None,
                 json_data: Optional[Dict[str, Any]] = None,
                 headers: Optional[Dict[str, str]] = None,
                 timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        发送HTTP请求
        
        Args:
            method: HTTP方法
            url: 请求URL
            params: 查询参数
            data: 请求数据
            json_data: JSON数据
            headers: 请求头
            timeout: 超时时间
            
        Returns:
            响应结果字典
        """
        timeout = timeout or self.timeout
        final_headers = self._prepare_headers(headers)
        
        # 准备请求数据
        request_data = None
        if json_data is not None:
            request_data = json_data
            final_headers['Content-Type'] = 'application/json'
        elif data is not None:
            request_data = self._prepare_data(data)
        
        # 重试逻辑
        last_exception = None
        for attempt in range(self.max_retries + 1):
            try:
                logger.info(f"发送{method}请求到: {url} (尝试 {attempt + 1}/{self.max_retries + 1})")
                
                response = requests.request(
                    method=method,
                    url=url,
                    params=params,
                    data=request_data,
                    json=json_data if json_data else None,
                    headers=final_headers,
                    timeout=timeout
                )
                
                # 处理响应
                result = self._handle_response(response)
                logger.info(f"请求成功: {method} {url} - 状态码: {response.status_code}")
                return result
                
            except requests.exceptions.RequestException as e:
                last_exception = e
                error_msg = str(e) if str(e) else repr(e)
                logger.error(f"请求失败: {method} {url} - 错误: {type(e).__name__}: {error_msg} (尝试 {attempt + 1}/{self.max_retries + 1})")
                
                if attempt < self.max_retries:
                    time.sleep(self.retry_delay * (2 ** attempt))  # 指数退避
                else:
                    logger.error(f"请求最终失败: {method} {url} - 错误: {type(e).__name__}: {error_msg}")
                    raise HTTPUtilError(f"请求失败: {type(e).__name__}: {error_msg}")
        
        # 如果所有重试都失败了
        last_error_msg = str(last_exception) if str(last_exception) else repr(last_exception)
        raise HTTPUtilError(f"请求失败，已重试 {self.max_retries} 次: {type(last_exception).__name__}: {last_error_msg}")
    
    def _stream_request(self, 
                       method: str, 
                       url: str, 
                       params: Optional[Dict[str, Any]] = None,
                       data: Any = None,
                       json_data: Optional[Dict[str, Any]] = None,
                       headers: Optional[Dict[str, str]] = None,
                       timeout: Optional[int] = None,
                       chunk_callback: Optional[Callable[[str], None]] = None) -> Generator[str, None, None]:
        """
        发送流式HTTP请求
        
        Args:
            method: HTTP方法
            url: 请求URL
            params: 查询参数
            data: 请求数据
            json_data: JSON数据
            headers: 请求头
            timeout: 超时时间
            chunk_callback: 数据块回调函数
            
        Yields:
            流式数据块
        """
        timeout = timeout or self.timeout
        final_headers = self._prepare_headers(headers)
        
        # 准备请求数据
        request_data = None
        if json_data is not None:
            request_data = json_data
            final_headers['Content-Type'] = 'application/json'
        elif data is not None:
            request_data = self._prepare_data(data)
        
        # 重试逻辑
        last_exception = None
        for attempt in range(self.max_retries + 1):
            try:
                logger.info(f"发送流式{method}请求到: {url} (尝试 {attempt + 1}/{self.max_retries + 1})")
                
                response = requests.request(
                    method=method,
                    url=url,
                    params=params,
                    data=request_data,
                    json=json_data if json_data else None,
                    headers=final_headers,
                    timeout=timeout,
                    stream=True  # 启用流式响应
                )
                
                # 检查响应状态
                if not response.ok:
                    logger.error(f"流式请求失败: {method} {url} - 状态码: {response.status_code}")
                    raise HTTPUtilError(f"流式请求失败: HTTP {response.status_code}")
                
                logger.info(f"流式请求开始: {method} {url} - 状态码: {response.status_code}")
                
                # 流式读取数据
                for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
                    if chunk:
                        # 调用回调函数
                        if chunk_callback:
                            chunk_callback(chunk)
                        yield chunk
                
                logger.info(f"流式请求完成: {method} {url}")
                return
                
            except requests.exceptions.RequestException as e:
                last_exception = e
                error_msg = str(e) if str(e) else repr(e)
                logger.error(f"流式请求失败: {method} {url} - 错误: {type(e).__name__}: {error_msg} (尝试 {attempt + 1}/{self.max_retries + 1})")
                
                if attempt < self.max_retries:
                    time.sleep(self.retry_delay * (2 ** attempt))  # 指数退避
                else:
                    logger.error(f"流式请求最终失败: {method} {url} - 错误: {type(e).__name__}: {error_msg}")
                    raise HTTPUtilError(f"流式请求失败: {type(e).__name__}: {error_msg}")
        
        # 如果所有重试都失败了
        last_error_msg = str(last_exception) if str(last_exception) else repr(last_exception)
        raise HTTPUtilError(f"流式请求失败，已重试 {self.max_retries} 次: {type(last_exception).__name__}: {last_error_msg}")
    
    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        """处理HTTP响应"""
        try:
            # 尝试解析JSON
            if response.headers.get('content-type', '').startswith('application/json'):
                data = response.json()
            else:
                data = response.text
            
            return {
                'status_code': response.status_code,
                'headers': dict(response.headers),
                'data': data,
                'success': 200 <= response.status_code < 300,
                'url': response.url
            }
        except json.JSONDecodeError:
            return {
                'status_code': response.status_code,
                'headers': dict(response.headers),
                'data': response.text,
                'success': 200 <= response.status_code < 300,
                'url': response.url
            }

class AsyncHTTPUtil:
    """异步HTTP工具类（支持连接池复用）"""
    
    def __init__(self, 
                 timeout: int = 120,
                 max_retries: int = 3,
                 retry_delay: float = 1.0,
                 default_headers: Optional[Dict[str, str]] = None,
                 pool_size: int = 100,
                 keepalive_timeout: int = 300):
        """
        初始化异步HTTP工具
        
        Args:
            timeout: 请求超时时间（秒）
            max_retries: 最大重试次数
            retry_delay: 重试延迟时间（秒）
            default_headers: 默认请求头
            pool_size: 连接池大小
            keepalive_timeout: Keep-Alive 超时时间（秒）
        """
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.default_headers = default_headers or {
            'Content-Type': 'application/json',
            'User-Agent': 'MiniCPMO-Backend/1.0'
        }
        self.pool_size = pool_size
        self.keepalive_timeout = keepalive_timeout
        self._session: Optional[aiohttp.ClientSession] = None
        self._lock = asyncio.Lock()
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建复用的 ClientSession（线程安全）"""
        if self._session is None or self._session.closed:
            async with self._lock:
                # 双重检查，防止并发创建
                if self._session is None or self._session.closed:
                    connector = aiohttp.TCPConnector(
                        limit=self.pool_size,
                        keepalive_timeout=self.keepalive_timeout,
                        enable_cleanup_closed=True,
                        force_close=False
                    )
                    self._session = aiohttp.ClientSession(
                        timeout=self.timeout,
                        connector=connector
                    )
                    logger.info(f"创建新的 ClientSession，连接池大小: {self.pool_size}, keepalive: {self.keepalive_timeout}s")
        return self._session
    
    async def close(self):
        """关闭 ClientSession，释放连接池资源"""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
            logger.info("ClientSession 已关闭")
    
    async def get(self, 
                  url: str, 
                  params: Optional[Dict[str, Any]] = None,
                  headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """异步GET请求"""
        return await self._request('GET', url, params=params, headers=headers)
    
    async def post(self, 
                   url: str, 
                   data: Any = None,
                   json_data: Optional[Dict[str, Any]] = None,
                   headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """异步POST请求"""
        return await self._request('POST', url, data=data, json_data=json_data, headers=headers)
    
    async def put(self, 
                  url: str, 
                  data: Any = None,
                  json_data: Optional[Dict[str, Any]] = None,
                  headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """异步PUT请求"""
        return await self._request('PUT', url, data=data, json_data=json_data, headers=headers)
    
    async def delete(self, 
                     url: str, 
                     headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """异步DELETE请求"""
        return await self._request('DELETE', url, headers=headers)
    
    async def stream_get(self, 
                        url: str, 
                        params: Optional[Dict[str, Any]] = None,
                        headers: Optional[Dict[str, str]] = None,
                        chunk_callback: Optional[Callable[[str], None]] = None) -> AsyncGenerator[str, None]:
        """异步流式GET请求"""
        async for chunk in self._stream_request('GET', url, params=params, headers=headers, chunk_callback=chunk_callback):
            yield chunk
    
    async def stream_post(self, 
                         url: str, 
                         data: Any = None,
                         json_data: Optional[Dict[str, Any]] = None,
                         headers: Optional[Dict[str, str]] = None,
                         chunk_callback: Optional[Callable[[str], None]] = None) -> AsyncGenerator[str, None]:
        """异步流式POST请求"""
        async for chunk in self._stream_request('POST', url, data=data, json_data=json_data, headers=headers, chunk_callback=chunk_callback):
            yield chunk
    
    async def _request(self, 
                       method: str, 
                       url: str, 
                       params: Optional[Dict[str, Any]] = None,
                       data: Any = None,
                       json_data: Optional[Dict[str, Any]] = None,
                       headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """异步HTTP请求（复用连接池）"""
        final_headers = self.default_headers.copy()
        if headers:
            final_headers.update(headers)
        
        # 获取复用的 session
        session = await self._get_session()
        
        # 重试逻辑
        last_exception = None
        for attempt in range(self.max_retries + 1):
            start_time = time.time()
            try:
                logger.info(f"发送异步{method}请求到: {url} (尝试 {attempt + 1}/{self.max_retries + 1})")

                async with session.request(
                    method=method,
                    url=url,
                    params=params,
                    data=data,
                    json=json_data,
                    headers=final_headers
                ) as response:
                    
                    # 处理响应
                    result = await self._handle_response(response)
                    
                    # 计算请求耗时
                    elapsed_time = time.time() - start_time
                    logger.info(f"异步请求成功: {method} {url} - 状态码: {response.status}, 耗时: {elapsed_time:.3f}秒")
                    return result
                
            except aiohttp.ClientError as e:
                last_exception = e
                error_msg = str(e) if str(e) else repr(e)
                
                # 计算失败请求的耗时
                elapsed_time = time.time() - start_time
                logger.error(f"异步请求失败: {method} {url} - 错误: {type(e).__name__}: {error_msg}, 耗时: {elapsed_time:.3f}秒 (尝试 {attempt + 1}/{self.max_retries + 1})")
                
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay * (2 ** attempt))  # 指数退避
                else:
                    logger.error(f"异步请求最终失败: {method} {url} - 错误: {type(e).__name__}: {error_msg}, 总耗时: {elapsed_time:.3f}秒")
                    raise HTTPUtilError(f"异步请求失败: {type(e).__name__}: {error_msg}")
        
        # 如果所有重试都失败了
        last_error_msg = str(last_exception) if str(last_exception) else repr(last_exception)
        raise HTTPUtilError(f"异步请求失败，已重试 {self.max_retries} 次: {type(last_exception).__name__}: {last_error_msg}")
    
    async def _stream_request(self, 
                             method: str, 
                             url: str, 
                             params: Optional[Dict[str, Any]] = None,
                             data: Any = None,
                             json_data: Optional[Dict[str, Any]] = None,
                             headers: Optional[Dict[str, str]] = None,
                             chunk_callback: Optional[Callable[[str], None]] = None) -> AsyncGenerator[str, None]:
        """
        发送异步流式HTTP请求（复用连接池）
        
        Args:
            method: HTTP方法
            url: 请求URL
            params: 查询参数
            data: 请求数据
            json_data: JSON数据
            headers: 请求头
            chunk_callback: 数据块回调函数
            
        Yields:
            流式数据块
        """
        final_headers = self.default_headers.copy()
        if headers:
            final_headers.update(headers)
        
        # 获取复用的 session
        session = await self._get_session()
        
        # 重试逻辑
        last_exception = None
        for attempt in range(self.max_retries + 1):
            try:
                logger.info(f"发送异步流式{method}请求到: {url} (尝试 {attempt + 1}/{self.max_retries + 1})")
                
                async with session.request(
                    method=method,
                    url=url,
                    params=params,
                    data=data,
                    json=json_data,
                    headers=final_headers
                ) as response:
                    
                    # 检查响应状态
                    if not response.ok:
                        logger.error(f"异步流式请求失败: {method} {url} - 状态码: {response.status}")
                        raise HTTPUtilError(f"异步流式请求失败: HTTP {response.status}")
                    
                    logger.info(f"异步流式请求开始: {method} {url} - 状态码: {response.status}")
                    
                    # 流式读取数据，按 SSE 格式的 \n\n 分隔符读取完整消息
                    buffer = ""
                    async for chunk in response.content.iter_any():
                        if chunk:
                            buffer += chunk.decode('utf-8', errors='ignore')
                            # SSE 格式使用 \n\n 作为消息分隔符
                            while '\n\n' in buffer:
                                message, buffer = buffer.split('\n\n', 1)
                                message = message.strip()
                                if message:
                                    # 调用回调函数
                                    if chunk_callback:
                                        chunk_callback(message)
                                    yield message
                    
                    # 处理剩余数据
                    if buffer.strip():
                        if chunk_callback:
                            chunk_callback(buffer.strip())
                        yield buffer.strip()
                    
                    logger.info(f"异步流式请求完成: {method} {url}")
                    return
                
            except aiohttp.ClientError as e:
                last_exception = e
                error_msg = str(e) if str(e) else repr(e)
                logger.error(f"异步流式请求失败: {method} {url} - 错误: {type(e).__name__}: {error_msg} (尝试 {attempt + 1}/{self.max_retries + 1})")
                
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay * (2 ** attempt))  # 指数退避
                else:
                    logger.error(f"异步流式请求最终失败: {method} {url} - 错误: {type(e).__name__}: {error_msg}")
                    raise HTTPUtilError(f"异步流式请求失败: {type(e).__name__}: {error_msg}")
        
        # 如果所有重试都失败了
        last_error_msg = str(last_exception) if str(last_exception) else repr(last_exception)
        raise HTTPUtilError(f"异步流式请求失败，已重试 {self.max_retries} 次: {type(last_exception).__name__}: {last_error_msg}")
    
    async def _handle_response(self, response: aiohttp.ClientResponse) -> Dict[str, Any]:
        """处理异步HTTP响应"""
        try:
            # 尝试解析JSON
            content_type = response.headers.get('content-type', '')
            if 'application/json' in content_type:
                data = await response.json()
            else:
                data = await response.text()
            
            return {
                'status_code': response.status,
                'headers': dict(response.headers),
                'data': data,
                'success': 200 <= response.status < 300,
                'url': str(response.url)
            }
        except Exception as e:
            logger.error(f"处理异步响应失败: {str(e)}")
            return {
                'status_code': response.status,
                'headers': dict(response.headers),
                'data': None,
                'success': False,
                'url': str(response.url),
                'error': str(e)
            }

class StreamParser:
    """流式数据解析器"""
    
    @staticmethod
    def parse_sse_stream(chunk: str) -> Optional[Dict[str, Any]]:
        """
        解析Server-Sent Events (SSE) 流
        
        Args:
            chunk: 数据块
            
        Returns:
            解析后的数据字典，如果不是有效SSE则返回None
        """
        lines = chunk.strip().split('\n')
        data = {}
        
        for line in lines:
            if ':' in line:
                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()
                
                if key == 'data':
                    if 'data' not in data:
                        data['data'] = value
                    else:
                        data['data'] += '\n' + value
                elif key == 'event':
                    data['event'] = value
                elif key == 'id':
                    data['id'] = value
                elif key == 'retry':
                    try:
                        data['retry'] = int(value)
                    except ValueError:
                        pass
        
        return data if data else None
    
    @staticmethod
    def parse_json_stream(chunk: str, buffer: str = "") -> tuple[Optional[Dict[str, Any]], str]:
        """
        解析JSON流数据
        
        Args:
            chunk: 新的数据块
            buffer: 缓冲区数据
            
        Returns:
            (解析的JSON对象, 剩余缓冲区)
        """
        buffer += chunk
        results = []
        
        # 尝试解析完整的JSON对象
        while buffer:
            try:
                # 查找JSON对象的开始和结束
                start = buffer.find('{')
                if start == -1:
                    break
                
                # 找到匹配的结束括号
                brace_count = 0
                end = start
                for i, char in enumerate(buffer[start:], start):
                    if char == '{':
                        brace_count += 1
                    elif char == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            end = i + 1
                            break
                
                if brace_count == 0:
                    json_str = buffer[start:end]
                    json_obj = json.loads(json_str)
                    results.append(json_obj)
                    buffer = buffer[end:]
                else:
                    break
                    
            except (json.JSONDecodeError, ValueError):
                break
        
        return results[0] if results else None, buffer
    
    @staticmethod
    def parse_chat_stream(chunk: str) -> Optional[Dict[str, Any]]:
        """
        解析聊天流数据（类似OpenAI格式）
        
        Args:
            chunk: 数据块
            
        Returns:
            解析后的数据字典
        """
        try:
            # 移除可能的前缀
            if chunk.startswith('data: '):
                chunk = chunk[6:]
            
            # 检查是否是结束标记
            if chunk.strip() == '[DONE]':
                return {'type': 'done'}
            
            # 尝试解析JSON
            data = json.loads(chunk)
            return data
        except json.JSONDecodeError:
            return None

class HTTPUtilError(Exception):
    """HTTP工具异常"""
    pass

# 便捷函数
def create_http_util(timeout: int = 30, 
                    max_retries: int = 3,
                    retry_delay: float = 1.0,
                    default_headers: Optional[Dict[str, str]] = None) -> HTTPUtil:
    """创建HTTP工具实例"""
    return HTTPUtil(timeout, max_retries, retry_delay, default_headers)

def create_async_http_util(timeout: int = 30, 
                          max_retries: int = 3,
                          retry_delay: float = 1.0,
                          default_headers: Optional[Dict[str, str]] = None,
                          pool_size: int = 100,
                          keepalive_timeout: int = 30) -> AsyncHTTPUtil:
    """创建异步HTTP工具实例（支持连接池复用）"""
    return AsyncHTTPUtil(timeout, max_retries, retry_delay, default_headers, pool_size, keepalive_timeout)

# ============================================
# 全局单例管理
# ============================================

# 默认同步实例
default_http_util = HTTPUtil()

# 全局异步 HTTP 单例（延迟初始化）
_global_async_http_util: Optional[AsyncHTTPUtil] = None
_global_async_http_util_lock = asyncio.Lock()

def get_async_http_util(
    timeout: int = 120,
    max_retries: int = 3,
    retry_delay: float = 1.0,
    pool_size: int = 100,
    keepalive_timeout: int = 300
) -> AsyncHTTPUtil:
    """
    获取全局异步 HTTP 单例实例
    
    整个应用共享一个连接池，提高性能。
    首次调用时会创建实例，后续调用返回同一实例。
    
    Args:
        timeout: 请求超时时间（秒），仅首次创建时生效
        max_retries: 最大重试次数，仅首次创建时生效
        retry_delay: 重试延迟时间（秒），仅首次创建时生效
        pool_size: 连接池大小，仅首次创建时生效
        keepalive_timeout: Keep-Alive 超时时间（秒），仅首次创建时生效
        
    Returns:
        全局 AsyncHTTPUtil 单例实例
    """
    global _global_async_http_util
    if _global_async_http_util is None:
        _global_async_http_util = AsyncHTTPUtil(
            timeout=timeout,
            max_retries=max_retries,
            retry_delay=retry_delay,
            pool_size=pool_size,
            keepalive_timeout=keepalive_timeout
        )
        logger.info(f"创建全局 AsyncHTTPUtil 单例: timeout={timeout}s, pool_size={pool_size}, keepalive={keepalive_timeout}s")
    return _global_async_http_util

async def close_async_http_util():
    """
    关闭全局异步 HTTP 单例，释放连接池资源
    
    应在应用关闭时调用此函数（如 FastAPI 的 shutdown 事件）
    """
    global _global_async_http_util
    if _global_async_http_util is not None:
        await _global_async_http_util.close()
        _global_async_http_util = None
        logger.info("全局 AsyncHTTPUtil 单例已关闭")

# 为了向后兼容，创建一个代理对象
# default_async_http_util 会延迟初始化全局单例
class _AsyncHTTPUtilProxy:
    """异步 HTTP 工具代理类，用于延迟初始化全局单例"""
    
    def __getattr__(self, name):
        return getattr(get_async_http_util(), name)

default_async_http_util = _AsyncHTTPUtilProxy()

# 便捷函数
def get(url: str, **kwargs) -> Dict[str, Any]:
    """便捷GET请求"""
    return default_http_util.get(url, **kwargs)

def post(url: str, **kwargs) -> Dict[str, Any]:
    """便捷POST请求"""
    return default_http_util.post(url, **kwargs)

def put(url: str, **kwargs) -> Dict[str, Any]:
    """便捷PUT请求"""
    return default_http_util.put(url, **kwargs)

def delete(url: str, **kwargs) -> Dict[str, Any]:
    """便捷DELETE请求"""
    return default_http_util.delete(url, **kwargs)

# 异步便捷函数
async def async_get(url: str, **kwargs) -> Dict[str, Any]:
    """便捷异步GET请求"""
    return await default_async_http_util.get(url, **kwargs)

async def async_post(url: str, **kwargs) -> Dict[str, Any]:
    """便捷异步POST请求"""
    return await default_async_http_util.post(url, **kwargs)

async def async_put(url: str, **kwargs) -> Dict[str, Any]:
    """便捷异步PUT请求"""
    return await default_async_http_util.put(url, **kwargs)

async def async_delete(url: str, **kwargs) -> Dict[str, Any]:
    """便捷异步DELETE请求"""
    return await default_async_http_util.delete(url, **kwargs)

# 流式便捷函数
def stream_get(url: str, **kwargs) -> Generator[str, None, None]:
    """便捷流式GET请求"""
    return default_http_util.stream_get(url, **kwargs)

def stream_post(url: str, **kwargs) -> Generator[str, None, None]:
    """便捷流式POST请求"""
    return default_http_util.stream_post(url, **kwargs)

async def async_stream_get(url: str, **kwargs) -> AsyncGenerator[str, None]:
    """便捷异步流式GET请求"""
    async for chunk in default_async_http_util.stream_get(url, **kwargs):
        yield chunk

async def async_stream_post(url: str, **kwargs) -> AsyncGenerator[str, None]:
    """便捷异步流式POST请求"""
    async for chunk in default_async_http_util.stream_post(url, **kwargs):
        yield chunk
