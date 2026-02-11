<template>
    <div class="small-voice-box" v-if="status !== ''">
        <div class="small-voice-box-body">
            <div
                :class="`small-voice-box-body-bg  ${status === 'talking' ? 'talking' : ''} ${status === 'listening' ? 'listening' : ''}`"
            >
                <img
                    class="thinking-img"
                    v-if="status === 'thinking'"
                    src="https://appstatic.modelbest.cn/thinking-DfbcP5cK.gif"
                    alt="Thinking GIF"
                />
                <img
                    class="talking-img"
                    v-else-if="status === 'talking'"
                    src="https://appstatic.modelbest.cn/talking.gif"
                    alt="Talking GIF"
                />
                <img
                    class="listening-img"
                    v-else-if="status === 'listening'"
                    src="https://appstatic.modelbest.cn/listening.gif"
                    alt="Listening GIF"
                />
                <img
                    class="forbidden-img"
                    v-else-if="status === 'forbidden'"
                    src="https://appstatic.modelbest.cn/listening.gif"
                    alt="Forbidden GIF"
                />
                <img
                    class="connecting-img"
                    v-else-if="status === 'connecting'"
                    src="https://appstatic.modelbest.cn/connecting.gif"
                    alt="Connecting GIF"
                />
                <img
                    class="connecting-img"
                    v-else-if="status === 'initializing'"
                    src="https://appstatic.modelbest.cn/connecting.gif"
                    alt="Initializing GIF"
                />
            </div>
            <div class="small-voice-box-body-text">{{ label }}</div>
        </div>
        <div class="small-voice-box-circle talking" v-if="status === 'talking'"></div>
        <div class="small-voice-box-circle listening" v-if="status === 'listening' || status === 'forbidden'"></div>
    </div>
</template>
<script setup>
    import { useI18n } from 'vue-i18n';
    const { t } = useI18n();
    const props = defineProps({
        status: {
            type: String,
            default: 'thinking'
        }
    });

    // 🚀 优化：使用 computed 替代 watch，确保 label 立即同步更新
    const label = computed(() => {
        switch (props.status) {
            case 'connecting':
                return t('connecting');
            case 'initializing':
                return t('initializing');
            case 'listening':
                return t('listening');
            case 'thinking':
                return t('thinking');
            case 'talking':
                return t('talking');
            case 'forbidden':
                return '换一个问题聊吧～';
            default:
                return '';
        }
    });
</script>
<style lang="less" scoped>
    .small-voice-box {
        position: relative;
        width: 100%;
        height: 100%;
        user-select: none;
        &-body {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            &-bg {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                border-radius: 50%;
                width: 68px;
                height: 68px;
                background-image: linear-gradient(to bottom, #5699ff, #7a9fff);
                overflow: hidden;
                // animation: pulse 2s infinite ease-in-out;
                // animation-delay: 0.1s;
                img {
                    position: absolute;
                    border-radius: 50%;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    mix-blend-mode: screen;
                }
                img.thinking-img {
                    width: 86px;
                    height: 86px;
                }
                img.talking-img {
                    width: 88px;
                    height: 88px;
                }
                img.listening-img,
                img.forbidden-img {
                    width: 88px;
                    height: 88px;
                }
                img.connecting-img {
                    width: 110px;
                    height: 110px;
                }
                &.talking {
                    animation: pulse1 1.3s infinite ease-in-out;
                }
                &.listening {
                    animation: pulse2 3s infinite ease-in-out;
                    animation-delay: 0.1s;
                }
            }
            &-text {
                // content: attr(data-label);
                position: absolute;
                top: calc(50% + 36px);
                left: 50%;
                transform: translate(-50%, 0);
                text-wrap: nowrap;
                white-space: nowrap;
                color: #fff;
                // font-family: Roboto;
                font-size: 12px;
                font-style: normal;
                font-weight: 400;
                line-height: normal;
            }
        }

        &-circle {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 72px;
            height: 72px;
            border-radius: 50%;
            border: 1px solid rgba(131, 168, 255, 0.7);
            // animation: pulse 2s infinite ease-in-out;
            &.talking {
                animation: pulse1 1.3s infinite ease-in-out;
            }
            &.listening {
                animation: pulse2 3s infinite ease-in-out;
            }
        }
    }

    @keyframes pulse1 {
        0%,
        100% {
            transform: translate(-50%, -50%) scale(1);
        }
        50% {
            transform: translate(-50%, -50%) scale(1.05);
        }
    }
    @keyframes pulse2 {
        0%,
        100% {
            transform: translate(-50%, -50%) scale(1);
        }
        50% {
            transform: translate(-50%, -50%) scale(0.95);
        }
    }
</style>
