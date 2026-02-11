<template>
    <div class="audio-player">
        <div class="top">
            <!-- 播放按钮 -->
            <div :class="`play-btn ${isPlaying ? 'is-playing' : ''}`" @click="togglePlay">
                <SvgIcon name="play-icon" class="play-icon" v-if="!isPlaying" />
                <SvgIcon name="pause-icon" class="pause-icon" v-else />
            </div>

            <!-- 波形动画 -->
            <div class="waveform">
                <div
                    v-for="(bar, index) in 15"
                    :key="index"
                    class="bar"
                    :style="{ height: isPlaying ? `${Math.random() * 14 + 2}px` : '8px' }"
                ></div>
            </div>

            <!-- 播放时长 -->
            <div class="time">{{ formatTime(currentTime) }}</div>

            <!-- 音量图标 -->
            <div class="volume" @click="toggleMute">
                <SvgIcon name="volume-on" class="volume-on" v-if="!isMuted" />
                <SvgIcon name="volume-off" class="volume-off" v-else />
            </div>
        </div>

        <!-- 文本内容 -->
        <div class="voice-text">{{ voiceText }}</div>
    </div>
</template>

<script setup>
    const props = defineProps({
        base64Audio: String, // base64 编码的 wav 音频数据（不含 data URI 前缀）
        voiceText: {
            type: String, // 音频对应的转写文本
            default:
                'It is a long established fact  a long established fact tIt is a long established fact tIt established fact tIt is a long established fact tIt is a long established fact t'
        }
    });
    // max 16px 2px
    // min 2px 2px
    // gap 4px

    const isPlaying = ref(false);
    const isMuted = ref(false);
    const currentTime = ref(0);
    let interval = null;
    let audio = null;

    // onMounted(() => {
    //     const audioBlob = base64ToBlob(props.base64Audio, 'audio/wav');
    //     const audioUrl = URL.createObjectURL(audioBlob);
    //     audio = new Audio(audioUrl);

    //     audio.addEventListener('timeupdate', () => {
    //         currentTime.value = Math.floor(audio.currentTime);
    //     });

    //     audio.addEventListener('ended', () => {
    //         stop();
    //     });
    // });

    onBeforeUnmount(() => {
        stop();
        if (audio) {
            audio.pause();
            audio = null;
        }
    });

    function togglePlay() {
        if (!audio) return;
        isPlaying.value = !isPlaying.value;

        if (isPlaying.value) {
            audio.play();
        } else {
            audio.pause();
        }
    }

    function toggleMute() {
        if (!audio) return;
        isMuted.value = !isMuted.value;
        audio.muted = isMuted.value;
    }

    function stop() {
        isPlaying.value = false;
        if (audio) audio.pause();
    }

    function formatTime(seconds) {
        return `0:${seconds < 10 ? '0' + seconds : seconds}`;
    }

    function base64ToBlob(base64, mime) {
        const byteCharacters = atob(base64);
        const byteArrays = [];
        for (let i = 0; i < byteCharacters.length; i += 512) {
            const slice = byteCharacters.slice(i, i + 512);
            const byteNumbers = new Array(slice.length);
            for (let j = 0; j < slice.length; j++) {
                byteNumbers[j] = slice.charCodeAt(j);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, { type: mime });
    }
</script>

<style lang="less" scoped>
    .audio-player {
        background: #f3f5ff;
        padding: 8px;
        border-radius: 16px;
        width: 100%;

        .top {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 12px 8px 8px;
        }

        .play-btn {
            margin: 2px;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #5865f2;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            .play-icon,
            .pause-icon {
                width: 14px;
                height: 14px;
            }
        }
        .play-btn.is-playing {
            background: #ffffff;
            color: #5865f2;
        }

        .waveform {
            display: flex;
            gap: 4px;
            height: 24px;
            align-items: center;
            justify-content: center;
            flex: 1;

            .bar {
                width: 2px;
                background: #5865f2;
                border-radius: 1px;
                transition: height 0.3s ease;
            }
        }

        .time {
            font-size: 14px;
            color: #666;
            margin-left: 8px;
        }

        .volume {
            .volume-on,
            .volume-off {
                width: 20px;
                height: 20px;
                cursor: pointer;
                display: block;
            }
        }

        .voice-text {
            padding: 8px 8px 0;
            color: #595f6d;
            // font-family: Roboto;
            font-size: 14px;
            font-style: normal;
            font-weight: 400;
            line-height: 20px; /* 142.857% */
            position: relative;
            &::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 1px;
                background: #e9e9e9;
                transform: scaleY(0.5);
                transform-origin: top;
            }
        }
    }
</style>
