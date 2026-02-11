# 📱 Android Camera2 API 摄像头识别指南

> 解决 `camera2 X, facing back` 格式摄像头的识别和选择问题

---

## 🎯 问题背景

### 用户反馈的问题

用户在安卓手机上看到的后置摄像头设备：

```javascript
[
  { cameraType: "通用后置", label: 'camera2 4, facing back', priority: 7},
  { cameraType: "通用后置", label: 'camera2 3, facing back', priority: 7},
  { cameraType: "通用后置", label: 'camera2 2, facing back', priority: 7},
  { cameraType: "通用后置", label: 'camera2 0, facing back', priority: 7}
]
```

**问题：**
- ❌ 所有摄像头都被识别为"通用后置"，优先级相同（7）
- ❌ 选择了 `camera2 4`（数组第一个），导致画面放大
- ✅ 应该选择 `camera2 0`（主摄）

---

## 📚 Android Camera2 API 摄像头编号规则

### 标准编号约定

根据 Android Camera2 API 标准：

| 编号 | 含义 | 是否推荐 | 说明 |
|------|------|---------|------|
| **camera2 0** | 主后置摄像头 | ✅ **推荐** | 默认后置摄像头，通常是主摄广角 |
| **camera2 1** | 前置摄像头 | ✅ 推荐（前置） | 默认前置摄像头 |
| **camera2 2** | 辅助镜头 | ⚪ 可用 | 可能是超广角、长焦或其他辅助镜头 |
| **camera2 3** | 特殊镜头 | ❌ 不推荐 | 通常是长焦、微距或景深镜头 |
| **camera2 4** | 特殊镜头 | ❌ 不推荐 | 通常是长焦、微距或景深镜头 |

**注意：** 
- 不同设备可能有不同的编号方式
- 部分设备可能没有 camera2 2/3/4
- **camera2 0** 是最稳定的选择，几乎所有设备都有

---

## ✅ 已实现的优化

### 1. **优先级自动识别**

修改后的识别逻辑：

```javascript
const camera2Match = label.match(/camera2?\s+(\d+)/);
if (camera2Match && label.includes('back')) {
    const cameraId = parseInt(camera2Match[1]);
    
    if (cameraId === 0) {
        // camera2 0 = 主后置摄像头（最高优先级）
        priority = 10;
        cameraType = 'Android 主摄 (camera2 0)';
    } else if (cameraId === 2) {
        // camera2 2 = 辅助镜头（中等优先级）
        priority = 6;
        cameraType = 'Android 辅助镜头 (camera2 2)';
    } else if (cameraId === 3 || cameraId === 4) {
        // camera2 3/4 = 特殊镜头（低优先级）
        priority = 3;
        cameraType = `Android 特殊镜头 (camera2 ${cameraId})`;
    }
}
```

### 2. **优先级排序（从高到低）**

| 镜头类型 | 优先级 | 说明 |
|---------|-------|------|
| **camera2 0** | 10 | 主摄（最高） |
| iOS 主摄广角 | 10 | iOS Wide |
| Android 主摄 (main/primary) | 10 | 明确标注的主摄 |
| Android 广角 | 9 | Wide angle |
| Android 默认后置 (camera 0) | 8 | 旧格式 |
| 通用后置 | 7 | 普通后置 |
| **camera2 2** | 6 | 辅助镜头 |
| 超广角 | 5 | Ultra wide |
| **camera2 3/4** | 3 | 特殊镜头 |

**现在的选择逻辑：**
1. 先按优先级排序（从高到低）
2. 优先级相同时，按数组顺序
3. 最终选择优先级最高的镜头

---

## 🔍 诊断结果对比

### 修复前（错误）

```javascript
listAllCameras()

// 输出：
[
  { 类型: "📷 通用后置", 标签: "camera2 4, facing back", 推荐: "⚪ 可用" },  // ❌ 被选中
  { 类型: "📷 通用后置", 标签: "camera2 3, facing back", 推荐: "⚪ 可用" },
  { 类型: "📷 通用后置", 标签: "camera2 2, facing back", 推荐: "⚪ 可用" },
  { 类型: "📷 通用后置", 标签: "camera2 0, facing back", 推荐: "⚪ 可用" }
]

// 问题：所有优先级都是 7，选择了第一个（camera2 4）
```

### 修复后（正确）

```javascript
listAllCameras()

// 输出：
[
  { 类型: "✅ Android 主摄 (camera2 0)", 标签: "camera2 0, facing back", 推荐: "✅ 推荐使用" },  // ✅ 被选中
  { 类型: "📐 Android 辅助镜头 (camera2 2)", 标签: "camera2 2, facing back", 推荐: "⚪ 可用" },
  { 类型: "🔍 ⚠️ Android 特殊镜头 (camera2 3)", 标签: "camera2 3, facing back", 推荐: "❌ 不推荐" },
  { 类型: "🔍 ⚠️ Android 特殊镜头 (camera2 4)", 标签: "camera2 4, facing back", 推荐: "❌ 不推荐" }
]

// 优先级：10, 6, 3, 3
// 自动选择优先级最高的 camera2 0 ✅
```

---

## 🚀 自动修复流程

### 1. 自动诊断（通话开始时）

```
============================================================
📱 [自动诊断] 开始检测摄像头...
============================================================

📋 步骤 1/3: 列出所有可用摄像头
✅ 找到 4 个摄像头
┌───┬──────────┬──────────────────────────┬─────────────────────┬────────┐
│序号│ 设备ID   │         标签             │        类型         │  推荐  │
├───┼──────────┼──────────────────────────┼─────────────────────┼────────┤
│ 0 │ xxx...   │ camera2 0, facing back   │ ✅ Android 主摄     │ ✅ 推荐│
│ 1 │ yyy...   │ camera2 2, facing back   │ 📐 辅助镜头         │ ⚪ 可用│
│ 2 │ zzz...   │ camera2 3, facing back   │ 🔍 ⚠️ 特殊镜头     │ ❌ 不推荐│
│ 3 │ www...   │ camera2 4, facing back   │ 🔍 ⚠️ 特殊镜头     │ ❌ 不推荐│
└───┴──────────┴──────────────────────────┴─────────────────────┴────────┘

📋 步骤 2/3: 检查当前使用的镜头
📸 当前摄像头:
- 镜头类型: ✅ Android 主摄 (camera2 0)
- 分辨率: 960x540

📋 步骤 3/3: 自动分析结果
============================================================

✅✅✅ 诊断通过！✅✅✅
当前使用的是推荐镜头: ✅ Android 主摄 (camera2 0)
视频质量应该是正常的 👍

============================================================
```

### 2. 如果仍选择了错误的镜头

```
⚠️⚠️⚠️ 检测到问题！⚠️⚠️⚠️
当前使用了不推荐的镜头: 🔍 ⚠️ Android 特殊镜头 (camera2 4)

💡 解决方案:
请将以下信息截图发给技术支持，我们会帮您切换镜头
```

### 3. 手动切换（开发者）

```javascript
// 强制切换到主摄
await forceLensSelection('main')

// 输出：
✅ 选择镜头: camera2 0, facing back
✅ 镜头切换成功!
   设备ID: xxx...
   label: camera2 0, facing back
   分辨率: 960x540
   帧率: 30 fps
```

---

## 📊 不同品牌的 camera2 编号

### vivo 手机

```
camera2 0 → 主摄 ✅
camera2 2 → 超广角 📐
camera2 3 → 可能是微距或景深 ⚠️
camera2 4 → 可能是长焦 ⚠️
```

### 小米手机

```
camera2 0 → 主摄 ✅
camera2 2 → 超广角 📐
camera2 3 → 长焦或微距 ⚠️
```

### 华为/荣耀手机

```
camera2 0 → 主摄 ✅
camera2 2 → 超广角或长焦 📐/⚠️
camera2 3 → 其他镜头 ⚪
```

### OPPO 手机

```
camera2 0 → 主摄 ✅
camera2 2 → 超广角 📐
camera2 4 → 长焦或微距 ⚠️
```

**总结：** 无论哪个品牌，**camera2 0 始终是主摄**，是最安全的选择。

---

## 🔧 代码实现细节

### 正则表达式匹配

```javascript
// 匹配 "camera2 X" 或 "camera X" 格式
const camera2Match = label.match(/camera2?\s+(\d+)/);

// 示例：
'camera2 0, facing back'.match(/camera2?\s+(\d+)/)  // ['camera2 0', '0']
'camera 0, facing back'.match(/camera2?\s+(\d+)/)   // ['camera 0', '0']
'camera2 4, facing back'.match(/camera2?\s+(\d+)/)  // ['camera2 4', '4']
```

### 提取摄像头编号

```javascript
if (camera2Match) {
    const cameraId = parseInt(camera2Match[1]);  // 提取编号
    
    if (cameraId === 0) {
        // 主摄
    } else if (cameraId === 2) {
        // 辅助镜头
    } else if (cameraId === 3 || cameraId === 4) {
        // 特殊镜头
    }
}
```

### 优先级排序

```javascript
// 按优先级从高到低排序
backCandidates.sort((a, b) => b.priority - a.priority);

// 选择第一个（优先级最高）
cachedVideoDevices.back = backCandidates[0].deviceId;
```

---

## ✅ 测试验证

### 测试步骤

1. **打开 vConsole**，查看自动诊断结果

2. **运行诊断命令**（可选）：
   ```javascript
   await listAllCameras()
   await checkCurrentCamera()
   ```

3. **验证选择的镜头**：
   - 应该是 `camera2 0`
   - 显示 `✅ Android 主摄`
   - 推荐状态：`✅ 推荐使用`

4. **测试画面**：
   - 对比相机 App 的后置摄像头（1x）
   - 视野应该基本一致
   - 没有明显的放大或缩小

---

## 🎯 总结

### 问题根源
- 旧代码无法识别 `camera2 X` 格式
- 所有镜头优先级相同，选择了数组第一个

### 解决方案
- ✅ 增加 `camera2 X` 格式识别
- ✅ `camera2 0` 优先级设为 10（最高）
- ✅ `camera2 3/4` 优先级设为 3（最低）
- ✅ 自动选择优先级最高的镜头

### 兼容性
- ✅ iOS 设备（已有识别）
- ✅ Android 新格式（camera2 X）
- ✅ Android 旧格式（camera 0）
- ✅ 其他标准格式（main/primary/wide）

---

## 📞 技术支持

如果用户仍然遇到 `camera2 X` 相关问题：

1. **让用户运行** `listAllCameras()`，截图发送
2. **查看输出中的编号**，确认 camera2 0 是否被识别为主摄
3. **如果 camera2 0 没有被选中**，运行 `forceLensSelection('main')` 强制切换
4. **记录设备信息**，优化识别规则

---

**更新日期：** 2026-01-18  
**适用版本：** v3.0+  
**相关文档：** [摄像头兼容性指南](./CAMERA_COMPATIBILITY_GUIDE.md)
