<template>
    <div class="test-container">
        <div>新版本的播放方案</div>
        <el-button type="primary" :loading="isPlaying" @click="startPlay">开始播放</el-button>
        <el-button @click="stopPlay">停止播放</el-button>
    </div>
</template>

<script setup>
    import { voiceData } from './voiceData';
    import { formatTimestamp } from '@/utils';
    import AutoPlayAudioStream from './playVoice';

    const audioPlayer = ref(null);
    const isPlaying = ref(false);
    const timerIds = ref([]);

    // 音频播放相关
    // onMounted(() => {
    //     audioPlayer.value = new AutoPlayAudioStream();
    //     // 设置事件监听
    //     audioPlayer.value
    //         .on('playback-started', event => {
    //             console.log('播放开始:', event, formatTimestamp(Date.now()));
    //             isPlaying.value = true;
    //         })
    //         .on('playback-ended', event => {
    //             console.log('播放结束:', event, formatTimestamp(Date.now()));
    //             console.log('剩余播放列表:', audioPlayer.value.bufferQueue);
    //             // 这里可以触发父组件或其他逻辑
    //             if (audioPlayer.value.bufferQueue.length === 0) {
    //                 // isPlaying.value = false;
    //             }
    //         })
    //         .on('playback-error', error => {
    //             console.error('播放错误:', error);
    //             // isPlaying.value = false;
    //         })
    //         .on('stream-ended', () => {
    //             console.log('全部播放完成');
    //             isPlaying.value = false;
    //         });
    // });
    const startPlay = async () => {
        audioPlayer.value = new AutoPlayAudioStream();
        // if (audioPlayer.value && audioPlayer.value.audioContext.state === 'suspended') {
        //     await audioPlayer.value.audioContext.resume();
        // }
        // audioPlayer.value.enableAutoPlay();
        isPlaying.value = true;
        for (let i = 0; i < voiceData.length; i++) {
            const timeId = setTimeout(async () => {
                console.log('i: ', i);
                if (isPlaying.value) {
                    await audioPlayer.value.addAudio(voiceData[i]);
                }

                if (i === voiceData.length - 1) {
                    // 标识音频结束推送
                    audioPlayer.value.endSignal(() => {
                        console.log('所有音频播放完成');
                        isPlaying.value = false;
                    });
                }
            }, i * 500);
            timerIds.value.push(timeId);
        }
    };
    const stopPlay = () => {
        isPlaying.value = false;
        audioPlayer.value?.stopAudio();
    };
</script>

<style lang="less" scoped></style>
