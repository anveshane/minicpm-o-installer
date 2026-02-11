# 📱 摄像头兼容性指南（iOS + Android）

> 解决视频通话后置摄像头画面放大/缩小问题

---

## 🔍 问题现象

### iOS 设备（iPhone Pro 系列）
- 后置摄像头画面**明显放大**，视野变窄
- 原因：浏览器错误选择了**长焦镜头**（3x），而不是主摄广角（1x）

### Android 设备（vivo、小米、华为等）
- 后置摄像头画面可能放大（长焦）或画质差（微距/景深）
- 原因：浏览器选择了**特殊镜头**（长焦/微距/景深），而不是主摄

---

## ✅ 已实现的兼容性优化

### 1. **自动镜头识别**（iOS + Android）
代码已增强 `initVideoDevices()` 函数，自动识别并排除：
- iOS: 长焦镜头（tele/telephoto/zoom）
- Android: 长焦（tele/zoom）、微距（macro）、景深（depth）

### 2. **zoom 约束优化**
添加 `zoom: 1.0` 约束，告诉浏览器"不要使用缩放镜头"。

### 3. **诊断工具**
提供 3 个调试工具，兼容 iOS 和 Android。

---

## 🛠️ 诊断工具使用指南

### 工具 1: `listAllCameras()` - 列出所有摄像头

**作用：** 查看设备上所有可用摄像头，识别镜头类型。

**使用方法：**
```javascript
await listAllCameras()
```

**输出示例（vivo 手机）：**
```
📱 可用摄像头:
┌───┬────┬──────────────────┬───────────────────────┬───────────┬────────┐
│序号│设备ID│      标签        │         类型          │   警告    │  推荐  │
├───┼────┼──────────────────┼───────────────────────┼───────────┼────────┤
│ 0 │ xx │ Front Camera     │ 🤳 前置摄像头         │           │ ⚪ 可用│
│ 1 │ yy │ Back Camera (0)  │ ✅ Android 主摄       │           │ ✅ 推荐│
│ 2 │ zz │ Back Camera (2)  │ 🔍 ⚠️ 长焦镜头       │ 会导致放大│ ❌ 不推荐│
│ 3 │ ww │ Back Camera (3)  │ 🔬 ⚠️ 微距镜头       │ 不适合通话│ ❌ 不推荐│
└───┴────┴──────────────────┴───────────────────────┴───────────┴────────┘
```

---

### 工具 2: `checkCurrentCamera()` - 检查当前使用的镜头

**作用：** 查看当前正在使用的是哪个镜头，是否正确。

**使用方法：**
```javascript
await checkCurrentCamera()
```

**输出示例（如果使用了错误的镜头）：**
```
📸 当前摄像头:
- 镜头类型: 🔍 ⚠️ 长焦镜头 (Telephoto)
- 分辨率: 960x540

💡 诊断建议:
⚠️ 检测到可能使用长焦镜头，这会导致画面放大！
   解决方案：运行 forceLensSelection("main") 强制切换到主摄。
```

---

### 工具 3: `forceLensSelection()` - 强制切换镜头

**作用：** 强制切换到指定的镜头类型。

**使用方法：**
```javascript
// 方式 1: 切换到主摄（推荐，兼容 iOS 和 Android）
await forceLensSelection('main')

// 方式 2: 切换到广角（主要用于 iOS）
await forceLensSelection('wide')

// 方式 3: 切换到超广角（如果需要更宽视野）
await forceLensSelection('ultrawide')
```

**选择建议：**
- **Android 用户（vivo/小米/华为等）：** 使用 `'main'`
- **iOS 用户（iPhone）：** 使用 `'wide'` 或 `'main'` 都可以

---

## 📝 完整诊断流程

### 步骤 1: 诊断问题

1. 开始视频通话
2. 如果发现后置摄像头画面有问题（放大/缩小），打开浏览器控制台
3. 运行诊断工具：

```javascript
// 1. 查看所有摄像头
await listAllCameras()

// 2. 检查当前使用的镜头
await checkCurrentCamera()
```

### 步骤 2: 判断问题

根据 `checkCurrentCamera()` 的输出判断：

| 镜头类型 | 是否正常 | 现象 |
|---------|---------|------|
| ✅ Android 主摄 / iOS 主摄广角 | ✅ 正常 | 视野标准 |
| 🔍 长焦镜头 | ❌ 异常 | **画面放大，视野变窄** |
| 🔬 微距镜头 | ❌ 异常 | 画质差，只能近距离清晰 |
| 📷 景深镜头 | ❌ 异常 | 画质很差，黑白或模糊 |
| 📐 超广角 | ⚪ 特殊 | 视野很宽（可能太宽） |

### 步骤 3: 解决问题

如果使用了错误的镜头，运行强制切换：

```javascript
// Android（vivo/小米/华为/OPPO）
await forceLensSelection('main')

// iOS（iPhone）
await forceLensSelection('wide')
```

### 步骤 4: 验证结果

切换后再次检查：

```javascript
await checkCurrentCamera()
```

确认镜头类型显示为 `✅ Android 主摄` 或 `✅ iOS 主摄广角`。

---

## 🎯 不同设备的特殊说明

### vivo 手机

**摄像头标签格式：**
- `Back Camera (0)` - 主摄（✅ 推荐使用）
- `Back Camera (2)` - 可能是长焦或微距（❌ 不推荐）
- `Front Camera` - 前置

**推荐命令：**
```javascript
await forceLensSelection('main')
```

---

### 小米手机

**摄像头标签格式：**
- `camera2 0, facing back` - 主摄（✅ 推荐）
- `camera2 2, facing back` - 可能是超广角
- `camera2 3, facing back` - 可能是长焦或微距

**推荐命令：**
```javascript
await forceLensSelection('main')
```

---

### 华为/荣耀手机

**摄像头标签格式：**
- `Back Camera` 或 `Rear Camera` - 主摄（✅ 推荐）
- `Back Camera (Wide)` - 主摄广角
- `Back Camera (Tele)` - 长焦（❌ 不推荐）

**推荐命令：**
```javascript
await forceLensSelection('main')
```

---

### OPPO 手机

**摄像头标签格式：**
- `Camera 0` - 通常是主摄（✅ 推荐）
- `Camera 2` - 可能是其他镜头

**推荐命令：**
```javascript
await forceLensSelection('main')
```

---

### iPhone（Pro 系列）

**摄像头标签格式：**
- `Back Camera Wide` - 主摄广角（✅ 推荐）
- `Back Camera Ultra Wide` - 超广角
- `Back Camera Telephoto` - 长焦（❌ 不推荐）

**推荐命令：**
```javascript
await forceLensSelection('wide')
```

---

## 🔧 代码层面的自动优化

### 优化 1: 自动排除特殊镜头

`initVideoDevices()` 函数已增强，自动排除：

```javascript
// iOS 排除规则
if (label.includes('tele') || label.includes('zoom')) {
    console.warn('⚠️ 跳过长焦镜头');
    return; // 跳过
}

// Android 排除规则
if (label.includes('macro') || label.includes('depth')) {
    console.warn('⚠️ 跳过微距/景深镜头');
    return; // 跳过
}
```

### 优化 2: 优先级排序

后置摄像头选择优先级（从高到低）：

1. **Android 主摄**（`main`/`primary`/`camera 0`）- 优先级 10
2. **iOS 主摄广角**（`wide` 但不是 `ultra`）- 优先级 10
3. **Android 广角**（`wide angle`）- 优先级 9
4. **普通后置**（`back`/`rear`）- 优先级 8
5. **超广角**（`ultra wide`）- 优先级 5

### 优化 3: zoom 约束

```javascript
// 添加 zoom: 1.0 约束，防止使用长焦
const videoTrack = await createMirroredLocalVideoTrack({
    facingMode: { ideal: 'environment' },
    width: { ideal: 960, min: 448 },
    height: { ideal: 540, min: 448 },
    aspectRatio: { ideal: 16 / 9 },
    frameRate: { ideal: 30, max: 30 },
    zoom: 1.0 // 🔥 关键优化：不缩放
}, false);
```

---

## 📊 对比测试方法

### 如何判断是否使用了正确的镜头？

**方法 1: 视野对比（最直观）**

1. 保持 Web 页面的后置摄像头画面
2. 找一个固定参照物（如门框、窗户）
3. 打开手机相机 App，切换到后置 1x
4. 对比两者视野：
   - ✅ **视野一致** → 正确使用主摄
   - 🔍 **Web 画面更窄/放大** → 使用了长焦
   - 📐 **Web 画面更宽** → 使用了超广角

**方法 2: 运行诊断工具**

```javascript
await checkCurrentCamera()
```

查看 `镜头类型` 是否显示 `✅`。

---

## 🚀 快速测试脚本

在控制台一次性运行：

```javascript
// 完整诊断流程
(async () => {
    console.log('=== 📱 开始诊断摄像头 ===\n');
    
    console.log('1️⃣ 列出所有摄像头:');
    await listAllCameras();
    
    console.log('\n2️⃣ 检查当前使用的镜头:');
    await checkCurrentCamera();
    
    console.log('\n3️⃣ 诊断完成！');
    console.log('💡 如果发现使用了错误的镜头，运行以下命令切换:');
    console.log('   Android: await forceLensSelection("main")');
    console.log('   iOS: await forceLensSelection("wide")');
})();
```

---

## ❓ 常见问题

### Q1: 为什么 Android 手机会选择长焦/微距镜头？

**A:** WebRTC 使用 `facingMode: 'environment'` 时，浏览器会自动选择一个后置摄像头。某些设备上，浏览器可能错误地选择了特殊镜头（长焦/微距/景深），而不是主摄。

---

### Q2: `forceLensSelection()` 会永久生效吗？

**A:** 不会。刷新页面后会重新选择镜头。建议在应用初始化时自动运行。

---

### Q3: vivo 手机识别不到标签怎么办？

**A:** 如果 `listAllCameras()` 显示标签为空，尝试：
1. 检查浏览器权限（设置 → 应用管理 → 浏览器 → 权限 → 相机）
2. 使用 Chrome 或 Edge 浏览器（支持更好）
3. 运行 `forceLensSelection('main')`，代码会尝试宽松匹配

---

### Q4: 切换后还是有问题怎么办？

**A:** 尝试以下步骤：
1. 清除摄像头缓存：`clearCameraCache()`
2. 刷新页面，重新开始通话
3. 运行 `await forceLensSelection('main')` 或 `'wide'`
4. 如果仍有问题，运行 `listAllCameras()` 并发送输出给开发者

---

## 📚 相关文档

- [LiveKit 官方文档](https://docs.livekit.io/)
- [WebRTC getUserMedia 约束](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [iOS Safari 摄像头权限](https://support.apple.com/guide/iphone/control-access-to-hardware-features-iph251e92810/ios)

---

## 🎉 总结

✅ **已兼容 iOS 和 Android 设备**  
✅ **自动排除长焦/微距/景深镜头**  
✅ **提供完整的诊断工具**  
✅ **支持手动强制切换镜头**

如果遇到问题，请使用诊断工具并将输出发送给开发团队！
