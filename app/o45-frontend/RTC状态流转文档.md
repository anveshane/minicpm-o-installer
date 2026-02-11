# RTC 通话前端状态流转文档

## 一、核心状态

| 状态           | 说明         | 场景                     |
| -------------- | ------------ | ------------------------ |
| `initializing` | 模型初始化中 | 等待后端模型加载         |
| `connecting`   | 连接中       | 模型初始化完成，发送配置 |
| `listening`    | 聆听中       | 等待用户说话             |
| `thinking`     | 思考中       | AI 生成回复中            |
| `talking`      | 说话中       | AI 播放音频              |
| `forbidden`    | 触发安审     | 内容审核拦截             |
| `robot_exit`   | 机器人退出   | 通话结束                 |

## 二、状态流转

```
开始通话
  ↓
initializing (模型初始化中)
  ↓ 收到 <state><model_init_success>
connecting (连接中)
  ↓ 收到 <state><session_init>
listening (聆听)
  ↓ 收到 <state><vad_end>
thinking (思考)
  ↓ 检测到远端音频播放
talking (说话)
  ↓ 音频结束 + generateEnd=true
listening (继续聆听)
  ↓
...循环...
```

## 三、关键切换逻辑

### 1. initializing → connecting

**触发**：收到 `<state><model_init_success>`  
**动作**：发送初始化配置（音色、场景等）

### 2. connecting → listening (聆听)

**触发**：收到 `<state><session_init>`（首次）  
**动作**：进入聆听模式，等待用户说话

### 3. listening (聆听) → thinking

**触发**：收到 `<state><vad_end>`  
**说明**：用户停止说话，AI 开始生成

### 4. thinking → talking

**触发**：检测到远端开始说话（IsSpeakingChanged 事件）  
**说明**：不依赖后端信号，完全由实际音频播放触发

### 5. talking → listening (聆听) ⭐ 核心

**必须满足所有条件：**

- 没有远端参与者在说话
- `generateEnd === true`
- `status === 'talking'`

**检查流程（多层验证）：**

```
第1层：静默检查（1500ms）
  ↓
第2层：精确检查（300ms）
  ↓
第3层：DOM 音频元素检查
  ↓
第4层：额外安全检查（300ms，如需要）
  ↓
切换到 listening (聆听)，发送 <state><play_end>
```

### 6. 打断机制

**触发**：用户发送 `{ interface: 'break' }`  
**动作**：

- 立即切换到 `listening` (聆听)
- 清空所有远端说话状态
- 停止所有音频轨道
- 清理定时器

## 四、关键参数

```javascript
SILENCE_TIMEOUT_MS = 1500      // 静默检查超时
EXTRA_SAFETY_DELAY_MS = 300    // 额外安全延迟
PLAY_DELAY_MS = 0              // 音频播放延迟
NO_ROBOT_TIMEOUT = 3分钟        // 无机器人检测（生产）/ 10秒（本地）
```

## 五、辅助状态

```javascript
state.connected; // 是否已连接到房间
state.modelInitialized; // 模型是否初始化成功
state.generateEnd; // 当前轮次是否生成结束
state.remoteAudioActive; // 远端说话状态 { sid: boolean }
state.firstInit; // 是否首次初始化
```

## 六、后端信号说明

| 信号                          | 含义         | 触发动作                |
| ----------------------------- | ------------ | ----------------------- |
| `<state><model_init_success>` | 模型加载成功 | 切换到 connecting       |
| `<state><session_init>`       | 会话初始化   | 切换到 listening (聆听) |
| `<state><vad_end>`            | 用户停止说话 | 切换到 thinking         |
| `<state><generate_start>`     | 开始生成回复 | 记录轮次信息            |
| `<state><audio_start>`        | 音频开始信号 | 仅记录，不切换状态      |
| `<state><generate_end>`       | 生成结束     | 标记 generateEnd=true   |
| `<state><audit_stop>`         | 触发安审     | 切换到 forbidden        |
| `<state><robot_exit>`         | 机器人退出   | 切换到 robot_exit       |

## 七、核心原则

1. **依赖实际音频事件**：thinking → talking 完全由音频播放触发，不依赖后端信号
2. **多层验证机制**：talking → listening (聆听) 采用 4 层检查，确保准确性
3. **DOM 检查兜底**：状态切换前检查所有 `<audio>` 元素的播放状态
4. **及时清理资源**：状态切换时清理定时器和音频元素

## 八、调试技巧

```javascript
// 查看当前状态
console.log('状态:', state.status);
console.log('生成结束:', state.generateEnd);
console.log('远端说话:', state.remoteAudioActive);

// 检查音频元素
document.querySelectorAll('audio[data-livekit-audio]');

// 测试无机器人超时
triggerNoRobotTimeout(true);

// 查看定时器状态
getNoRobotTimerStatus();
```

## 九、常见问题

**Q: 为什么 talking → listening (聆听) 切换有延迟？**  
A: 采用多层检查机制（1500ms + 300ms），确保音频真正播放完毕，避免误切换

**Q: thinking 为什么不直接由 `<audio_start>` 触发切换？**  
A: 防止网络延迟导致的信号乱序，完全依赖实际音频播放检测

**Q: 打断后为什么立即切换到 listening (聆听)？**  
A: 用户主动打断优先级最高，需要立即清理所有音频并恢复聆听

---

**文档版本：** v1.0  
**最后更新：** 2025-12-18
