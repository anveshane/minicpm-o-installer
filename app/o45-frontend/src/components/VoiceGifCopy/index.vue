<template>
    <div class="voice-box" v-if="status !== ''">
        <div class="voice-box-body" :class="{ 'group-2-bg': animationGroup === 2, 'group-3-bg': animationGroup === 3 }">
            <div
                :class="`voice-box-body-bg group-${animationGroup} ${status === 'talking' ? 'talking' : ''} ${status === 'listening' ? 'listening' : ''} ${status === 'connecting' ? 'connecting' : ''} ${status === 'initializing' ? 'initializing' : ''} ${status === 'thinking' ? 'thinking' : ''} ${status === 'forbidden' ? 'forbidden' : ''}`"
            >
                <!-- 第一组：SVG 烟雾效果 -->
                <div v-if="animationGroup === 1" class="smoke-svg-container">
                    <div class="smoke-svg-wrapper">
                        <svg
                            :class="[
                                'smoke-svg',
                                { 'no-rotate': status === 'connecting' || status === 'initializing' }
                            ]"
                            viewBox="100 96 200 200"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <circle cx="200" cy="196" r="100" fill="white" />
                            <mask
                                id="mask0"
                                style="mask-type: alpha"
                                maskUnits="userSpaceOnUse"
                                x="100"
                                y="96"
                                width="200"
                                height="200"
                            >
                                <circle cx="200" cy="196" r="100" fill="white" />
                            </mask>
                            <g mask="url(#mask0)">
                                <g filter="url(#filter2_f)">
                                    <circle cx="200" cy="196" r="83" fill="url(#paint0_linear)" />
                                </g>
                                <g filter="url(#filter3_f)">
                                    <ellipse
                                        cx="230.427"
                                        cy="154.816"
                                        rx="44.9218"
                                        ry="38.0686"
                                        transform="rotate(52.4495 230.427 154.816)"
                                        fill="url(#paint1_linear)"
                                    />
                                </g>
                            </g>
                            <defs>
                                <filter
                                    id="filter2_f"
                                    x="91"
                                    y="87"
                                    width="218"
                                    height="218"
                                    filterUnits="userSpaceOnUse"
                                    color-interpolation-filters="sRGB"
                                >
                                    <feFlood flood-opacity="0" result="BackgroundImageFix" />
                                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                                    <feGaussianBlur stdDeviation="13" result="effect1_foregroundBlur_826_8355" />
                                </filter>
                                <filter
                                    id="filter3_f"
                                    x="159.68"
                                    y="82.3057"
                                    width="141.496"
                                    height="145.021"
                                    filterUnits="userSpaceOnUse"
                                    color-interpolation-filters="sRGB"
                                >
                                    <feFlood flood-opacity="0" result="BackgroundImageFix" />
                                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                                    <feGaussianBlur stdDeviation="15" result="effect1_foregroundBlur_826_8355" />
                                </filter>
                                <linearGradient
                                    id="paint0_linear"
                                    x1="200"
                                    y1="113"
                                    x2="200"
                                    y2="279"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stop-color="#5EB1FF" />
                                    <stop offset="0.456731" stop-color="#9185FF" />
                                    <stop offset="0.692308" stop-color="#E1E3FF" />
                                    <stop offset="1" stop-color="#9FB5FF" />
                                </linearGradient>
                                <linearGradient
                                    id="paint1_linear"
                                    x1="230.427"
                                    y1="116.747"
                                    x2="230.427"
                                    y2="192.885"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stop-color="#5EB1FF" />
                                    <stop offset="0.456731" stop-color="#FFF2DE" />
                                    <stop offset="0.692308" stop-color="#E1E3FF" />
                                    <stop offset="1" stop-color="#4366D8" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                </div>

                <!-- 第二组：抽象组件 -->
                <Group2Animation v-if="animationGroup === 2" :status="status" :volume="volume" />

                <!-- 第三组：VoiceOrb 动效 -->
                <div v-if="animationGroup === 3" class="group3-container">
                    <VoiceOrb
                        :size="320"
                        :baseEnergy="group3Energy"
                        :pulse="group3Pulse"
                        :frozen="group3Frozen"
                        class="group3-orb"
                    />
                </div>

                <!-- 第四组：渐变球体动画 -->
                <div v-if="animationGroup === 4" class="sphere-container">
                    <div
                        class="item item--sphere item--color2"
                        :class="{ 'item--rotating': status !== 'connecting' && status !== 'initializing' }"
                    ></div>
                </div>

                <!-- 第五组：图片旋转动画 -->
                <div v-if="animationGroup === 5" class="image-rotate-container">
                    <div
                        class="image-circle"
                        :class="{ 'image-circle--rotating': status !== 'connecting' && status !== 'initializing' }"
                    ></div>
                </div>
            </div>
            <div
                v-if="shouldShowText && label"
                class="voice-box-body-text"
                :class="{
                    'video-mode': isVideoMode,
                    'mobile-mode': isMobile,
                    'is-pc': isPc,
                    'duplex-connecting': mode === 'duplex' && (status === 'connecting' || status === 'initializing'),
                    'duplex-other': mode === 'duplex' && status !== 'connecting' && status !== 'initializing'
                }"
            >
                {{ label }}
            </div>
        </div>
        <!-- <div class="voice-box-circle talking" v-if="status === 'talking'"></div>
        <div class="voice-box-circle listening" v-if="status === 'listening' || status === 'forbidden'"></div> -->
    </div>
</template>
<script setup>
    import { ref, computed, watch } from 'vue';
    import { useI18n } from 'vue-i18n';
    import VoiceOrb from '@/components/VoiceOrb/index.vue';
    import Group2Animation from '@/components/VoiceGroup2/index.vue';

    const { t, locale } = useI18n();
    const props = defineProps({
        status: {
            type: String,
            default: 'thinking'
        },
        animationGroup: {
            type: Number,
            default: 1
        },
        volume: {
            type: Number,
            default: null // 传入的实时音量值（0.0 - 1.0）
        },
        width: {
            type: Number,
            default: 108 // 默认宽度 214px
        },
        height: {
            type: Number,
            default: 108 // 默认高度 214px
        },
        isVideoMode: {
            type: Boolean,
            default: false // 是否是视频模式
        },
        isMobile: {
            type: Boolean,
            default: false // 是否是移动端
        },
        isPc: {
            type: Boolean,
            default: false // 是否是PC端
        },
        mode: {
            type: String,
            default: 'simplex', // 'simplex' 单工模式 | 'duplex' 双工模式
            validator: value => ['simplex', 'duplex'].includes(value)
        }
    });
    const label = ref('');

    // 判断是否显示文字
    const shouldShowText = computed(() => {
        return true;
        // if (props.mode === 'simplex') {
        //     return true;
        // }
        // return props.status === 'initializing' || props.status === 'connecting';
    });

    const group3Energy = computed(() => {
        // 如果传入了 volume prop，优先使用它
        if (props.volume !== null && props.volume !== undefined) {
            return props.volume;
        }

        // 否则根据状态返回固定值（原有逻辑）
        switch (props.status) {
            case 'connecting':
                return 0.12;
            case 'initializing':
                return 0.18;
            case 'listening':
                return 0.3;
            case 'thinking':
                return 0.42;
            case 'talking':
                return 0.58;
            case 'forbidden':
                return 0.14;
            default:
                return 0.32;
        }
    });
    const group3Pulse = computed(() => ['listening', 'thinking', 'talking'].includes(props.status));
    const group3Frozen = computed(() => ['connecting', 'initializing'].includes(props.status));

    const getLabel = () => {
        let text;
        if (props.mode === 'duplex') {
            if (props.status === 'connecting' || props.status === 'initializing') {
                text = t('connecting');
            } else {
                text = t('inCall');
            }
            label.value = text;
            return;
        }

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
    watch(locale, () => getLabel(), { immediate: true });
    watch(
        () => props.status,
        () => {
            getLabel();
        },
        { immediate: true }
    );
    watch(
        () => props.mode,
        () => {
            getLabel();
        },
        { immediate: true }
    );
    watch(
        () => props.mode,
        newMode => {
            console.log('[VoiceGifCopy] mode:', newMode);
        },
        { immediate: true }
    );
</script>
<style lang="less">
    .el-button + .el-button {
        margin-left: 0 !important;
    }
</style>
<style lang="scss" scoped>
    // SCSS 变量定义（第四组动画使用）
    $size: 130px;
    $scale: 1.05;
    $grad-position: 100% 0;
    $grad-start: 25%;
    $grad-stop: 65%;
    $duration: 3.5s;
    $noise: url('data:image/png;base64,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');

    // SCSS Mixins
    @mixin radial-gradient-item($position, $start, $stop, $color) {
        background: repeat-x $position / 50% 100% radial-gradient(circle at 50% 0, transparent $start, $color $stop);
    }

    @mixin item-unicolor($color) {
        color: $color;
        &::before {
            @include radial-gradient-item($grad-position, $grad-start, $grad-stop, $color);
        }
    }

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

            // 第二组动画时的背景色（改为透明避免黑底）
            &.group-2-bg {
                background-color: transparent;
            }
            &-bg {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                // width: 400px;
                // height: 400px;

                // 第一组动画的容器动画
                &.group-1 {
                    &.talking {
                        animation: container-scale 1.7s infinite ease-in-out;
                    }
                    &.listening,
                    &.thinking {
                        animation: container-breathe 1.8s infinite ease-in-out;
                        animation-delay: 0.1s;
                    }
                    &.connecting,
                    &.initializing {
                        animation: container-breathe 2.4s infinite ease-in-out;
                    }
                }

                // 第三组动画复用呼吸/放大效果
                &.group-3 {
                    &.talking {
                        animation: container-scale 1.7s infinite ease-in-out;
                    }
                    &.listening,
                    &.thinking {
                        animation: container-breathe 2.5s infinite ease-in-out;
                        animation-delay: 0.1s;
                    }
                    &.connecting,
                    &.initializing {
                        animation: container-breathe 2.2s infinite ease-in-out;
                    }
                }

                // 第四组动画：渐变球体效果
                &.group-4 {
                    &.talking {
                        animation: container-scale 1.7s infinite ease-in-out;
                    }
                    &.listening,
                    &.thinking {
                        animation: container-breathe 2.5s infinite ease-in-out;
                        animation-delay: 0.1s;
                    }
                    &.connecting,
                    &.initializing {
                        animation: container-breathe 2.2s infinite ease-in-out;
                    }
                }

                // 第五组动画：图片旋转效果
                &.group-5 {
                    // 连接中/初始化中：添加上下跳动，和第一组一致
                    &.connecting,
                    &.initializing {
                        animation: container-breathe 2.4s infinite ease-in-out;
                    }
                    // 其他状态（talking, listening, thinking, forbidden）：添加放大缩小动效，和第一组 talking 一致
                    &.talking,
                    &.listening,
                    &.thinking,
                    &.forbidden {
                        animation: container-scale 1.7s infinite ease-in-out;
                    }
                }

                // 第二组动画：容器静止，动画在内部元素上

                // SVG 烟雾效果
                .smoke-svg-container {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: v-bind('props.width + "px"');
                    height: v-bind('props.height + "px"');
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                    border-radius: 50%;
                    box-shadow: 0 4px 40px 6px rgba(14, 127, 255, 0.4);

                    // 参考第五组 ::after 的内阴影光环
                    &::after {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        border-radius: 50%;
                        box-shadow:
                            inset 0 -2px 10px 8px rgba(255, 255, 255, 0.6),
                            inset 0 0 4px 4px rgba(255, 255, 255, 0.6);
                        // inset 0 -2px 10px 10px rgba(255, 255, 255, 0.2),
                        // inset 0 -10px 10px 10px rgba(255, 255, 255, 0.4);
                        pointer-events: none;
                        z-index: 2;
                    }
                }

                .smoke-svg-wrapper {
                    position: relative;
                    width: 100%;
                    height: 100%;
                }

                .smoke-svg {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 100%;
                    height: 100%;

                    // SVG 自身的旋转动画（持续顺时针旋转）
                    // transform 由动画控制
                    animation: svg-rotate 8s linear infinite;

                    // 连接中和初始化中不旋转
                    &.no-rotate {
                        animation: none;
                        transform: translate(-50%, -50%);
                    }
                }

                // 第三组动画容器（VoiceOrb）
                .group3-container {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 360px;
                    height: 360px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;

                    :deep(.orb-wrapper) {
                        position: relative;
                        width: 100%;
                        height: 100%;
                    }

                    :deep(.volume-slider) {
                        display: none;
                    }

                    :deep(canvas) {
                        width: 100% !important;
                        height: 100% !important;
                        max-width: 360px;
                        max-height: 360px;
                    }
                }

                // 第四组动画：渐变球体容器
                .sphere-container {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 214px;
                    height: 214px;
                    display: flex;
                    align-items: center;
                    justify-content: center;

                    // 球体样式
                    .item {
                        position: relative;
                        display: inline-block;
                        width: $size;
                        height: $size;
                        background-color: #ffecd2;
                        box-shadow: -5px 18px 25px -15px rgba(0, 0, 0, 0.3);
                        overflow: hidden;
                        transition: all 0.2s ease-out;
                        cursor: pointer;
                        image-rendering: pixelated;

                        &::before {
                            content: '';
                            position: absolute;
                            display: block;
                            top: 0;
                            left: 0;
                            height: 100%;
                            width: 400%;
                            mask:
                                $noise,
                                radial-gradient(circle at 50% 0, transparent 5%, #000 ($grad-stop + 15%)) 0 0 / 50% 100%;
                        }

                        // 旋转状态（非连接中和初始化中）
                        &--rotating {
                            &::before {
                                animation: spin-round $duration linear infinite;
                            }
                        }

                        &--sphere {
                            border-radius: 50%;
                        }

                        &--color2 {
                            @include item-unicolor(#799aff);
                        }
                    }
                }

                // 第五组动画：图片旋转效果
                .image-rotate-container {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: v-bind('props.width + "px"');
                    height: v-bind('props.height + "px"');
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                // 图片圆形容器
                .image-circle {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    background: white;
                    border-radius: 50%;
                    overflow: hidden;
                    box-shadow: 0 4px 40px 6px rgba(14, 127, 255, 0.4);

                    &::before {
                        content: '';
                        position: absolute;
                        display: block;
                        top: 0;
                        left: 0;
                        height: 100%;
                        width: 400%; // 宽度是容器的4倍，用于创造循环效果
                        background-image: url('@/assets/images/gif-bg.png');
                        background-repeat: repeat-x;
                        background-position: -14% top;
                        background-size: 100% 100%;
                        // border: 1px solid red;
                        z-index: 1;
                    }

                    // 毛玻璃遮罩层 + 边缘挡板
                    &::after {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        border-radius: 50%;
                        backdrop-filter: blur(4px) saturate(110%);
                        // background: radial-gradient(
                        //     circle at 30% 30%,
                        //     rgba(255, 255, 255, 0.4),
                        //     rgba(255, 255, 255, 0.05) 65%
                        // );
                        // 关键：用纯白实心内阴影（8px宽）强行覆盖图片边缘，再配合柔和内发光
                        box-shadow:
                            inset 0 -2px 14px 8px rgba(255, 255, 255, 0.9),
                            inset 0 0 8px 4px rgba(255, 255, 255, 1),
                            inset 0 -2px 20px 10px rgba(255, 255, 255, 0.2),
                            inset 0 -10px 20px 10px rgba(255, 255, 255, 0.4);
                        pointer-events: none;
                        z-index: 2;
                    }
                }

                // 旋转状态（非连接中和初始化中）
                .image-circle--rotating {
                    &::before {
                        animation: image-spin 3s linear infinite;
                    }
                }
            }
            &-text {
                position: absolute;
                top: calc(50% + 80px);
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
                z-index: 10;

                // 双工模式：连接中或初始化中
                &.duplex-connecting {
                    color: #6893fb !important;
                }

                // 双工模式：其他状态
                &.duplex-other {
                    color: #ffffff;
                }

                // 视频模式样式
                &.video-mode {
                    top: calc(50% + 68px);
                    font-size: 12px;
                    color: #ffffff;
                    &.is-pc {
                        top: calc(50% + 36px);
                    }
                }

                &.mobile-mode {
                    top: calc(50% + 36px);
                }
            }

            // 第二组动画时文字位置更靠下
            &.group-2-bg &-text {
                top: calc(50% + 130px);
            }

            // 第三组动画时文字再向下，避免与球体重叠
            &.group-3-bg &-text {
                top: calc(50% + 150px);
            }
        }

        &-circle {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 320px;
            height: 320px;
            border-radius: 50%;
            border: 2px solid rgba(131, 168, 255, 0.4);
            &.talking {
                animation: circle-scale 1.2s infinite ease-in-out;
            }
            &.listening {
                animation: circle-sync 1.8s infinite ease-in-out;
                animation-delay: 0.1s;
            }
        }
    }

    @keyframes container-breathe {
        0%,
        100% {
            transform: translate(-50%, -50%) translateY(0px);
        }
        50% {
            transform: translate(-50%, -50%) translateY(-25px);
        }
    }

    @keyframes container-scale {
        0%,
        100% {
            transform: translate(-50%, -50%) scale(1);
        }
        50% {
            transform: translate(-50%, -50%) scale(0.85);
        }
    }

    // SVG 旋转动画（需要保留居中定位）
    @keyframes svg-rotate {
        0% {
            transform: translate(-50%, -50%) rotate(0deg);
        }
        100% {
            transform: translate(-50%, -50%) rotate(360deg);
        }
    }

    @keyframes circle-sync {
        0%,
        100% {
            transform: translate(-50%, -50%) translateY(0px);
            opacity: 0.8;
        }
        50% {
            transform: translate(-50%, -50%) translateY(-25px);
            opacity: 1;
        }
    }

    @keyframes circle-scale {
        0%,
        100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.7;
        }
        50% {
            transform: translate(-50%, -50%) scale(1.15);
            opacity: 1;
        }
    }

    // ========== 第四组球体旋转动画 ==========

    @keyframes spin-round {
        from {
            transform: translateX(0);
        }
        to {
            transform: translateX(-50%);
        }
    }

    // ========== 第五组图片旋转动画 ==========

    @keyframes image-spin {
        from {
            transform: translateX(-14%);
        }
        to {
            transform: translateX(-50%);
        }
    }
</style>
