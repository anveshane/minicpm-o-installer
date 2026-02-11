# 静态媒体传输功能说明

## 概述

此功能允许LiveKit传输固定的音频和图片数据，而不是用户的实际麦克风和摄像头输入。这对于测试、演示或特殊应用场景非常有用。

## 主要修改文件

### 1. `/src/hooks/useLiveKitStatic.js`
这是静态媒体版本的LiveKit hook，主要功能：
- 使用预设的音频文件进行循环播放
- 使用预设的图片文件生成视频流
- 保持与原版本相同的API接口
- 支持音频和视频模式

### 2. `/src/views/home/components/TestStaticVoice.vue`
修改版的语音组件，使用静态媒体数据：
- 引用静态媒体版本的hook
- 显示当前使用的静态媒体文件信息
- 其他业务逻辑保持不变

### 3. `/src/views/home/components/StaticMediaDemo.vue`（新增）
独立的演示组件，展示静态媒体功能：
- 可配置静态媒体参数
- 独立的测试界面
- 状态监控面板

## 静态媒体配置

```javascript
const STATIC_MEDIA_CONFIG = {
    // 音频文件路径 - 相对于public目录
    audioFilePath: '/audio/voices/voice-01.wav',
    
    // 图片文件路径 - 相对于public目录  
    imageFilePath: '/images/scene/scene-01.jpg',
    
    // 音频循环播放间隔（毫秒）- 主要用于备用音频
    audioLoopInterval: 3000,
    
    // 视频帧率
    videoFrameRate: 15,
    
    // 是否启用音频循环（设为false则只播放一次）
    enableAudioLoop: true,
    
    // 最大循环次数（0表示无限循环）
    maxLoopCount: 0
};
```

## 使用方法

### 方法1：替换现有组件
如果要在现有页面中使用静态媒体，只需修改import路径：

```javascript
// 原来的导入
import { useLiveKit } from '@/hooks/useLiveKit';

// 修改为静态媒体版本
import { useLiveKit } from '@/hooks/useLiveKitStatic';
```

### 方法2：使用独立演示组件
```vue
<template>
  <StaticMediaDemo />
</template>

<script setup>
import StaticMediaDemo from '@/views/home/components/StaticMediaDemo.vue';
</script>
```

### 方法3：直接使用TestStaticVoice组件
```vue
<template>
  <TestStaticVoice v-model:isCalling="isCalling" v-model:loading="loading" />
</template>

<script setup>
import TestStaticVoice from '@/views/home/components/TestStaticVoice.vue';
const isCalling = ref(false);
const loading = ref(false);
</script>
```

## 技术实现

### 静态音频生成
- 使用Web Audio API加载音频文件
- 创建AudioContext和MediaStreamDestination
- 通过BufferSource实现**无缝循环播放**（音频结束时立即重新开始）
- 支持循环控制（可设置循环次数或禁用循环）
- 将音频流包装为LiveKit LocalAudioTrack

### 静态视频生成
- 使用Canvas API绘制静态图片
- 添加时间戳显示"动态"效果
- 使用canvas.captureStream()生成视频流
- 将视频流包装为LiveKit LocalVideoTrack

### 兼容性保证
- 保持与原版本相同的API接口
- 支持音频/视频模式切换
- 保持状态管理逻辑不变
- 保持事件处理逻辑不变

## 注意事项

1. **文件路径**：确保音频和图片文件存在于public目录中
2. **浏览器兼容性**：需要支持Web Audio API和Canvas API的现代浏览器
3. **性能考虑**：视频帧率不要设置过高，建议15-30fps
4. **音频格式**：支持浏览器原生支持的音频格式（wav, mp3, ogg等）
5. **图片格式**：支持浏览器原生支持的图片格式（jpg, png, webp等）

## 配置示例

### 自定义音频和图片
```javascript
// 在组件中修改配置
import { useLiveKit } from '@/hooks/useLiveKitStatic';
const { STATIC_MEDIA_CONFIG } = useLiveKit();

// 修改配置
STATIC_MEDIA_CONFIG.audioFilePath = '/audio/custom-voice.mp3';
STATIC_MEDIA_CONFIG.imageFilePath = '/images/custom-scene.jpg';
STATIC_MEDIA_CONFIG.audioLoopInterval = 5000; // 5秒循环（主要用于备用音频）
STATIC_MEDIA_CONFIG.videoFrameRate = 20; // 20fps
STATIC_MEDIA_CONFIG.enableAudioLoop = true; // 启用音频循环
STATIC_MEDIA_CONFIG.maxLoopCount = 10; // 最多循环10次（0表示无限循环）
```

### 错误处理
如果静态文件加载失败，系统会自动降级：
- 音频：生成440Hz的正弦波作为备用音频
- 视频：生成蓝色背景的纯色视频

## 完整工作流程

### 📋 **音频播放时机**
1. **连接建立** → 不播放音频，等待状态变化
2. **首次进入 listening** → 立即从头播放固定音频
3. **状态变为 talking** → 立即停止播放，AI开始回复
4. **AI回复播放完成，重新变为 listening** → 等待3秒后从头重新播放固定音频
5. **循环往复** → 每次都从音频文件的开始位置重新播放

### 🎯 **设计原理**
- **从头播放**：每次进入listening状态都从音频文件开始播放，确保完整性
- **立即停止**：状态变化时立即停止当前播放，避免与AI回复冲突
- **3秒延迟机制**：确保AI回复完全播放完毕，避免音频重叠
- **状态响应**：严格按照listening/非listening状态控制播放

## 音频循环机制

### 🔄 **智能状态控制播放**
最新版本实现了基于状态的智能音频播放控制：
- **listening状态**：播放固定音频文件，每次都从头开始
- **非listening状态**：立即停止播放（talking/thinking等）
- **重新进入listening**：从音频文件开头重新开始播放
- **状态切换**：实时响应状态变化，确保播放与对话状态同步

### ⚙️ **循环控制选项**
```javascript
// 启用/禁用循环
STATIC_MEDIA_CONFIG.enableAudioLoop = true; // true=循环播放, false=只播放一次

// 控制循环次数
STATIC_MEDIA_CONFIG.maxLoopCount = 0; // 0=无限循环, >0=指定次数后停止
```

### 📊 **状态控制监控**
在控制台可以看到详细的状态控制过程：
```
// 首次进入listening状态
📊 状态变化: → listening
👂 首次进入listening状态，立即从头播放固定音频
🎵 开始发送固定音频到后端，时长: 3.45秒
🔄 在listening状态下继续循环播放固定音频...

// AI开始回复
📊 状态变化: listening → talking  
🗣️ 进入talking状态，停止播放固定音频
⏸️ 停止发送固定音频到后端，下次将重新从头播放
🔊 远端音频开始播放（后端返回的AI回复）

// AI回复结束，再次进入listening
📊 状态变化: talking → listening
👂 再次进入listening状态，3秒后从头重新播放固定音频...
⏰ listening状态3秒已到，从头重新播放固定音频
🎵 开始发送固定音频到后端，时长: 3.45秒（从头开始）
```

## 调试信息

在控制台中可以看到详细的调试信息：
- `🎯` 静态媒体初始化过程
- `🎵` 音频轨道创建状态
- `🎥` 视频轨道创建状态
- `🔄` 音频循环状态
- `✅` 成功状态标记
- `⚠️` 警告信息

## 扩展建议

1. **多文件支持**：可以扩展为支持多个音频/视频文件的随机播放
2. **实时配置**：添加运行时修改静态媒体文件的功能
3. **录制功能**：添加将静态媒体传输过程录制下来的功能
4. **质量控制**：添加音频/视频质量参数的精细控制 