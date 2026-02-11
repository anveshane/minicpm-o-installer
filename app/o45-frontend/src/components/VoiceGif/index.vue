<template>
    <div class="voice-box" v-if="status !== ''">
        <div class="voice-box-body">
            <div
                :class="`voice-box-body-bg ${status === 'talking' ? 'talking' : ''} ${status === 'listening' ? 'listening' : ''}`"
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
                    alt="Thinking GIF"
                />
                <img
                    class="listening-img"
                    v-else-if="status === 'listening'"
                    src="https://appstatic.modelbest.cn/listening.gif"
                    alt="Thinking GIF"
                />
                <img
                    class="forbidden-img"
                    v-else-if="status === 'forbidden'"
                    src="https://appstatic.modelbest.cn/listening.gif"
                    alt="Thinking GIF"
                />
                <img
                    class="connecting-img"
                    v-else-if="status === 'connecting'"
                    src="https://appstatic.modelbest.cn/connecting.gif"
                    alt="Thinking GIF"
                />
                <img
                    class="connecting-img"
                    v-else-if="status === 'initializing'"
                    src="https://appstatic.modelbest.cn/connecting.gif"
                    alt="Thinking GIF"
                />
            </div>
            <div class="voice-box-body-text">{{ label }}</div>
        </div>
        <div class="voice-box-circle talking" v-if="status === 'talking'"></div>
        <div class="voice-box-circle listening" v-if="status === 'listening' || status === 'forbidden'"></div>
    </div>
</template>
<script setup>
    import { useI18n } from 'vue-i18n';
    const { t, locale } = useI18n();
    const props = defineProps({
        status: {
            type: String,
            default: 'thinking'
        }
    });
    const label = ref('');
    const getLabel = () => {
        let text;
        switch (props.status) {
            case 'connecting':
                text = t('connecting');
                break;
            case 'initializing':
                text = t('initializing');
                break;
            case 'listening':
                text = t('listening');
                break;
            case 'thinking':
                text = t('thinking');
                break;
            case 'talking':
                text = t('talking');
                break;
            case 'forbidden':
                text = '换一个问题聊吧～';
                break;
            default:
                text = '';
        }
        label.value = text;
    };
    watch(
        locale,
        () => {
            console.log('Locale changed:', locale.value);
            getLabel();
        },
        { immediate: true }
    );
    watch(
        () => props.status,
        () => {
            console.log('Status changed:', props.status);
            getLabel();
        },
        { immediate: true }
    );
</script>
<style lang="less" scoped>
    .voice-box {
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
                width: 140px;
                height: 140px;
                background-image: linear-gradient(to bottom, #5699ff, #7a9fff);
                overflow: hidden;
                img {
                    // thinking 176px
                    // talking 180px
                    // listening 180px
                    // connecting 224px
                    // width: 224px;
                    // height: 224px;
                    position: absolute;
                    border-radius: 50%;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    mix-blend-mode: screen;
                }
                img.thinking-img {
                    width: 176px;
                    height: 176px;
                }
                img.talking-img {
                    width: 180px;
                    height: 180px;
                }
                img.listening-img,
                img.forbidden-img {
                    width: 180px;
                    height: 180px;
                }
                img.connecting-img {
                    width: 224px;
                    height: 224px;
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
                top: calc(50% + 86px);
                left: 50%;
                transform: translate(-50%, 0);
                text-wrap: nowrap;
                white-space: nowrap;
                color: #6893fb;
                // font-family: Roboto;
                font-size: 14px;
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
            width: 150px;
            height: 150px;
            border-radius: 50%;
            border: 2px solid rgba(131, 168, 255, 0.7);
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
