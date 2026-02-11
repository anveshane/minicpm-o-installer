<template>
    <div class="network-speed-web">
        <div class="speed-indicator" :class="statusClass">
            <div class="signal-icon">
                <SvgIcon :name="networkIcon" class="icon" />
            </div>
            <div class="speed-info">
                <span class="status-text">{{ statusText }}</span>
                <span v-if="speedMbps !== null" class="speed-value"> {{ t('speedLabel') }}: {{ speedMbps }}Mb/s </span>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed } from 'vue';
    import { useI18n } from 'vue-i18n';

    const { t } = useI18n();

    const props = defineProps({
        isTesting: {
            type: Boolean,
            default: false
        },
        speedMbps: {
            type: Number,
            default: null
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
            console.log('🔍 [NetworkSpeed] 测速中，使用 network-signal');
            return 'network-signal';
        }
        const quality = networkQuality.value;
        console.log(`🔍 [NetworkSpeed] 速度: ${props.speedMbps} Mbps, 质量: ${quality}`);
        if (quality === 'good') return 'network-good';
        if (quality === 'fair') return 'network-fair';
        if (quality === 'poor') return 'network-poor';
        return 'network-signal';
    });

    const statusClass = computed(() => {
        if (props.isTesting) return 'testing';
        if (props.speedMbps !== null) {
            return networkQuality.value; // good, fair, poor
        }
        return 'failed';
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
    .network-speed-web {
        position: fixed;
        left: 24px;
        bottom: 68px;
        z-index: 100;

        .speed-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 14px 20px;
            border-radius: 90px;
            background: #ffffff;
            transition: all 0.3s ease;

            .signal-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                // margin-right: 8px;

                .icon {
                    width: 20px;
                    height: 20px;
                }
            }

            .speed-info {
                display: flex;
                align-items: center;
                gap: 8px;

                .status-text {
                    font-size: 12px;
                    font-weight: 500;
                    line-height: 1;
                }

                .speed-value {
                    font-size: 12px;
                    color: #666;
                    font-weight: 400;
                    line-height: 1;
                }
            }

            &.testing {
                .signal-icon .icon {
                    color: #999;
                    animation: pulse 1.5s ease-in-out infinite;
                }
                .status-text {
                    color: #999;
                }
            }

            &.good {
                .signal-icon .icon {
                    width: 20px;
                    height: 20px;
                }
                .status-text {
                    color: #3acc3d;
                }
            }

            &.fair {
                .signal-icon .icon {
                    width: 20px;
                    height: 20px;
                }
                .status-text {
                    color: #e9a81c;
                }
            }

            &.poor {
                .signal-icon .icon {
                    width: 20px;
                    height: 20px;
                }
                .status-text {
                    color: #e9301c;
                }
            }

            &.failed {
                .signal-icon .icon {
                    color: #ff4d4f;
                }
                .status-text {
                    color: #ff4d4f;
                }
            }
        }
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }
</style>
