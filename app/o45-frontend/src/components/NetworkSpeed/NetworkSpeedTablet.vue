<template>
    <div class="network-speed-tablet" :class="theme">
        <!-- 圆形按钮 -->
        <div class="speed-button" @click="showDetail = true">
            <SvgIcon :name="networkIcon" class="icon" />
        </div>

        <!-- 详细信息弹窗 -->
        <Transition name="slide-fade">
            <div v-if="showDetail" class="detail-card">
                <div class="card-content">
                    <div class="status-row">
                        <span class="label">{{ t('networkStatusLabel') }}</span>
                        <span class="status-value" :class="statusClass">{{ statusText }}</span>
                    </div>
                    <div v-if="speedMbps !== null" class="speed-row">
                        <span class="label">{{ t('networkSpeedLabel') }}</span>
                        <span class="speed-value">{{ speedMbps }}Mb/s</span>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- 点击遮罩层关闭弹窗 -->
        <div v-if="showDetail" class="overlay-backdrop" @click="showDetail = false"></div>
    </div>
</template>

<script setup>
    import { ref, computed } from 'vue';
    import { useI18n } from 'vue-i18n';

    const { t } = useI18n();

    const showDetail = ref(false);

    const props = defineProps({
        isTesting: {
            type: Boolean,
            default: false
        },
        speedMbps: {
            type: Number,
            default: null
        },
        theme: {
            type: String,
            default: 'light', // 'light' or 'dark'
            validator: value => ['light', 'dark'].includes(value)
        }
    });

    // 获取网络质量等级：good (>=10), fair (5-10), poor (<5)
    const networkQuality = computed(() => {
        if (props.speedMbps === null) return 'unknown';
        if (props.speedMbps >= 10) return 'good';
        if (props.speedMbps >= 5) return 'fair';
        return 'poor';
    });

    const networkIcon = computed(() => {
        if (props.isTesting) {
            console.log('🔍 [NetworkSpeed-Tablet] 测速中');
            return 'network-signal';
        }
        const quality = networkQuality.value;
        const iconName = quality === 'good' ? 'network-good' : quality === 'fair' ? 'network-fair' : 'network-poor';
        console.log(`🔍 [NetworkSpeed-Tablet] 速度: ${props.speedMbps} Mbps, 质量: ${quality}, 图标: ${iconName}`);
        return iconName;
    });

    const statusClass = computed(() => {
        if (props.isTesting) return 'testing';
        if (props.speedMbps !== null) {
            return networkQuality.value; // good, fair, poor
        }
        return 'error';
    });

    const statusText = computed(() => {
        if (props.isTesting) return t('networkTesting');
        if (props.speedMbps !== null) {
            const quality = networkQuality.value;
            if (quality === 'good') return t('networkGood');
            if (quality === 'fair') return t('networkModerate');
            if (quality === 'poor') return t('networkPoor');
        }
        return t('networkError');
    });
</script>

<style lang="less" scoped>
    .network-speed-tablet {
        position: relative;

        // 圆形按钮
        .speed-button {
            width: 44px;
            height: 44px;
            border-radius: 90px;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s ease;
            // box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

            &:hover {
                transform: scale(1.05);
                // box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }

            &:active {
                transform: scale(0.95);
            }

            .icon {
                width: 20px;
                height: 20px;
            }
        }

        // 遮罩层（用于点击关闭）
        .overlay-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 999;
        }

        // 详情卡片（紧跟按钮下方）
        .detail-card {
            position: absolute;
            top: calc(100% + 8px);
            left: 0;
            background: #ffffff;
            border-radius: 20px;
            padding: 20px;
            box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.1);
            min-width: 280px;
            z-index: 1000;

            .card-content {
                display: flex;
                flex-direction: column;
                gap: 12px;

                .status-row,
                .speed-row {
                    display: flex;
                    align-items: center;
                    font-size: 16px;
                    line-height: 1.4;

                    .label {
                        font-weight: 400;
                        color: #595f6d;
                        margin-right: 8px;
                    }

                    // .status-value,
                    // .speed-value {
                    // }

                    .status-value {
                        &.testing {
                            color: #999;
                        }
                        &.good {
                            color: #3acc3d;
                        }
                        &.fair {
                            color: #e9a81c;
                        }
                        &.poor {
                            color: #e9301c;
                        }
                        &.error {
                            color: #ff4d4f;
                        }
                    }

                    .speed-value {
                        color: #595f6d;
                    }
                }
            }
        }

        // 深色主题（视频通话）
        &.dark {
            .speed-button {
                background: rgba(0, 0, 0, 0.3);
            }

            .detail-card {
                background: rgba(30, 30, 30, 0.95);
                backdrop-filter: blur(20px);

                .card-content {
                    .label {
                        color: rgba(255, 255, 255, 0.7);
                    }

                    .speed-value {
                        color: #fff;
                    }
                }
            }
        }
    }

    // 过渡动画（向下滑出）
    .slide-fade-enter-active {
        transition: all 0.25s ease-out;
    }

    .slide-fade-leave-active {
        transition: all 0.2s ease-in;
    }

    .slide-fade-enter-from {
        transform: translateY(-12px);
        opacity: 0;
    }

    .slide-fade-leave-to {
        transform: translateY(-8px);
        opacity: 0;
    }
</style>
