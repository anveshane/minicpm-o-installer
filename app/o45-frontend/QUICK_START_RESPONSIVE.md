# 快速开始：在现有组件中集成响应式适配

## 🚀 5 分钟快速集成

### 步骤 1：在现有组件中引入 Hook

在 `Video_new_rtc.vue` 或其他组件中：

```vue
<script setup>
    // ... 现有的 import
    import { useDevice } from '@/hooks/useDevice';

    // 添加设备检测
    const { isPc, isTablet, isMobile, isPortrait, isLandscape } = useDevice();

    // ... 其他代码保持不变
</script>
```

### 步骤 2：替换现有的 isMobile() 调用

**Before:**

```vue
<div v-if="isMobile() && isCalling && !loading" class="switch-camera-icon"></div>
```

**After (更精确):**

```vue
<div v-if="(isMobile || isTablet) && isCalling && !loading" class="switch-camera-icon"></div>
```

### 步骤 3：根据设备类型调整布局

```vue
<template>
    <div class="video-page">
        <div class="video-page-container">
            <video ref="videoRef" autoplay playsinline muted />

            <!-- 摄像头切换按钮：平板和手机显示 -->
            <div v-if="(isMobile || isTablet) && isCalling" class="switch-camera-icon" @click="handleSwitchCamera">
                <SvgIcon name="switch-camera" />
            </div>
        </div>

        <!-- 控制按钮：根据设备类型使用不同布局 -->
        <div class="video-page-btn">
            <!-- PC 布局 -->
            <div v-if="isPc" class="controls-pc">
                <button @click="toggleMic">麦克风</button>
                <button @click="toggleCamera">摄像头</button>
                <button @click="stopRecording">结束通话</button>
            </div>

            <!-- 平板布局（横竖屏共用） -->
            <div v-else-if="isTablet" class="controls-tablet">
                <button @click="toggleMic">麦克风</button>
                <button @click="toggleCamera">摄像头</button>
                <button @click="stopRecording">结束通话</button>
            </div>

            <!-- 手机布局 -->
            <div v-else class="controls-mobile">
                <button @click="toggleMic">麦克风</button>
                <button @click="toggleCamera">摄像头</button>
                <button @click="stopRecording">结束通话</button>
            </div>
        </div>
    </div>
</template>
```

### 步骤 4：使用响应式 CSS 变量

在样式中使用 CSS 变量，自动适配不同设备：

```vue
<style scoped lang="less">
    .switch-camera-icon {
        position: absolute;
        top: var(--device-padding); /* 自动适配：PC 24px, 平板 20px, 手机 16px */
        right: var(--device-padding);
        width: var(--device-button-size); /* 自动适配：PC 48px, 平板 56px, 手机 64px */
        height: var(--device-button-size);
        background: rgba(0, 0, 0, 0.4);
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999;
        cursor: pointer;

        .icon {
            width: var(--device-icon-size); /* 自动适配：PC 24px, 平板 28px, 手机 32px */
            height: var(--device-icon-size);
            color: #ffffff;
        }
    }

    /* 控制按钮布局 */
    .controls-pc {
        display: flex;
        gap: 16px;
        justify-content: center;
    }

    .controls-tablet {
        display: flex;
        gap: 14px;
        justify-content: center;
    }

    .controls-mobile {
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: center;
    }

    /* 或者使用媒体查询统一处理 */
    .video-page-btn button {
        width: var(--device-button-size);
        height: var(--device-button-size);
        border-radius: var(--device-border-radius);
        font-size: var(--device-font-size);
    }
</style>
```

---

## 🎯 常见场景示例

### 场景 1：显示/隐藏特定功能

```vue
<template>
    <!-- 只在 PC 显示高级设置 -->
    <div v-if="isPc" class="advanced-settings">
        <button>高级设置</button>
    </div>

    <!-- 只在移动设备（平板+手机）显示简化菜单 -->
    <div v-if="isMobile || isTablet" class="simple-menu">
        <button>菜单</button>
    </div>

    <!-- 使用 CSS 类更简单 -->
    <div class="pc-only">只在 PC 显示</div>
    <div class="tablet-only">只在平板显示</div>
    <div class="mobile-only">只在手机显示</div>
</template>
```

### 场景 2：根据设备调整参数

```javascript
import { getDeviceType, DeviceType } from '@/utils/device';

// 根据设备类型设置不同的视频质量
const getVideoQuality = () => {
    const deviceType = getDeviceType();

    switch (deviceType) {
        case DeviceType.PC:
            return VideoPresets.h720; // PC 使用高清
        case DeviceType.TABLET:
            return VideoPresets.h540; // 平板使用中等
        case DeviceType.MOBILE:
            return VideoPresets.h360; // 手机使用标清
        default:
            return VideoPresets.h540;
    }
};

// 使用
const newVid = await createLocalVideoTrack({
    facingMode: newFacing,
    ...getVideoQuality()
});
```

### 场景 3：处理平板横竖屏

```vue
<template>
    <div class="chat-interface">
        <!-- 平板竖屏时使用上下布局 -->
        <div v-if="isTablet && isPortrait" class="chat-vertical">
            <div class="video-area">视频</div>
            <div class="controls-area">控制</div>
        </div>

        <!-- 平板横屏时使用左右布局 -->
        <div v-else-if="isTablet && isLandscape" class="chat-horizontal">
            <div class="video-area">视频</div>
            <div class="controls-area">控制</div>
        </div>

        <!-- PC 和手机使用各自布局 -->
        <div v-else class="chat-default">
            <!-- ... -->
        </div>
    </div>
</template>

<script setup>
    import { useDevice } from '@/hooks/useDevice';
    const { isTablet, isPortrait, isLandscape } = useDevice();
</script>

<style scoped>
    .chat-vertical {
        display: flex;
        flex-direction: column;
    }

    .chat-horizontal {
        display: flex;
        flex-direction: row;
    }

    .video-area {
        flex: 1;
    }

    .controls-area {
        flex-shrink: 0;
    }
</style>
```

### 场景 4：动态调整触摸事件

```vue
<template>
    <div
        class="interactive-element"
        @click="handleClick"
        @touchstart="isMobile ? handleTouchStart : null"
        @touchend="isMobile ? handleTouchEnd : null"
    >
        内容
    </div>
</template>

<script setup>
    import { useDeviceType } from '@/hooks/useDevice';

    const { isMobile } = useDeviceType();

    const handleClick = () => {
        console.log('点击事件');
    };

    const handleTouchStart = e => {
        // 移动设备特殊处理
        console.log('触摸开始');
    };

    const handleTouchEnd = e => {
        console.log('触摸结束');
    };
</script>
```

---

## 📝 迁移检查清单

### ✅ 已完成的工作

- [x] 创建 `src/utils/device.js` - 设备检测工具
- [x] 创建 `src/hooks/useDevice.js` - 响应式 Hook
- [x] 创建 `src/styles/responsive.css` - 响应式样式
- [x] 更新 `src/utils/index.js` - 导出新函数
- [x] 更新 `src/main.js` - 引入响应式样式

### 🔄 需要在现有组件中做的调整

1. **替换设备检测调用**

    ```javascript
    // 旧代码
    import { isMobile } from '@/utils';
    if (isMobile()) { ... }

    // 新代码（更精确）
    import { useDevice } from '@/hooks/useDevice';
    const { isPc, isTablet, isMobile } = useDevice();
    if (isMobile || isTablet) { ... }
    ```

2. **优化条件渲染**

    ```vue
    <!-- 旧代码 -->
    <div v-if="isMobile() && isCalling">...</div>

    <!-- 新代码 -->
    <div v-if="(isMobile || isTablet) && isCalling">...</div>
    ```

3. **使用响应式 CSS 变量**

    ```css
    /* 旧代码 */
    .button {
        width: 48px;
        padding: 16px;
    }

    /* 新代码（自动适配） */
    .button {
        width: var(--device-button-size);
        padding: var(--device-padding);
    }
    ```

---

## 🐛 常见问题解决

### Q1: 为什么在开发工具中切换设备，页面没有变化？

**A:** 需要刷新页面。如果还不行，检查是否正确引入了 `useDevice()` Hook。

### Q2: CSS 类名 `.mobile-only` 不生效？

**A:** 确保在 `main.js` 中引入了 `responsive.css`：

```javascript
import './styles/responsive.css';
```

### Q3: 如何在非组件文件中使用？

**A:** 使用工具函数而不是 Hook：

```javascript
import { getDeviceType, isPhone, isTablet } from '@/utils/device';

if (isPhone()) {
    // 手机设备处理
}
```

### Q4: 平板设备识别不准确？

**A:** 检查以下几点：

1. 确保浏览器支持 `navigator.maxTouchPoints`
2. 某些平板可能需要在 User Agent 中特殊处理
3. 可以在 `device.js` 中添加特定设备的识别逻辑

---

## 🎉 完成！

现在你可以：

1. ✅ 在任何组件中使用 `useDevice()` 获取设备信息
2. ✅ 使用 CSS 类名快速控制显示/隐藏
3. ✅ 使用 CSS 变量实现自动适配的尺寸
4. ✅ 监听屏幕方向变化做出响应
5. ✅ 区分 PC、平板、手机三种设备
6. ✅ 平板横竖屏使用同一套 UI

---

## 📚 更多资源

- [完整使用指南](./RESPONSIVE_DESIGN_GUIDE.md)
- [示例组件](./src/components/ResponsiveExample.vue)
- [设备检测工具](./src/utils/device.js)
- [响应式 Hook](./src/hooks/useDevice.js)

---

## 💡 提示

1. **优先使用 Composable**: 在 Vue 组件中使用 `useDevice()` 而不是直接调用函数
2. **CSS 优先**: 对于简单的显示/隐藏，使用 CSS 类名性能更好
3. **平板横竖屏共用**: 只在必要时区分平板的横竖屏，大部分情况共用一套 UI
4. **触摸优化**: 移动设备上确保可点击区域至少 44x44px
5. **测试**: 使用浏览器开发工具的设备模拟功能测试不同设备

---

**需要帮助？** 查看 [完整文档](./RESPONSIVE_DESIGN_GUIDE.md) 或搜索代码示例。
