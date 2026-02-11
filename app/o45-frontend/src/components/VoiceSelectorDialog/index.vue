<template>
    <el-dialog
        v-model="visible"
        width="412"
        close-on-click-modal
        close-on-press-escape
        :show-close="false"
        :modal="false"
        class="voice-dialog"
        align-center
        @closed="stop"
    >
        <div class="container">
            <div class="title">选择一个声音</div>
            <div class="carousel-wrapper">
                <SvgIcon
                    name="arrow-left"
                    class="left-icon nav"
                    @click="prev"
                    :class="{ disabled: currentIndex === 0 }"
                />
                <div class="carousel-view">
                    <div class="carousel-track" ref="trackRef">
                        <div
                            v-for="(voice, index) in voices"
                            :key="index"
                            class="carousel-item"
                            :class="{ active: index === currentIndex }"
                            :style="{ background: voice.color }"
                            ref="items"
                        ></div>
                    </div>
                </div>
                <SvgIcon
                    name="arrow-right"
                    class="right-icon nav"
                    @click="next"
                    :class="{ disabled: currentIndex === voices.length - 1 }"
                />
            </div>
            <div class="info">
                <div class="name">{{ voices[currentIndex].name }}</div>
                <div class="desc">{{ voices[currentIndex].desc }}</div>
                <div class="index">{{ currentIndex + 1 }}/{{ voices.length }}</div>
            </div>
            <el-button class="confirm-btn" type="primary" @click="confirm">继续聊天</el-button>
        </div>
    </el-dialog>
</template>

<script setup>
    const visible = ref(false);
    const currentIndex = ref(0);
    const audio = ref(null);
    const trackRef = ref(null);
    const items = ref([]);

    const voices = [
        {
            name: '暖音',
            desc: '温柔而治愈的女声',
            url: '/audio/voices/voice-01.wav',
            color: 'linear-gradient(135deg, #ff9a9e, #fecfef)'
        },
        {
            name: '沉稳',
            desc: '低沉磁性的男声',
            url: '/audio/voices/voice-28.wav',
            color: 'linear-gradient(135deg, #667eea, #764ba2)'
        },
        {
            name: '晨煦',
            desc: '阳光、温暖、精力充沛和充满活力的大男孩',
            url: '/audio/voices/voice-02.wav',
            color: 'linear-gradient(135deg, #ffecd2, #fcb69f)'
        },
        {
            name: '童趣',
            desc: '俏皮可爱的童声',
            url: '/audio/voices/voice-08.wav',
            color: 'linear-gradient(135deg, #a8edea, #fed6e3)'
        },
        {
            name: '优雅',
            desc: '成熟稳重的女声',
            url: '/audio/voices/voice-16.wav',
            color: 'linear-gradient(135deg, #d299c2, #fef9d7)'
        },
        {
            name: '活力',
            desc: '充满活力的年轻声音',
            url: '/audio/voices/voice-14.wav',
            color: 'linear-gradient(135deg, #89f7fe, #66a6ff)'
        },
        {
            name: '优雅',
            desc: '成熟稳重的女声',
            url: '/audio/voices/voice-16.wav',
            color: 'linear-gradient(135deg, #fbc2eb, #a6c1ee)'
        },
        {
            name: '活力',
            desc: '充满活力的年轻声音',
            url: '/audio/voices/voice-14.wav',
            color: 'linear-gradient(135deg, #fdbb2d, #22c1c3)'
        }
    ];

    const play = () => {
        stop();
        const voice = voices[currentIndex.value];
        if (voice?.url) {
            audio.value = new Audio(voice.url);
            audio.value.play();
        }
    };

    const stop = () => {
        if (audio.value) {
            audio.value.pause();
            audio.value = null;
        }
    };

    const scrollToCenter = () => {
        nextTick(() => {
            setTimeout(() => {
                const track = trackRef.value;
                if (!track) return;

                const container = track.parentElement; // .carousel-view
                if (!container) return;

                // 获取当前选中的项目元素
                const currentItem = track.children[currentIndex.value];
                if (!currentItem) return;

                const containerWidth = container.offsetWidth;
                const containerPadding = 97; // .carousel-view 的 padding
                const visibleWidth = containerWidth - containerPadding * 2; // 可视区域宽度

                // 计算当前项目相对于轨道的位置
                const itemOffsetLeft = currentItem.offsetLeft;
                const itemWidth = currentItem.offsetWidth;

                // 计算使当前项目居中所需的偏移量
                // 项目中心点应该与可视区域中心点对齐
                const offset = itemOffsetLeft + itemWidth / 2 - visibleWidth / 2;

                track.style.transform = `translateX(-${offset}px)`;
            }, 50);
        });
    };

    const prev = () => {
        if (currentIndex.value > 0) {
            currentIndex.value--;
            nextTick(() => {
                setTimeout(() => {
                    scrollToCenter();
                    play();
                }, 100);
            });
        }
    };

    const next = () => {
        if (currentIndex.value < voices.length - 1) {
            currentIndex.value++;
            nextTick(() => {
                setTimeout(() => {
                    scrollToCenter();
                    play();
                }, 100);
            });
        }
    };

    const open = (index = 0) => {
        currentIndex.value = index;
        visible.value = true;
        nextTick(() => {
            // 重置轨道位置
            if (trackRef.value) {
                trackRef.value.style.transform = 'translateX(0)';
            }

            setTimeout(() => {
                scrollToCenter();
                play();
            }, 100);
        });
    };

    const close = () => {
        visible.value = false;
    };

    const confirm = () => {
        emit('confirm', voices[currentIndex.value]);
        close();
    };

    defineExpose({ open, close });
    const emit = defineEmits(['confirm']);

    onBeforeUnmount(stop);
</script>

<style style="less" scoped>
    .carousel-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative;
        margin-bottom: 8px;
        .left-icon,
        .right-icon {
            width: 24px;
            height: 24px;
            color: #667085;
            transition: opacity 0.2s ease;
            cursor: pointer;
            &:hover {
                opacity: 0.8;
            }
            &.disabled {
                color: #c7c7c7;
                cursor: not-allowed;
            }
        }
    }

    .carousel-view {
        width: 280px;
        overflow: hidden;
        padding: 0 97px;
    }

    .carousel-track {
        display: flex;
        transition: transform 0.4s ease;
        will-change: transform;
        align-items: center;
        height: 68px;
    }

    .carousel-item {
        width: 56px;
        height: 56px;
        margin: 0 15px;
        border-radius: 50%;
        flex-shrink: 0;
        opacity: 0.4;
        transition:
            transform 0.3s ease,
            opacity 0.3s ease;
    }

    .carousel-item.active {
        transform: scale(1.2);
        opacity: 1;
        /* animation: colorShift 3s ease-in-out infinite; */
    }

    @keyframes colorShift {
        0% {
            filter: hue-rotate(0deg) saturate(1) brightness(1);
        }
        25% {
            filter: hue-rotate(15deg) saturate(1.2) brightness(1.1);
        }
        50% {
            filter: hue-rotate(30deg) saturate(1.4) brightness(1.2);
        }
        75% {
            filter: hue-rotate(15deg) saturate(1.2) brightness(1.1);
        }
        100% {
            filter: hue-rotate(0deg) saturate(1) brightness(1);
        }
    }

    .info {
        margin-bottom: 32px;
        text-align: center;
        .name {
            margin-bottom: 4px;
            color: #4f555a;
            /* font-family: Roboto; */
            font-size: 14px;
            font-style: normal;
            font-weight: 500;
            line-height: normal;
            letter-spacing: 0.56px;
        }

        .desc {
            margin-bottom: 8px;
            color: #4f555a;
            /* font-family: Roboto; */
            font-size: 12px;
            font-style: normal;
            font-weight: 400;
            line-height: normal;
            letter-spacing: 0.48px;
        }

        .index {
            color: #888;
            font-size: 12px;
        }
    }

    .confirm-btn {
        width: 260px;
        height: 40px;
        font-size: 16px;
        font-weight: 600;
        border-radius: 90px;
        border: none !important;
        transition: all 0.3s ease;
        background: #1e71ff;
        color: #fff;
        /* font-family: Roboto; */
        font-size: 16px;
        font-style: normal;
        font-weight: 500;
        line-height: normal;
    }

    .confirm-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(30, 113, 255, 0.4);
    }

    .close-btn {
        margin: 0 auto;
        width: 40px;
        height: 40px;
        font-size: 18px;
        color: #888;
        border: 1px solid #333;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        transition: all 0.2s ease;
    }

    .close-btn:hover {
        color: #fff;
        border-color: #555;
        background: rgba(255, 255, 255, 0.1);
    }
</style>
<style lang="less">
    .voice-dialog.el-dialog {
        border-radius: 48px;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 0 30px 0 rgba(0, 0, 0, 0.1);
        color: #fff;
        padding: 32px 16px;
        .el-dialog__header {
            padding: 0;
        }
        .el-dialog__body {
            .container {
                text-align: center;
                .title {
                    color: #4f555a;
                    text-align: center;
                    // font-family: Roboto;
                    font-size: 20px;
                    font-style: normal;
                    font-weight: 600;
                    line-height: normal;
                    margin-bottom: 16px;
                }
            }
        }
    }
</style>
