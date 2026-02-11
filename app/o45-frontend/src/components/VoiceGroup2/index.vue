<template>
    <div class="group2-container">
        <div v-if="isConnectingOrInit" class="solid-circle"></div>

        <div v-else-if="isListeningOrThinking" class="group2-split-container">
            <div class="split-circle-g2 left-small-g2"></div>
            <div
                class="split-circle-g2 center-big-g2"
                :style="{
                    '--bounce-amplitude': `${animationParams.bounceAmplitude}px`,
                    '--bounce-duration': `${animationParams.bounceDuration}s`
                }"
            ></div>
            <div class="split-circle-g2 right-small-g2"></div>
        </div>

        <div
            v-else-if="status === 'talking'"
            :class="['three-circles', 'stretch-effect', { 'split-animation': showSplitAnimation }]"
            :style="{
                '--stretch-height': `${animationParams.stretchHeight}px`,
                '--stretch-duration': `${animationParams.stretchDuration}s`,
                '--volume-scale': volumeScale
            }"
        >
            <div class="circle-item left"></div>
            <div class="circle-item middle"></div>
            <div class="circle-item right"></div>
        </div>

        <div v-else-if="status === 'forbidden'" :class="['three-circles', 'wave']">
            <div class="circle-item bar-1 left"></div>
            <div class="circle-item bar-2 middle"></div>
            <div class="circle-item bar-3 right"></div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, ref, watch } from 'vue';

    const props = defineProps({
        status: {
            type: String,
            default: 'thinking'
        },
        volume: {
            type: Number,
            default: null // 传入的实时音量值（0.0 - 1.0）
        }
    });

    const showSplitAnimation = ref(false);

    const isConnectingOrInit = computed(() => ['connecting', 'initializing'].includes(props.status));
    const isListeningOrThinking = computed(() => ['listening', 'thinking'].includes(props.status));

    // 根据音量计算缩放比例（talking 状态使用，轻微缩放即可）
    const volumeScale = computed(() => {
        const volume = props.volume !== null ? props.volume : 0.3;
        return 0.9 + volume * 0.2; // 0.9 - 1.1
    });

    // 分档避免频繁切换；持续平滑过渡避免动画被重启
    const getVolumeLevel = volume => {
        if (volume < 0.2) return 1; // 极低
        if (volume < 0.3) return 2; // 低
        if (volume < 0.45) return 3; // 中低
        if (volume < 0.6) return 4; // 中
        if (volume < 0.75) return 5; // 中高
        return 6; // 高
    };

    // 目标参数表
    // 为避免 listening/thinking 状态频繁重启动画：周期固定，只调幅度
    const BOUNCE_DURATION = 1.8;
    const bounceConfigs = [
        { amplitude: 25, duration: BOUNCE_DURATION },
        { amplitude: 32, duration: BOUNCE_DURATION },
        { amplitude: 40, duration: BOUNCE_DURATION },
        { amplitude: 50, duration: BOUNCE_DURATION },
        { amplitude: 60, duration: BOUNCE_DURATION },
        { amplitude: 72, duration: BOUNCE_DURATION }
    ];
    // 为避免 talking 状态频繁重启动画，保持固定的周期，只有高度随音量变化
    const TALKING_DURATION = 1.6;
    const stretchConfigs = [
        { height: 140, duration: TALKING_DURATION },
        { height: 165, duration: TALKING_DURATION },
        { height: 190, duration: TALKING_DURATION },
        { height: 215, duration: TALKING_DURATION },
        { height: 240, duration: TALKING_DURATION },
        { height: 270, duration: TALKING_DURATION }
    ];

    // 当前参数（平滑过渡）
    const smoothParams = ref({
        bounceAmplitude: 45,
        bounceDuration: 1.8,
        stretchHeight: 200,
        stretchDuration: 2.0
    });

    let smoothTimer = null;

    const lerp = (from, to, factor) => from + (to - from) * factor;

    const startSmoothing = target => {
        if (smoothTimer) return;
        smoothTimer = setInterval(() => {
            smoothParams.value = {
                bounceAmplitude: lerp(smoothParams.value.bounceAmplitude, target.bounceAmplitude, 0.2),
                bounceDuration: lerp(smoothParams.value.bounceDuration, target.bounceDuration, 0.2),
                stretchHeight: lerp(smoothParams.value.stretchHeight, target.stretchHeight, 0.2),
                stretchDuration: lerp(smoothParams.value.stretchDuration, target.stretchDuration, 0.2)
            };
            const closeEnough = (a, b) => Math.abs(a - b) < 0.1;
            if (
                closeEnough(smoothParams.value.bounceAmplitude, target.bounceAmplitude) &&
                closeEnough(smoothParams.value.bounceDuration, target.bounceDuration) &&
                closeEnough(smoothParams.value.stretchHeight, target.stretchHeight) &&
                closeEnough(smoothParams.value.stretchDuration, target.stretchDuration)
            ) {
                smoothParams.value = { ...target };
                clearInterval(smoothTimer);
                smoothTimer = null;
            }
        }, 50);
    };

    const animationParams = computed(() => smoothParams.value);

    watch(
        () => props.volume,
        newVolume => {
            const vol = newVolume !== null && newVolume !== undefined ? newVolume : 0.3;
            const level = getVolumeLevel(vol);
            const target = {
                bounceAmplitude: bounceConfigs[level - 1].amplitude,
                bounceDuration: bounceConfigs[level - 1].duration,
                stretchHeight: stretchConfigs[level - 1].height,
                stretchDuration: stretchConfigs[level - 1].duration
            };
            startSmoothing(target);
        },
        { immediate: true }
    );

    watch(
        () => props.status,
        (newStatus, oldStatus) => {
            const fromInit = ['connecting', 'initializing'].includes(oldStatus);
            const toSplit = isListeningOrThinking.value;
            const toThree = newStatus === 'talking';
            if (fromInit && (toSplit || toThree)) {
                showSplitAnimation.value = true;
                setTimeout(() => {
                    showSplitAnimation.value = false;
                }, 1000);
            }
        },
        { immediate: true }
    );

    onBeforeUnmount(() => {
        if (smoothTimer) {
            clearInterval(smoothTimer);
            smoothTimer = null;
        }
    });
</script>

<style lang="less" scoped>
    .group2-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 200px;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;

        .solid-circle {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: #373ed8;
            transform-origin: center center;
            animation: solid-pulse 1.5s ease-in-out infinite;
        }

        .three-circles {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;

            .circle-item {
                width: 60px;
                height: 60px;
                border-radius: 30px;
                background: #373ed8;
                position: relative;
                flex-shrink: 0;
                will-change: height; /* 优化动画性能 */
            }

            &.split-animation {
                .left {
                    animation: split-left-old 1s ease-out forwards;
                }

                .middle {
                    animation: split-middle-old 1s ease-out forwards;
                }

                .right {
                    animation: split-right-old 1s ease-out forwards;
                }
            }

            &.stretch-effect {
                --stretch-height: 200px; /* 默认值 */
                --stretch-duration: 2s; /* 默认值（更慢）*/
                --volume-scale: 1; /* 默认缩放 */

                .circle-item {
                    transform: scale(var(--volume-scale, 1));
                    transition: transform 0.3s ease-out; /* 平滑的缩放过渡 */
                }

                .left {
                    animation: circle-stretch-side var(--stretch-duration) ease-in-out infinite;
                }

                .middle {
                    animation: circle-stretch-middle var(--stretch-duration) ease-in-out infinite;
                }

                .right {
                    animation: circle-stretch-side var(--stretch-duration) ease-in-out infinite
                        calc(var(--stretch-duration) * 0.15);
                }
            }

            &.wave {
                .bar-2 {
                    animation: simple-bounce 0.8s ease-in-out infinite;
                }
            }
        }

        .group2-split-container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;

            .split-circle-g2 {
                position: absolute;
                background-color: #373ed8;
                border-radius: 50%;
            }

            .left-small-g2 {
                width: 60px;
                height: 60px;
                left: 50%;
                top: 50%;
                opacity: 0;
                animation: split-left-g2 0.7s ease-in-out forwards;
            }

            .center-big-g2 {
                width: 120px;
                height: 120px;
                left: 50%;
                top: 50%;
                --bounce-amplitude: 45px; /* 默认值 */
                --bounce-duration: 1.8s; /* 默认值（更慢）*/
                will-change: transform; /* 优化动画性能 */
                animation:
                    split-center-g2 0.7s ease-in-out forwards,
                    center-bounce-g2 var(--bounce-duration) linear 0.7s infinite;
            }

            .right-small-g2 {
                width: 60px;
                height: 60px;
                left: 50%;
                top: 50%;
                opacity: 0;
                animation: split-right-g2 0.7s ease-in-out forwards;
            }
        }
    }

    @keyframes solid-pulse {
        0%,
        100% {
            transform: scale(1);
            opacity: 0.6;
        }
        50% {
            transform: scale(1.2);
            opacity: 1;
        }
    }

    @keyframes circle-stretch-side {
        0%,
        100% {
            height: 60px;
            border-radius: 30px;
        }
        25%,
        75% {
            height: var(--stretch-height);
            border-radius: 30px;
        }
        50% {
            height: 60px;
            border-radius: 30px;
        }
    }

    @keyframes circle-stretch-middle {
        0%,
        100% {
            height: var(--stretch-height);
            border-radius: 30px;
        }
        25%,
        75% {
            height: 60px;
            border-radius: 30px;
        }
        50% {
            height: var(--stretch-height);
            border-radius: 30px;
        }
    }

    @keyframes simple-bounce {
        0% {
            transform: translateY(0);
        }
        25% {
            transform: translateY(-35px);
        }
        50% {
            transform: translateY(0);
        }
        75% {
            transform: translateY(35px);
        }
        100% {
            transform: translateY(0);
        }
    }

    @keyframes split-left-g2 {
        0% {
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 0;
        }
        40% {
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 1;
        }
        50% {
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 1;
        }
        100% {
            left: calc(50% - 68px);
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 1;
        }
    }

    @keyframes split-center-g2 {
        0% {
            width: 120px;
            height: 120px;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%) scale(1);
        }
        40% {
            width: 120px;
            height: 120px;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%) scale(1);
        }
        100% {
            width: 60px;
            height: 60px;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%) scale(1);
        }
    }

    @keyframes center-bounce-g2 {
        0% {
            transform: translate(-50%, -50%) translateY(0);
        }
        25% {
            transform: translate(-50%, -50%) translateY(var(--bounce-amplitude));
        }
        50% {
            transform: translate(-50%, -50%) translateY(0);
        }
        75% {
            transform: translate(-50%, -50%) translateY(calc(var(--bounce-amplitude) * -1));
        }
        100% {
            transform: translate(-50%, -50%) translateY(0);
        }
    }

    @keyframes split-right-g2 {
        0% {
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 0;
        }
        40% {
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 1;
        }
        50% {
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 1;
        }
        100% {
            left: calc(50% + 68px);
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 1;
        }
    }

    @keyframes split-left-old {
        0% {
            transform: translateX(60px) scale(0.3);
            opacity: 0.3;
        }
        100% {
            transform: translateX(0) scale(1);
            opacity: 1;
        }
    }

    @keyframes split-middle-old {
        0% {
            transform: scale(0.3);
            opacity: 0.3;
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }

    @keyframes split-right-old {
        0% {
            transform: translateX(-60px) scale(0.3);
            opacity: 0.3;
        }
        100% {
            transform: translateX(0) scale(1);
            opacity: 1;
        }
    }
</style>
