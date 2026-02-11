# 多端响应式适配使用指南

本项目支持 **PC、平板、手机** 三套 UI，其中平板的横屏和竖屏使用同一套 UI 适配。

## 📱 设备类型定义

- **PC**: 屏幕宽度 >= 1024px
- **平板**: 屏幕宽度 768px ~ 1023px（横屏和竖屏共用一套UI）
- **手机**: 屏幕宽度 < 768px（单独适配）

---

## 🛠️ 使用方法

### 方法一：使用 Vue Composable（推荐）

#### 1. 完整的设备检测 Hook

```vue
<template>
    <div class="container">
        <!-- 根据设备类型显示不同内容 -->
        <div v-if="isPc" class="pc-layout">PC 布局</div>
        <div v-else-if="isTablet" class="tablet-layout">
            平板布局（横屏和竖屏共用）
        </div>
        <div v-else-if="isMobile" class="mobile-layout">手机布局</div>

        <!-- 根据屏幕方向调整 -->
        <div v-if="isPortrait">竖屏模式</div>
        <div v-else>横屏模式</div>

        <!-- 显示设备信息（开发调试用） -->
        <div class="debug-info">
            <p>设备类型: {{ deviceType }}</p>
            <p>屏幕方向: {{ orientation }}</p>
        </div>
    </div>
</template>

<script setup>
import { useDevice } from '@/hooks/useDevice';

// 获取设备信息（响应式，会自动更新）
const {
    deviceType,    // 'pc' | 'tablet' | 'mobile'
    orientation,   // 'portrait' | 'landscape'
    isPc,          // 是否为 PC
    isTablet,      // 是否为平板
    isMobile,      // 是否为手机
    isPortrait,    // 是否为竖屏
    isLandscape,   // 是否为横屏
    getDeviceInfo  // 获取完整设备信息的方法
} = useDevice();

// 可以在需要时获取完整设备信息
const deviceInfo = getDeviceInfo();
console.log('设备信息:', deviceInfo);
</script>
```

#### 2. 简化版 Hook（只检测设备类型，不监听变化）

适合只需要初始设备类型的场景，性能更好：

```vue
<script setup>
import { useDeviceType } from '@/hooks/useDevice';

// 只在组件初始化时检测一次
const { isPc, isTablet, isMobile, deviceType } = useDeviceType();
</script>
```

#### 3. 屏幕方向检测 Hook

只需要监听屏幕方向变化的场景：

```vue
<script setup>
import { useOrientation } from '@/hooks/useDevice';

const { orientation, isPortrait, isLandscape } = useOrientation();
</script>
```

---

### 方法二：直接调用工具函数

适合在非 Vue 组件中使用（如工具函数、配置文件）：

```javascript
import {
    isMobile,
    isTablet,
    isPhone,
    getDeviceType,
    getOrientation,
    isPortrait,
    isLandscape,
    getDeviceInfo,
    DeviceType,
    Orientation
} from '@/utils/device';

// 检测设备类型
if (isTablet()) {
    console.log('当前是平板设备');
}

// 获取设备类型
const deviceType = getDeviceType(); // 'pc' | 'tablet' | 'mobile'

// 检测屏幕方向
if (isPortrait()) {
    console.log('当前是竖屏');
}

// 获取完整设备信息
const deviceInfo = getDeviceInfo();
console.log(deviceInfo);
/*
{
    deviceType: 'tablet',
    orientation: 'portrait',
    isPortrait: true,
    isLandscape: false,
    isPc: false,
    isTablet: true,
    isMobile: false,
    screenWidth: 768,
    screenHeight: 1024,
    userAgent: '...'
}
*/
```

---

### 方法三：使用 CSS 类名（最简单）

在模板中直接使用预定义的 CSS 类名：

```vue
<template>
    <div class="container">
        <!-- 只在对应设备显示 -->
        <div class="pc-only">只在 PC 显示</div>
        <div class="tablet-only">只在平板显示</div>
        <div class="mobile-only">只在手机显示</div>

        <!-- Flex 布局 -->
        <div class="pc-only-flex">PC Flex 布局</div>
        <div class="tablet-only-flex">平板 Flex 布局</div>
        <div class="mobile-only-flex">手机 Flex 布局</div>

        <!-- 横竖屏控制 -->
        <div class="portrait-only">只在竖屏显示</div>
        <div class="landscape-only">只在横屏显示</div>

        <!-- 组合类：设备 + 方向 -->
        <div class="mobile-portrait-only">只在手机竖屏显示</div>
        <div class="mobile-landscape-only">只在手机横屏显示</div>
        <div class="tablet-portrait-only">只在平板竖屏显示</div>
        <div class="tablet-landscape-only">只在平板横屏显示</div>
    </div>
</template>
```

---

### 方法四：使用 CSS 变量（响应式尺寸）

在样式中使用预定义的 CSS 变量，会根据设备类型自动调整：

```vue
<template>
    <div class="responsive-container">
        <button class="responsive-button">
            <i class="responsive-icon">📱</i>
        </button>
    </div>
</template>

<style scoped>
.my-component {
    /* 自动适配的内边距 */
    padding: var(--device-padding);
    
    /* 自动适配的字体大小 */
    font-size: var(--device-font-size);
    
    /* 自动适配的圆角 */
    border-radius: var(--device-border-radius);
}

.custom-button {
    width: var(--device-button-size);
    height: var(--device-button-size);
}

.custom-icon {
    width: var(--device-icon-size);
    height: var(--device-icon-size);
}
</style>
```

#### 可用的 CSS 变量：

| 变量名 | PC | 平板 | 手机 | 说明 |
|--------|-----|------|------|------|
| `--device-padding` | 24px | 20px | 16px | 容器内边距 |
| `--device-font-size` | 14px | 14px | 14px | 基础字号 |
| `--device-font-size-large` | 16px | 15px | 15px | 大字号 |
| `--device-font-size-small` | 12px | 12px | 12px | 小字号 |
| `--device-button-size` | 48px | 56px | 64px | 按钮尺寸 |
| `--device-icon-size` | 24px | 28px | 32px | 图标尺寸 |
| `--device-border-radius` | 8px | 12px | 16px | 圆角大小 |
| `--device-spacing` | 16px | 14px | 12px | 元素间距 |
| `--device-header-height` | 64px | 60px | 56px | 顶部高度 |
| `--device-footer-height` | 80px | 90px | 100px | 底部高度 |

---

### 方法五：使用 CSS 媒体查询

在样式中使用媒体查询，精确控制不同设备的样式：

```vue
<style scoped>
/* PC 样式 */
.container {
    width: 1200px;
    margin: 0 auto;
}

/* 平板样式（横屏和竖屏共用） */
@media screen and (min-width: 768px) and (max-width: 1023px) {
    .container {
        width: 100%;
        padding: 0 20px;
    }
}

/* 手机样式 */
@media screen and (max-width: 767px) {
    .container {
        width: 100%;
        padding: 0 16px;
    }
    
    .video-controls {
        flex-direction: column;
    }
}

/* 竖屏特定样式 */
@media screen and (orientation: portrait) {
    .video-player {
        aspect-ratio: 9 / 16;
    }
}

/* 横屏特定样式 */
@media screen and (orientation: landscape) {
    .video-player {
        aspect-ratio: 16 / 9;
    }
}

/* 组合：平板竖屏 */
@media screen and (min-width: 768px) and (max-width: 1023px) and (orientation: portrait) {
    .sidebar {
        display: none;
    }
}
</style>
```

---

## 🎯 实际应用示例

### 示例 1：视频通话组件适配

```vue
<template>
    <div class="video-call-container">
        <!-- 视频画面 -->
        <video ref="videoRef" class="video-player" />
        
        <!-- 摄像头切换按钮：只在手机和平板显示 -->
        <div 
            v-if="!isPc && isCalling" 
            class="switch-camera-icon"
            @click="handleSwitchCamera"
        >
            <SvgIcon name="switch-camera" />
        </div>
        
        <!-- 控制按钮 -->
        <div class="controls">
            <!-- PC 使用横向布局 -->
            <div v-if="isPc" class="controls-horizontal">
                <button @click="toggleMic">麦克风</button>
                <button @click="toggleCamera">摄像头</button>
                <button @click="endCall">结束</button>
            </div>
            
            <!-- 手机使用纵向布局 -->
            <div v-else-if="isMobile" class="controls-vertical">
                <button @click="toggleMic">麦克风</button>
                <button @click="toggleCamera">摄像头</button>
                <button @click="endCall">结束</button>
            </div>
            
            <!-- 平板根据横竖屏切换布局 -->
            <div v-else-if="isTablet" :class="isPortrait ? 'controls-vertical' : 'controls-horizontal'">
                <button @click="toggleMic">麦克风</button>
                <button @click="toggleCamera">摄像头</button>
                <button @click="endCall">结束</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useDevice } from '@/hooks/useDevice';

const { isPc, isTablet, isMobile, isPortrait, isLandscape } = useDevice();

// ... 其他逻辑
</script>

<style scoped>
.video-call-container {
    position: relative;
    width: 100%;
    height: 100vh;
}

.video-player {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* 摄像头切换按钮 */
.switch-camera-icon {
    position: absolute;
    top: var(--device-padding);
    right: var(--device-padding);
    width: var(--device-button-size);
    height: var(--device-button-size);
    background: rgba(0, 0, 0, 0.4);
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
}

/* 控制按钮 */
.controls {
    position: absolute;
    bottom: var(--device-padding);
    left: 50%;
    transform: translateX(-50%);
}

.controls-horizontal {
    display: flex;
    gap: var(--device-spacing);
}

.controls-vertical {
    display: flex;
    flex-direction: column;
    gap: var(--device-spacing);
}

.controls button {
    width: var(--device-button-size);
    height: var(--device-button-size);
    border-radius: var(--device-border-radius);
    font-size: var(--device-font-size);
}
</style>
```

### 示例 2：侧边栏适配

```vue
<template>
    <div class="layout">
        <!-- PC: 固定侧边栏 -->
        <aside v-if="isPc" class="sidebar-fixed">
            <nav>导航菜单</nav>
        </aside>
        
        <!-- 平板: 可收起侧边栏 -->
        <aside v-else-if="isTablet" class="sidebar-collapsible" :class="{ collapsed: isCollapsed }">
            <nav>导航菜单</nav>
        </aside>
        
        <!-- 手机: 抽屉式侧边栏 -->
        <el-drawer v-else-if="isMobile" v-model="drawerVisible" direction="ltr">
            <nav>导航菜单</nav>
        </el-drawer>
        
        <main class="main-content">
            <!-- 主内容 -->
        </main>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useDevice } from '@/hooks/useDevice';

const { isPc, isTablet, isMobile } = useDevice();
const isCollapsed = ref(false);
const drawerVisible = ref(false);
</script>
```

### 示例 3：表单布局适配

```vue
<template>
    <div class="form-container">
        <!-- 使用响应式类名自动适配 -->
        <el-form :label-position="isPc ? 'right' : 'top'">
            <el-row :gutter="isPc ? 24 : 12">
                <!-- PC: 一行两列，平板和手机: 一行一列 -->
                <el-col :span="isPc ? 12 : 24">
                    <el-form-item label="姓名">
                        <el-input v-model="form.name" />
                    </el-form-item>
                </el-col>
                <el-col :span="isPc ? 12 : 24">
                    <el-form-item label="邮箱">
                        <el-input v-model="form.email" />
                    </el-form-item>
                </el-col>
            </el-row>
        </el-form>
    </div>
</template>

<script setup>
import { reactive } from 'vue';
import { useDevice } from '@/hooks/useDevice';

const { isPc } = useDevice();
const form = reactive({
    name: '',
    email: ''
});
</script>

<style scoped>
.form-container {
    padding: var(--device-padding);
}
</style>
```

---

## 🐛 调试技巧

### 1. 显示当前设备信息

在任何组件中添加调试信息：

```vue
<template>
    <div class="debug-device">
        <!-- 这个类会在右上角显示设备类型和方向 -->
        <p>设备: {{ deviceType }}</p>
        <p>方向: {{ orientation }}</p>
    </div>
</template>

<script setup>
import { useDevice } from '@/hooks/useDevice';
const { deviceType, orientation } = useDevice();
</script>
```

### 2. 在浏览器开发者工具中模拟不同设备

1. 打开 Chrome DevTools (F12)
2. 点击 "Toggle device toolbar" (Ctrl+Shift+M)
3. 选择不同的设备预设（iPhone、iPad 等）
4. 测试横竖屏切换

### 3. 在控制台查看设备信息

```javascript
import { getDeviceInfo } from '@/utils/device';
console.log(getDeviceInfo());
```

---

## 📝 最佳实践

### 1. 优先使用 Composable

在 Vue 组件中，优先使用 `useDevice()` 而不是直接调用工具函数，这样可以获得响应式更新。

### 2. 合理选择方法

- **只需要初始设备类型**: 使用 `useDeviceType()` (性能更好)
- **需要监听方向变化**: 使用 `useOrientation()`
- **需要完整的响应式更新**: 使用 `useDevice()`

### 3. CSS 优先

对于简单的显示/隐藏，优先使用 CSS 类名（如 `pc-only`），性能更好。

### 4. 平板横竖屏共用 UI

平板的横屏和竖屏应该使用同一套 UI，只在必要时做微调：

```vue
<script setup>
import { useDevice } from '@/hooks/useDevice';
const { isTablet, isPortrait } = useDevice();
</script>

<style scoped>
/* 平板基础样式（横竖屏共用） */
@media screen and (min-width: 768px) and (max-width: 1023px) {
    .container {
        padding: 20px;
    }
}

/* 只在必要时区分平板横竖屏 */
@media screen and (min-width: 768px) and (max-width: 1023px) and (orientation: portrait) {
    .sidebar {
        /* 竖屏时侧边栏调整 */
        width: 200px;
    }
}
</style>
```

### 5. 触摸优化

在移动设备上增大可点击区域：

```css
/* 移动设备上的按钮应该至少 44x44px */
@media screen and (max-width: 1023px) {
    button, .clickable {
        min-height: 44px;
        min-width: 44px;
    }
}
```

---

## 🔗 相关文件

- **设备检测工具**: `src/utils/device.js`
- **响应式 Hook**: `src/hooks/useDevice.js`
- **响应式样式**: `src/styles/responsive.css`
- **工具导出**: `src/utils/index.js`

---

## 📊 断点参考

| 设备 | 最小宽度 | 最大宽度 | CSS 变量 |
|------|---------|---------|----------|
| 手机 | 0 | 767px | `--breakpoint-mobile: 767px` |
| 平板 | 768px | 1023px | `--breakpoint-tablet-min: 768px`<br>`--breakpoint-tablet-max: 1023px` |
| PC | 1024px | ∞ | `--breakpoint-pc: 1024px` |

---

## ❓ 常见问题

### Q: 如何判断是否需要显示摄像头翻转按钮？

```javascript
import { isPhone, isTablet } from '@/utils/device';

// 只在手机和平板上显示翻转按钮
const showSwitchCamera = isPhone() || isTablet();
```

### Q: 平板上某个功能在横屏和竖屏需要不同处理怎么办？

```vue
<script setup>
import { useDevice } from '@/hooks/useDevice';
const { isTablet, isPortrait, isLandscape } = useDevice();

// 平板竖屏时使用特殊布局
const useSpecialLayout = computed(() => isTablet.value && isPortrait.value);
</script>
```

### Q: 如何在非 Vue 文件中使用？

```javascript
// 在普通 JS 文件中
import { getDeviceType, DeviceType } from '@/utils/device';

const deviceType = getDeviceType();
if (deviceType === DeviceType.MOBILE) {
    // 手机设备处理
}
```

### Q: 如何兼容旧代码？

所有旧的 `isMobile()` 调用都能正常工作，无需修改：

```javascript
// 旧代码（继续可用）
import { isMobile } from '@/utils';
if (isMobile()) {
    // ...
}

// 新代码（推荐）
import { isPhone, isTablet } from '@/utils/device';
if (isPhone()) {
    // 只在手机上执行
}
```

---

## 🎉 总结

本项目提供了 **5 种方法** 来实现多端适配：

1. ✅ **Vue Composable** - 响应式，自动更新（推荐）
2. ✅ **工具函数** - 适合非 Vue 环境
3. ✅ **CSS 类名** - 最简单，性能好
4. ✅ **CSS 变量** - 自动适配尺寸
5. ✅ **媒体查询** - 精确控制

根据实际场景选择合适的方法，优先使用 Composable 和 CSS 类名，这样既能保证功能完整，又能保持良好的性能。

