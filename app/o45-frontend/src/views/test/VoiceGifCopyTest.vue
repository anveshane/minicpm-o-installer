<template>
    <div class="voice-gif-test-page">
        <div class="test-header">
            <h1>动效组件测试页面</h1>
            <p>
                当前状态: <span class="current-status">{{ currentStatus }}</span> &nbsp;&nbsp;|&nbsp;&nbsp; 当前动画组:
                <span class="current-status">第{{ animationGroup }}组</span>
            </p>
        </div>

        <div class="test-content">
            <!-- 左侧：组件展示区 -->
            <div class="component-preview">
                <div class="preview-container">
                    <div class="voice-preview-box">
                        <VoiceGifCopy :status="currentStatus" :animationGroup="animationGroup" />
                    </div>
                </div>
            </div>

            <!-- 右侧：控制按钮区 -->
            <div class="control-panel">
                <h2>动画组切换</h2>
                <div class="animation-group-control">
                    <el-button :type="animationGroup === 1 ? 'primary' : ''" size="small" @click="animationGroup = 1">
                        第一组动画
                    </el-button>
                    <el-button :type="animationGroup === 2 ? 'primary' : ''" size="small" @click="animationGroup = 2">
                        第二组动画
                    </el-button>
                    <el-button :type="animationGroup === 3 ? 'primary' : ''" size="small" @click="animationGroup = 3">
                        第三组动画
                    </el-button>
                    <el-button :type="animationGroup === 4 ? 'primary' : ''" size="small" @click="animationGroup = 4">
                        第四组动画
                    </el-button>
                    <el-button :type="animationGroup === 5 ? 'primary' : ''" size="small" @click="animationGroup = 5">
                        第五组动画
                    </el-button>
                </div>

                <el-divider />

                <h2>状态控制按钮</h2>

                <div class="button-group">
                    <el-button
                        type="primary"
                        size="small"
                        :class="{ active: currentStatus === 'connecting' }"
                        @click="setStatus('connecting')"
                    >
                        连接中
                    </el-button>

                    <el-button
                        type="primary"
                        size="small"
                        :class="{ active: currentStatus === 'initializing' }"
                        @click="setStatus('initializing')"
                    >
                        初始化
                    </el-button>

                    <el-button
                        type="success"
                        size="small"
                        :class="{ active: currentStatus === 'listening' }"
                        @click="setStatus('listening')"
                    >
                        聆听中
                    </el-button>

                    <el-button
                        type="warning"
                        size="small"
                        :class="{ active: currentStatus === 'thinking' }"
                        @click="setStatus('thinking')"
                    >
                        思考中
                    </el-button>

                    <el-button
                        type="info"
                        size="small"
                        :class="{ active: currentStatus === 'talking' }"
                        @click="setStatus('talking')"
                    >
                        回答中
                    </el-button>
                </div>

                <el-divider />

                <h3>自动切换测试</h3>
                <div class="auto-control">
                    <el-button type="primary" @click="startAutoSwitch" :disabled="isAutoSwitching" size="small">
                        开始自动切换
                    </el-button>
                    <el-button type="danger" @click="stopAutoSwitch" :disabled="!isAutoSwitching" size="small">
                        停止自动切换
                    </el-button>
                </div>

                <div class="auto-config">
                    <div class="config-item">
                        <label>切换轮数：</label>
                        <el-input-number
                            v-model="totalRounds"
                            :min="1"
                            :max="100"
                            :disabled="isAutoSwitching"
                            size="small"
                        />
                    </div>

                    <div class="config-item">
                        <label>连接中时长（秒）：</label>
                        <el-input-number
                            v-model="connectingDuration"
                            :min="0.1"
                            :max="10"
                            :step="0.1"
                            :disabled="isAutoSwitching"
                            size="small"
                        />
                    </div>

                    <div class="config-item">
                        <label>初始化时长（秒）：</label>
                        <el-input-number
                            v-model="initializingDuration"
                            :min="0.1"
                            :max="10"
                            :step="0.1"
                            :disabled="isAutoSwitching"
                            size="small"
                        />
                    </div>

                    <div class="config-item">
                        <label>聆听中时长（秒）：</label>
                        <el-input-number
                            v-model="listeningDuration"
                            :min="0.1"
                            :max="10"
                            :step="0.1"
                            :disabled="isAutoSwitching"
                            size="small"
                        />
                    </div>

                    <div class="config-item">
                        <label>思考中时长（秒）：</label>
                        <el-input-number
                            v-model="thinkingDuration"
                            :min="0.1"
                            :max="10"
                            :step="0.1"
                            :disabled="isAutoSwitching"
                            size="small"
                        />
                    </div>

                    <div class="config-item">
                        <label>回答中时长（秒）：</label>
                        <el-input-number
                            v-model="talkingDuration"
                            :min="0.1"
                            :max="10"
                            :step="0.1"
                            :disabled="isAutoSwitching"
                            size="small"
                        />
                    </div>

                    <div class="progress-info" v-if="isAutoSwitching">
                        <p>当前轮次：{{ currentRound }} / {{ totalRounds }}</p>
                        <p>当前状态：{{ currentStatus }}</p>
                    </div>
                </div>

                <el-divider />

                <h3>状态说明</h3>
                <div class="status-description">
                    <ul>
                        <li><strong>connecting:</strong> 连接服务器中（仅第一轮）</li>
                        <li><strong>initializing:</strong> 初始化系统中（仅第一轮）</li>
                        <li><strong>listening:</strong> 正在聆听用户说话</li>
                        <li><strong>thinking:</strong> 模型思考中</li>
                        <li><strong>talking:</strong> 回答中</li>
                    </ul>
                    <p style="margin-top: 10px; font-size: 11px; color: #999">
                        自动切换流程：<br />
                        第1轮：连接中 → 初始化 → 聆听中 → 思考中 → 回答中<br />
                        第2+轮：聆听中 → 思考中 → 回答中
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, onUnmounted, watch } from 'vue';
    import VoiceGifCopy from '@/components/VoiceGifCopy/index.vue';

    // 当前状态
    const currentStatus = ref('thinking');

    // 当前动画组
    const animationGroup = ref(1);

    // 自动切换配置
    const isAutoSwitching = ref(false);
    const totalRounds = ref(3); // 总轮数
    const currentRound = ref(0); // 当前轮次

    // 每个阶段的时长（秒）
    const connectingDuration = ref(2);
    const initializingDuration = ref(2);
    const listeningDuration = ref(3);
    const thinkingDuration = ref(2);
    const talkingDuration = ref(4);

    let autoSwitchTimer = null;

    // 设置状态
    const setStatus = status => {
        stopAutoSwitch(); // 手动切换状态时停止自动切换
        currentStatus.value = status;
        console.log('状态已切换为:', status);
    };

    // 开始自动切换
    const startAutoSwitch = () => {
        if (isAutoSwitching.value) return;

        isAutoSwitching.value = true;
        currentRound.value = 1;

        // 第一轮的状态序列（包含 connecting 和 initializing）
        const firstRoundStates = [
            { status: 'connecting', duration: connectingDuration.value },
            { status: 'initializing', duration: initializingDuration.value },
            { status: 'listening', duration: listeningDuration.value },
            { status: 'thinking', duration: thinkingDuration.value },
            { status: 'talking', duration: talkingDuration.value }
        ];

        // 后续轮次的状态序列（不包含 connecting 和 initializing）
        const normalRoundStates = [
            { status: 'listening', duration: listeningDuration.value },
            { status: 'thinking', duration: thinkingDuration.value },
            { status: 'talking', duration: talkingDuration.value }
        ];

        let currentStateIndex = 0;
        let currentRoundStates = firstRoundStates;

        const switchToNextState = () => {
            if (currentStateIndex >= currentRoundStates.length) {
                // 当前轮次结束
                currentRound.value++;

                if (currentRound.value > totalRounds.value) {
                    // 所有轮次完成，停止
                    console.log('✅ 自动切换完成！');
                    stopAutoSwitch();
                    return;
                }

                // 开始下一轮（使用普通状态序列）
                currentStateIndex = 0;
                currentRoundStates = normalRoundStates;
                console.log(`\n🔄 开始第 ${currentRound.value} 轮\n`);
            }

            const stateConfig = currentRoundStates[currentStateIndex];
            currentStatus.value = stateConfig.status;
            console.log(
                `[轮次 ${currentRound.value}/${totalRounds.value}] ${stateConfig.status} (${stateConfig.duration}秒)`
            );

            currentStateIndex++;

            // 设置下一次切换的定时器
            autoSwitchTimer = setTimeout(switchToNextState, stateConfig.duration * 1000);
        };

        // 立即开始第一个状态
        switchToNextState();
    };

    // 停止自动切换
    const stopAutoSwitch = () => {
        if (autoSwitchTimer) {
            clearTimeout(autoSwitchTimer);
            autoSwitchTimer = null;
        }
        isAutoSwitching.value = false;
        currentRound.value = 0;
    };

    // 监听动画组切换
    watch(animationGroup, () => {
        stopAutoSwitch(); // 切换动画组时停止自动切换
        currentStatus.value = 'connecting'; // 自动切换到连接中状态
    });

    // 组件卸载时清理定时器
    onUnmounted(() => {
        stopAutoSwitch();
    });
</script>

<style lang="less" scoped>
    .voice-gif-test-page {
        width: 100vw;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 0;
        margin: 0;
        box-sizing: border-box;
        overflow: hidden;

        .test-header {
            text-align: center;
            color: white;
            padding: 10px 12px 6px 12px;
            flex-shrink: 0;

            h1 {
                font-size: 20px;
                margin: 0 0 4px 0;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                line-height: 1.2;
            }

            p {
                font-size: 12px;
                margin: 0;
                line-height: 1.3;

                .current-status {
                    font-weight: bold;
                    color: #ffd700;
                    padding: 4px 12px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 20px;
                }
            }
        }

        .test-content {
            display: flex;
            gap: 10px;
            max-width: 1400px;
            margin: 0 auto;
            flex: 1;
            min-height: 0;
            width: 100%;
            padding: 0 10px 10px 10px;
            box-sizing: border-box;

            @media (max-width: 1024px) {
                flex-direction: column;
                height: auto;
                overflow-y: auto;
            }

            .component-preview {
                flex: 1;
                background: white;
                border-radius: 12px;
                // padding: 10px;
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
                display: flex;
                flex-direction: column;
                min-height: 0;
                box-sizing: border-box;

                .preview-container {
                    width: 100%;
                    flex: 1;
                    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                    border-radius: 6px;
                    position: relative;
                    overflow: hidden;
                    min-height: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;

                    .voice-preview-box {
                        width: 214px;
                        height: 214px;
                        display: flex;
                        align-items: center;
                        justify-content: center;

                        :deep(.voice-box-body-bg) {
                            width: 214px;
                            height: 214px;
                        }

                        :deep(.group3-container) {
                            width: 214px;
                            height: 214px;
                        }

                        :deep(.group3-container canvas) {
                            max-width: 214px !important;
                            max-height: 214px !important;
                        }
                    }
                }
            }

            .control-panel {
                flex: 0 0 320px;
                background: white;
                border-radius: 12px;
                padding: 10px;
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
                display: flex;
                flex-direction: column;
                min-height: 0;
                max-height: 100%;
                overflow-y: auto;
                box-sizing: border-box;

                // 美化滚动条
                &::-webkit-scrollbar {
                    width: 6px;
                }

                &::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 3px;
                }

                &::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 3px;

                    &:hover {
                        background: #555;
                    }
                }

                @media (max-width: 1024px) {
                    flex: 0 0 auto;
                    overflow-y: visible;
                }

                h2 {
                    margin: 0 0 8px 0;
                    color: #333;
                    font-size: 16px;
                    line-height: 1.3;
                }

                h3 {
                    color: #666;
                    font-size: 14px;
                    margin: 8px 0 6px 0;
                    line-height: 1.3;
                }

                .button-group {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 5px;

                    .el-button {
                        transition: all 0.3s ease;

                        &.active {
                            box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
                            transform: scale(1.01);
                        }

                        &:last-child {
                            grid-column: 1 / -1;
                        }
                    }
                }

                .animation-group-control {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 6px;
                    margin-bottom: 0;

                    .el-button {
                        width: 100%;

                        // 第五个按钮占据整行
                        &:nth-child(5) {
                            grid-column: 1 / -1;
                        }
                    }
                }

                .auto-control {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 12px;

                    .el-button,
                    .el-input-number,
                    span {
                        margin-left: 0 !important;
                    }

                    .el-button {
                        flex: 1;
                    }
                }

                .auto-config {
                    margin-top: 12px;

                    .config-item {
                        display: flex;
                        align-items: center;
                        margin-bottom: 8px;
                        gap: 8px;

                        label {
                            font-size: 12px;
                            color: #666;
                            min-width: 120px;
                            flex-shrink: 0;
                        }

                        .el-input-number {
                            flex: 1;
                        }
                    }

                    .progress-info {
                        margin-top: 15px;
                        padding: 12px;
                        background: #f0f9ff;
                        border-radius: 6px;
                        border: 1px solid #409eff;

                        p {
                            margin: 4px 0;
                            font-size: 13px;
                            color: #409eff;
                            font-weight: 500;
                        }
                    }
                }

                .status-description {
                    ul {
                        margin: 0;
                        padding-left: 16px;

                        li {
                            margin: 3px 0;
                            line-height: 1.3;
                            color: #666;
                            font-size: 12px;

                            strong {
                                color: #409eff;
                            }
                        }
                    }
                }
            }
        }
    }

    :deep(.el-divider) {
        margin: 6px 0;
    }
</style>
