"""
图片压缩/解压缩工具类
使用 WebP 无损压缩格式，适合存储到数据库
"""

import io
import base64
from typing import Union, Optional, Tuple
from PIL import Image


class ImageUtil:
    """
    图片工具类，提供 WebP 无损压缩和解压缩功能
    
    WebP 无损压缩特点:
    - 压缩比优于 PNG（通常可减少 25-35% 的文件大小）
    - 完全无损，解压后与原图像素级一致
    - 支持透明通道 (RGBA)
    """
    
    @staticmethod
    def compress_image(
        image_source: Union[str, bytes, Image.Image],
        lossless: bool = True,
        quality: int = 100,
        method: int = 6
    ) -> bytes:
        """
        将图片压缩为 WebP 格式，返回 bytes 用于存储到数据库
        
        Args:
            image_source: 图片来源，可以是:
                - 文件路径 (str)
                - 图片二进制数据 (bytes)
                - PIL Image 对象
            lossless: 是否使用无损压缩，默认 True
                - True: 无损压缩，图像质量完全保留
                - False: 有损压缩，压缩比更高但会损失部分质量
            quality: 压缩质量 (0-100)
                - 无损模式下：控制压缩效率，100 表示最大压缩（但更慢）
                - 有损模式下：控制图像质量，100 表示最高质量
            method: 压缩方法 (0-6)
                - 0: 最快但压缩率最低
                - 6: 最慢但压缩率最高
                
        Returns:
            bytes: WebP 格式的压缩图片数据
            
        Raises:
            ValueError: 图片来源类型不支持
            FileNotFoundError: 图片文件不存在
            
        Example:
            >>> # 从文件压缩
            >>> compressed = ImageUtil.compress_image("/path/to/image.png")
            >>> 
            >>> # 从 bytes 压缩
            >>> with open("image.jpg", "rb") as f:
            ...     compressed = ImageUtil.compress_image(f.read())
            >>> 
            >>> # 存储到数据库 (假设使用 SQLAlchemy)
            >>> record.image_data = compressed
        """
        # 加载图片
        img = ImageUtil._load_image(image_source)
        
        # 处理图片模式，确保兼容性
        img = ImageUtil._prepare_for_webp(img)
        
        # 压缩为 WebP
        buffer = io.BytesIO()
        img.save(
            buffer,
            format="WEBP",
            lossless=lossless,
            quality=quality,
            method=method
        )
        
        return buffer.getvalue()
    
    @staticmethod
    def decompress_image(
        webp_data: bytes,
        output_format: Optional[str] = None
    ) -> Union[Image.Image, bytes]:
        """
        从 WebP 压缩数据解压缩图片
        
        Args:
            webp_data: WebP 格式的压缩图片数据
            output_format: 输出格式
                - None: 返回 PIL Image 对象，可用于进一步处理
                - "PNG", "JPEG", "BMP" 等: 返回对应格式的 bytes
                
        Returns:
            - 如果 output_format 为 None: 返回 PIL Image 对象
            - 如果指定 output_format: 返回对应格式的 bytes
            
        Example:
            >>> # 从数据库读取并解压
            >>> compressed_data = record.image_data
            >>> 
            >>> # 获取 PIL Image 对象
            >>> img = ImageUtil.decompress_image(compressed_data)
            >>> img.show()
            >>> 
            >>> # 直接转换为 PNG bytes
            >>> png_data = ImageUtil.decompress_image(compressed_data, "PNG")
            >>> with open("output.png", "wb") as f:
            ...     f.write(png_data)
        """
        # 从 bytes 加载图片
        buffer = io.BytesIO(webp_data)
        img = Image.open(buffer)
        
        # 确保图片数据完全加载到内存
        img.load()
        
        if output_format is None:
            return img
        
        # 转换为指定格式
        output_buffer = io.BytesIO()
        
        # JPEG 不支持透明通道，需要转换
        if output_format.upper() in ("JPEG", "JPG"):
            if img.mode in ("RGBA", "LA", "P"):
                # 创建白色背景
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")
        
        img.save(output_buffer, format=output_format.upper())
        return output_buffer.getvalue()
    
    @staticmethod
    def compress_to_base64(
        image_source: Union[str, bytes, Image.Image],
        lossless: bool = True,
        quality: int = 100,
        method: int = 6
    ) -> str:
        """
        将图片压缩为 WebP 格式并转换为 Base64 字符串
        适合存储到数据库的 TEXT/VARCHAR 字段
        
        Args:
            image_source: 图片来源（同 compress_image）
            lossless: 是否使用无损压缩
            quality: 压缩质量 (0-100)
            method: 压缩方法 (0-6)
            
        Returns:
            str: Base64 编码的 WebP 图片数据
            
        Example:
            >>> base64_str = ImageUtil.compress_to_base64("/path/to/image.png")
            >>> record.image_base64 = base64_str
        """
        compressed = ImageUtil.compress_image(
            image_source,
            lossless=lossless,
            quality=quality,
            method=method
        )
        return base64.b64encode(compressed).decode("utf-8")
    
    @staticmethod
    def decompress_from_base64(
        base64_data: str,
        output_format: Optional[str] = None
    ) -> Union[Image.Image, bytes]:
        """
        从 Base64 编码的 WebP 数据解压缩图片
        
        Args:
            base64_data: Base64 编码的 WebP 图片数据
            output_format: 输出格式（同 decompress_image）
            
        Returns:
            同 decompress_image
            
        Example:
            >>> base64_str = record.image_base64
            >>> img = ImageUtil.decompress_from_base64(base64_str)
        """
        webp_data = base64.b64decode(base64_data)
        return ImageUtil.decompress_image(webp_data, output_format)
    
    @staticmethod
    def get_image_info(image_source: Union[str, bytes, Image.Image]) -> dict:
        """
        获取图片信息
        
        Args:
            image_source: 图片来源
            
        Returns:
            dict: 包含图片信息的字典
                - width: 宽度
                - height: 高度
                - mode: 颜色模式 (RGB, RGBA, L 等)
                - format: 原始格式
                - size_bytes: 如果输入是 bytes，返回原始大小
        """
        if isinstance(image_source, bytes):
            original_size = len(image_source)
            img = Image.open(io.BytesIO(image_source))
        elif isinstance(image_source, str):
            import os
            original_size = os.path.getsize(image_source) if os.path.exists(image_source) else None
            img = Image.open(image_source)
        else:
            original_size = None
            img = image_source
            
        return {
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
            "format": img.format,
            "size_bytes": original_size
        }
    
    @staticmethod
    def estimate_compression_ratio(
        image_source: Union[str, bytes, Image.Image],
        lossless: bool = True
    ) -> Tuple[int, int, float]:
        """
        估算压缩比
        
        Args:
            image_source: 图片来源
            lossless: 是否使用无损压缩
            
        Returns:
            Tuple[int, int, float]: (原始大小, 压缩后大小, 压缩比)
            
        Example:
            >>> original, compressed, ratio = ImageUtil.estimate_compression_ratio("image.png")
            >>> print(f"压缩比: {ratio:.2f}x, 节省: {(1 - 1/ratio) * 100:.1f}%")
        """
        # 获取原始大小
        if isinstance(image_source, bytes):
            original_size = len(image_source)
        elif isinstance(image_source, str):
            import os
            original_size = os.path.getsize(image_source)
        else:
            # PIL Image 对象，估算 PNG 大小
            buffer = io.BytesIO()
            image_source.save(buffer, format="PNG")
            original_size = len(buffer.getvalue())
        
        # 压缩
        compressed = ImageUtil.compress_image(image_source, lossless=lossless)
        compressed_size = len(compressed)
        
        # 计算压缩比
        ratio = original_size / compressed_size if compressed_size > 0 else 0
        
        return original_size, compressed_size, ratio
    
    @staticmethod
    def _load_image(image_source: Union[str, bytes, Image.Image]) -> Image.Image:
        """
        统一加载图片的内部方法
        """
        if isinstance(image_source, Image.Image):
            return image_source
        elif isinstance(image_source, bytes):
            return Image.open(io.BytesIO(image_source))
        elif isinstance(image_source, str):
            return Image.open(image_source)
        else:
            raise ValueError(
                f"不支持的图片来源类型: {type(image_source)}. "
                f"支持: str (文件路径), bytes, PIL.Image.Image"
            )
    
    @staticmethod
    def _prepare_for_webp(img: Image.Image) -> Image.Image:
        """
        为 WebP 格式准备图片，处理特殊颜色模式
        """
        # WebP 支持: RGB, RGBA, L, LA
        if img.mode in ("RGB", "RGBA", "L", "LA"):
            return img
        
        # 调色板模式转换为 RGBA（保留透明度）
        if img.mode == "P":
            return img.convert("RGBA")
        
        # CMYK 转换为 RGB
        if img.mode == "CMYK":
            return img.convert("RGB")
        
        # 其他模式尝试转换为 RGB 或 RGBA
        if "A" in img.mode:
            return img.convert("RGBA")
        else:
            return img.convert("RGB")


# 便捷函数（模块级别）
def compress_image(
    image_source: Union[str, bytes, Image.Image],
    lossless: bool = True,
    quality: int = 100,
    method: int = 6
) -> bytes:
    """便捷函数：压缩图片为 WebP 格式"""
    return ImageUtil.compress_image(image_source, lossless, quality, method)


def decompress_image(
    webp_data: bytes,
    output_format: Optional[str] = None
) -> Union[Image.Image, bytes]:
    """便捷函数：解压缩 WebP 图片"""
    return ImageUtil.decompress_image(webp_data, output_format)

