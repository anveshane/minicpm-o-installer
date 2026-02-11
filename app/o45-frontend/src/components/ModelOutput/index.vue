<template>
    <div class="output-area">
        <div
            :class="`output-area-item ${item.type === 'USER' ? 'user-item' : 'bot-item'}`"
            :key="index"
            v-for="(item, index) in outputData"
        >
            <div v-if="item.type === 'USER'" class="user-input">
                <audio v-if="item.audio" :src="item.audio" controls controlslist="noplaybackrate nodownload"></audio>
            </div>
            <div v-else class="bot-output">
                <div class="output-item" v-if="item.text">{{ item.text?.trim() }}</div>
                <audio v-if="item.audio" :src="item.audio" controls controlslist="noplaybackrate nodownload"></audio>
            </div>
        </div>
    </div>
</template>

<script setup>
    const props = defineProps({
        outputData: {
            type: Array,
            default: () => []
        },
        containerClass: {
            type: String,
            default: ''
        }
    });
    watch(
        () => props.outputData,
        newVal => {
            nextTick(() => {
                if (newVal && props.containerClass) {
                    let dom = document.querySelector(`.${props.containerClass}`);
                    if (dom) {
                        dom.scrollTop = dom.scrollHeight;
                    }
                }
            });
            setTimeout(() => {
                bindAudioEvents();
            }, 0);
        },
        { deep: true }
    );
    // 绑定 audio 事件
    const bindAudioEvents = () => {
        const audioElements = document.querySelectorAll('.output-area audio');
        audioElements.forEach(audio => {
            audio.addEventListener('play', () => handlePlay(audio));
        });
    };
    // 处理播放事件
    const handlePlay = currentAudio => {
        const audioElements = document.querySelectorAll('.output-area audio');
        audioElements.forEach(audio => {
            if (audio !== currentAudio && !audio.paused) {
                audio.pause(); // 暂停其他音频
            }
        });
    };
    // 初始绑定
    onMounted(() => {
        bindAudioEvents();
    });
</script>

<style lang="less" scoped>
    .output-area {
        display: flex;
        flex-direction: column;
        &-item {
            width: fit-content;
        }
        &-item + &-item {
            margin-top: 16px;
        }
        &-item.user-item {
            align-self: flex-end;
            .user-input {
            }
        }
        &-item.bot-item {
            align-self: flex-start;
            width: 100%;
            .bot-output {
                width: 100%;
                display: flex;
                flex-direction: column;
                .output-item {
                    padding: 8px 24px;
                    border-radius: 10px;
                    color: #202224;
                    background: #f5f6fa;
                    max-width: 90%;
                    width: fit-content;
                    // font-family: PingFang SC;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                    word-break: break-all;
                    word-wrap: break-word;
                    white-space: pre-wrap;
                    display: inline-block;
                }
                .output-item + audio {
                    margin-top: 16px;
                }
            }
        }
        audio::-webkit-media-controls-panel {
            background-color: #f5f6fa;
        }
    }
</style>
