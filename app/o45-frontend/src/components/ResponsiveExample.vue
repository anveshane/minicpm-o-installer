<!--
  响应式设计示例组件
  展示如何在实际项目中使用多端适配功能
-->
<template>
    <div class="responsive-example">
        <!-- 设备信息显示（开发调试用） -->
        <div class="device-info" v-if="showDebugInfo">
            <h3>📱 当前设备信息</h3>
            <ul>
                <li>
                    设备类型: <strong>{{ deviceTypeLabel }}</strong>
                </li>
                <li>
                    屏幕方向: <strong>{{ orientationLabel }}</strong>
                </li>
                <li>屏幕尺寸: {{ screenInfo }}</li>
            </ul>
        </div>

        <!-- 方法一：使用 v-if 条件渲染 -->
        <section class="method-1">
            <h4>方法一：条件渲染（v-if）</h4>
            <div v-if="isPc" class="content-box pc-content">
                <h5>🖥️ PC 专用布局</h5>
                <p>这是只在 PC 上显示的内容</p>
            </div>
            <div v-else-if="isTablet" class="content-box tablet-content">
                <h5>📱 平板布局</h5>
                <p>平板横屏和竖屏共用此布局</p>
                <p>当前方向: {{ orientation }}</p>
            </div>
            <div v-else-if="isMobile" class="content-box mobile-content">
                <h5>📱 手机专用布局</h5>
                <p>这是手机专用的布局</p>
            </div>
        </section>

        <!-- 方法二：使用 CSS 类名 -->
        <section class="method-2">
            <h4>方法二：CSS 类名控制</h4>
            <div class="pc-only content-box pc-content">
                <p>🖥️ PC only (使用 .pc-only 类)</p>
            </div>
            <div class="tablet-only content-box tablet-content">
                <p>📱 Tablet only (使用 .tablet-only 类)</p>
            </div>
            <div class="mobile-only content-box mobile-content">
                <p>📱 Mobile only (使用 .mobile-only 类)</p>
            </div>
        </section>

        <!-- 方法三：响应式 CSS 变量 -->
        <section class="method-3">
            <h4>方法三：响应式 CSS 变量</h4>
            <div class="responsive-container">
                <button class="responsive-button">
                    <span class="responsive-icon">🎯</span>
                    自适应按钮
                </button>
                <p class="responsive-text">
                    这个容器使用了响应式 CSS 变量，会根据设备类型自动调整：内边距、字体大小、按钮尺寸等
                </p>
            </div>
        </section>

        <!-- 方法四：横竖屏适配 -->
        <section class="method-4">
            <h4>方法四：横竖屏适配</h4>
            <div class="orientation-demo">
                <div v-if="isPortrait" class="portrait-layout">
                    <p>📱 竖屏布局</p>
                    <div class="demo-box">内容垂直排列</div>
                    <div class="demo-box">适合单列显示</div>
                </div>
                <div v-else class="landscape-layout">
                    <p>📱 横屏布局</p>
                    <div class="demo-boxes">
                        <div class="demo-box">内容</div>
                        <div class="demo-box">水平</div>
                        <div class="demo-box">排列</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 实际应用示例：视频控制按钮 -->
        <section class="method-5">
            <h4>实际应用：视频通话控制按钮</h4>
            <div class="video-controls-demo">
                <!-- PC：横向排列，小按钮 -->
                <div v-if="isPc" class="controls-horizontal">
                    <button class="control-btn">🎤 麦克风</button>
                    <button class="control-btn">📹 摄像头</button>
                    <button class="control-btn">📄 文本</button>
                    <button class="control-btn danger">📞 结束</button>
                </div>

                <!-- 平板：根据横竖屏切换布局 -->
                <div v-else-if="isTablet" :class="isPortrait ? 'controls-vertical' : 'controls-horizontal'">
                    <button class="control-btn">🎤</button>
                    <button class="control-btn">📹</button>
                    <button class="control-btn">🔄</button>
                    <button class="control-btn danger">📞</button>
                </div>

                <!-- 手机：纵向排列，大按钮 -->
                <div v-else-if="isMobile" class="controls-vertical">
                    <button class="control-btn large">🎤</button>
                    <button class="control-btn large">📹</button>
                    <button class="control-btn large">🔄</button>
                    <button class="control-btn large danger">📞</button>
                </div>
            </div>
        </section>

        <!-- 切换调试信息按钮 -->
        <button class="toggle-debug" @click="showDebugInfo = !showDebugInfo">
            {{ showDebugInfo ? '隐藏' : '显示' }} 调试信息
        </button>
    </div>
</template>

<script setup>
    import { ref, computed } from 'vue';
    import { useDevice } from '@/hooks/useDevice';

    // 使用设备检测 Hook
    const { deviceType, orientation, isPc, isTablet, isMobile, isPortrait, isLandscape, getDeviceInfo } = useDevice();

    // 调试信息开关
    const showDebugInfo = ref(true);

    // 设备类型标签
    const deviceTypeLabel = computed(() => {
        switch (deviceType.value) {
            case 'pc':
                return 'PC 桌面端';
            case 'tablet':
                return '平板设备';
            case 'mobile':
                return '手机设备';
            default:
                return '未知设备';
        }
    });

    // 屏幕方向标签
    const orientationLabel = computed(() => {
        return orientation.value === 'portrait' ? '竖屏' : '横屏';
    });

    // 屏幕信息
    const screenInfo = computed(() => {
        const info = getDeviceInfo();
        return `${info.screenWidth} x ${info.screenHeight}`;
    });
</script>

<style scoped>
    .responsive-example {
        max-width: 1200px;
        margin: 0 auto;
        padding: var(--device-padding);
    }

    /* 设备信息显示 */
    .device-info {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: var(--device-padding);
        border-radius: var(--device-border-radius);
        margin-bottom: var(--device-spacing);
    }

    .device-info h3 {
        margin: 0 0 12px 0;
        font-size: var(--device-font-size-large);
    }

    .device-info ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .device-info li {
        margin: 8px 0;
        font-size: var(--device-font-size);
    }

    /* 各个示例区块 */
    section {
        margin-bottom: calc(var(--device-spacing) * 2);
        padding: var(--device-padding);
        background: #f8f9fa;
        border-radius: var(--device-border-radius);
    }

    section h4 {
        margin: 0 0 16px 0;
        font-size: var(--device-font-size-large);
        color: #333;
    }

    .content-box {
        padding: 16px;
        border-radius: 8px;
        margin: 8px 0;
    }

    .pc-content {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }

    .tablet-content {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
    }

    .mobile-content {
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        color: white;
    }

    /* 方法三：响应式容器 */
    .responsive-container {
        padding: var(--device-padding);
        background: white;
        border-radius: var(--device-border-radius);
        text-align: center;
    }

    .responsive-button {
        width: auto;
        min-width: var(--device-button-size);
        height: var(--device-button-size);
        padding: 0 calc(var(--device-padding) * 1.5);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: var(--device-border-radius);
        font-size: var(--device-font-size);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s;
    }

    .responsive-button:hover {
        transform: scale(1.05);
    }

    .responsive-button:active {
        transform: scale(0.95);
    }

    .responsive-icon {
        font-size: var(--device-icon-size);
    }

    .responsive-text {
        margin-top: 16px;
        font-size: var(--device-font-size);
        color: #666;
    }

    /* 方法四：横竖屏布局 */
    .orientation-demo {
        background: white;
        padding: var(--device-padding);
        border-radius: var(--device-border-radius);
    }

    .portrait-layout {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .landscape-layout {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .demo-boxes {
        display: flex;
        gap: 12px;
    }

    .demo-box {
        flex: 1;
        padding: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 8px;
        text-align: center;
    }

    /* 视频控制按钮示例 */
    .video-controls-demo {
        background: #1a1a1a;
        padding: var(--device-padding);
        border-radius: var(--device-border-radius);
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 120px;
    }

    .controls-horizontal {
        display: flex;
        gap: var(--device-spacing);
        align-items: center;
    }

    .controls-vertical {
        display: flex;
        flex-direction: column;
        gap: var(--device-spacing);
        align-items: center;
    }

    .control-btn {
        width: var(--device-button-size);
        height: var(--device-button-size);
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.2);
        color: white;
        font-size: calc(var(--device-icon-size) * 0.8);
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .control-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.1);
    }

    .control-btn.large {
        width: calc(var(--device-button-size) * 1.2);
        height: calc(var(--device-button-size) * 1.2);
    }

    .control-btn.danger {
        background: #ff4444;
    }

    .control-btn.danger:hover {
        background: #ff6666;
    }

    /* 切换调试信息按钮 */
    .toggle-debug {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 24px;
        font-size: var(--device-font-size);
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        transition: all 0.2s;
    }

    .toggle-debug:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .toggle-debug:active {
        transform: translateY(0);
    }

    /* 移动设备优化 */
    @media screen and (max-width: 767px) {
        .responsive-example {
            padding: 12px;
        }

        section {
            padding: 12px;
        }

        .device-info {
            padding: 12px;
        }

        .toggle-debug {
            bottom: 12px;
            right: 12px;
            padding: 10px 20px;
            font-size: 12px;
        }
    }
</style>
