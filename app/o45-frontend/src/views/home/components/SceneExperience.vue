<template>
    <div class="remote-audio" v-for="(tracks, sid) in state.remoteTracks" :key="sid">
        <audio :ref="setRemoteAudioRef(sid)" autoplay></audio>
    </div>
    <div class="scene-page" v-loading="loading" element-loading-background="rgba(255, 255, 255, 1)">
        <div class="scene-page-left">
            <div class="scene-page-left-video">
                <div class="video-container">
                    <video
                        muted
                        ref="videoRef"
                        :src="videoSrc"
                        preload="metadata"
                        @loadedmetadata="setDuration"
                        @click="togglePlay"
                        @timeupdate="updateCurrentTime"
                        @ended="onVideoEnded"
                    ></video>
                    <div class="video-overlay" @click="togglePlay">
                        <div v-if="!isPlaying" class="play-button">
                            <SvgIcon name="big-play-icon" class="play-icon" />
                        </div>
                        <div class="duration">{{ formattedCountdown }}</div>
                    </div>
                </div>
            </div>
            <div class="scene-page-left-category">
                <div
                    class="category-tab-item"
                    :class="{ active: currentCategory === item.value }"
                    v-for="item in category"
                    :key="item.value"
                    @click="currentCategory = item.value"
                >
                    {{ t(item.label) }}
                </div>
            </div>
            <div class="scene-page-left-list">
                <div class="list-item">
                    <img
                        v-for="(item, index) in category[currentCategory]?.list"
                        :key="index"
                        :src="item.imgSrc"
                        alt="Scene Image"
                        @click="changeVideo(item)"
                    />
                </div>
            </div>
        </div>
        <div class="scene-page-right">
            <div class="scene-page-right-body">
                <div
                    v-for="(item, index) in state.chatMessages"
                    :key="index"
                    :class="`chat-item ${item.type === 'robot' ? 'robot-item' : 'user-item'}`"
                >
                    <span>{{ item.text }}</span>
                </div>
            </div>
            <div class="scene-page-right-footer">
                <div class="send-btn audio-btn" v-if="chatType === 'audio'">
                    <SvgIcon
                        name="keyboard"
                        class="keyboard-icon"
                        v-if="!isCalling"
                        @click="chatType = 'text' && startChat(false)"
                    />
                    <span class="send-text" @click="startChat(true)" v-if="!isCalling">{{
                        t('sceneExperienceCallText')
                    }}</span>
                    <span class="send-text" v-else-if="isCalling && state.status === 'connecting'">视频解析中</span>
                    <VoiceAnimation :animation="true" v-else />
                </div>
                <div class="send-btn text-btn" v-else>
                    <div class="small-voice-icon">
                        <img src="@/assets/images/loadingGif.gif" />
                        <span>{{ t('loadingText') }}</span>
                    </div>

                    <!-- <SvgIcon name="small-voice-icon" class="small-voice-icon" @click="chatType = 'audio'" /> -->
                    <el-input
                        class="input-query"
                        v-model="query"
                        :placeholder="state.status !== 'listening' ? '' : t('placehoder')"
                        :disabled="state.status !== 'listening'"
                        @keyup.enter="sendQuery"
                    />
                    <SvgIcon
                        name="send-icon"
                        :class="`send-icon ${state.status !== 'listening' ? 'disabled-btn' : ''}`"
                        @click="sendQuery"
                    />
                </div>
                <SvgIcon name="close-btn-icon" class="close-icon" @click="stopRecording" v-if="isCalling" />
            </div>
        </div>
    </div>
</template>

<script setup>
    import { getRtcToken, logoutRtc } from '@/apis';
    import { useRoute } from 'vue-router';
    import { getUserCountry } from '@/utils';
    import { useLiveKit, registerCleanup } from '@/hooks/useLiveKit';
    import { useI18n } from 'vue-i18n';
    import { category, allCollection } from '@/utils/sceneExperience';

    const { t } = useI18n();

    const { state, joinRoom, sendText, sendAndLeave } = useLiveKit();

    const emits = defineEmits(['handleLogin']);
    const isCalling = defineModel('isCalling');
    const loading = defineModel('loading');
    const route = useRoute();

    const videoRef = ref(null);
    const isPlaying = ref(false);
    const duration = ref(0);
    const currentTime = ref(0); // 当前播放时间

    const isLoading = ref(false);

    const currentCategory = ref(category[0].value); // 当前选中的分类

    const videoSrc = ref(allCollection[0].videoSrc); // 默认视频源
    const videoId = ref(1); // 默认视频ID

    const token = ref('');

    const mode = ref('audio');
    const showText = ref(false);
    const chatType = ref('audio'); // 聊天类型，默认为音频
    const query = ref('');

    // 远端音频 attach
    const remoteAudioRefs = {};
    watch(
        () => state.remoteTracks,
        async remMap => {
            await nextTick();
            for (const sid in remMap) {
                const tracks = remMap[sid];
                const audioTrack = tracks.find(t => t.kind === 'audio');
                if (audioTrack && remoteAudioRefs[sid]) {
                    audioTrack.attach(remoteAudioRefs[sid]);
                }
            }
        },
        { deep: true }
    );

    const setRemoteAudioRef = sid => {
        return el => {
            if (!el) return;
            remoteAudioRefs[sid] = el;
            const tracks = state.remoteTracks[sid] || [];
            const at = tracks.find(t => t.kind === 'audio');
            if (at) at.attach(el);
        };
    };

    registerCleanup((sids = []) => {
        const list = sids.length ? sids : Object.keys(remoteAudioRefs);
        list.forEach(sid => {
            const el = remoteAudioRefs[sid];
            if (el?.parentNode) el.parentNode.removeChild(el);
            delete remoteAudioRefs[sid];
        });
    });

    // 播放/暂停逻辑
    const togglePlay = () => {
        const video = videoRef.value;
        if (!video) return;
        if (video.paused) {
            video.play();
            isPlaying.value = true;
        } else {
            video.pause();
            isPlaying.value = false;
        }
    };

    const setDuration = () => {
        if (videoRef.value) {
            duration.value = videoRef.value.duration;
        }
    };

    const updateCurrentTime = () => {
        if (videoRef.value) {
            currentTime.value = videoRef.value.currentTime;
        }
    };

    const onVideoEnded = () => {
        isPlaying.value = false;
    };

    // 倒计时格式
    const formattedCountdown = computed(() => {
        const remaining = Math.max(0, duration.value - currentTime.value);
        const m = Math.floor(remaining / 60);
        const s = Math.floor(remaining % 60);
        return `${m}:${s < 10 ? '0' + s : s}`;
    });

    // 切换视频
    const changeVideo = item => {
        videoId.value = item.id;
        videoSrc.value = item.videoSrc;
        resetVideo();
        if (isCalling.value) {
            stopRecording();
        }
    };

    const resetVideo = () => {
        const video = videoRef.value;
        if (!video) return;
        video.pause();
        video.currentTime = 0;
        currentTime.value = 0;
        isPlaying.value = false;
        video.load();
    };

    // 语音通话开启麦克风，文本对话不开麦克风
    const startChat = async flag => {
        console.log('开始聊天');
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (!userInfo || !userInfo.token) {
            emits('handleLogin');
            return;
        }
        if (!route.query.token) {
            const rtcTokenStorage = localStorage.getItem('rtcToken');
            if (rtcTokenStorage) {
                await logoutRtc({
                    token: rtcTokenStorage
                });
                localStorage.removeItem('rtcToken');
            }
            const { code, data } = await getRtcToken({ userToken: userInfo.token });
            console.log('获取到的token:', data, code);
            if (code === 0 && data.token) {
                token.value = data.token;
                localStorage.setItem('rtcToken', data.token);
                if (data.userId) {
                    localStorage.setItem('userId', data.userId);
                }
                if (data.sessionId) {
                    localStorage.setItem('sessionId', data.sessionId);
                }
            } else {
                ElMessage({
                    type: 'error',
                    message: t('tokenErrMsg'),
                    duration: 3000,
                    customClass: 'system-error'
                });
                return;
            }
        } else {
            token.value = route.query.token;
        }
        isCalling.value = true;
        isLoading.value = true;
        const config = { userAgent: navigator.userAgent, joinTime: Date.now() };

        // 🔧 准备初始化配置，直接传入 joinRoom 避免时序竞争
        const initConfig = {
            interface: 'init',
            type: 'scene',
            scene: videoId.value,
            model: localStorage.getItem('model') || 'MiniCPM-o2.6'
        };
        console.log('💾 准备初始化配置（场景体验），传入 joinRoom...');

        await joinRoom(import.meta.env.VITE_LIVEKIT_URL, token.value, mode.value, config, initConfig, flag);
        isLoading.value = false;
    };

    const stopRecording = async () => {
        sendAndLeave(JSON.stringify({ interface: 'stop' }));
        registerCleanup();
        await logoutRtc({
            token: token.value
        });
        localStorage.removeItem('rtcToken');
        isCalling.value = false;
        isLoading.value = false;
        chatType.value = 'audio';
    };

    const sendQuery = () => {
        if (!query.value || query.value.trim().length === 0) {
            return;
        }
        if (state.status !== 'listening') {
            return;
        }
        // sendText(query.value, true);
        console.log('text: ', query.value);
        sendText(
            JSON.stringify({
                interface: 'user_input',
                text: query.value
            }),
            true
        );
        query.value = '';
    };

    onMounted(() => {
        // getUserCountry().then(c => console.log('用户国家:', c));
    });

    onBeforeUnmount(() => {
        registerCleanup();
    });
    defineExpose({
        stopRecording
    });
</script>

<style lang="less" scoped>
    .scene-page {
        flex: 1;
        height: 100%;
        display: flex;
        gap: 8px;
        min-height: 0;
        &-left {
            flex: 1;
            min-width: 0;
            padding: 32px 24px;
            background: rgba(255, 255, 255, 0.6);
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            &-video {
                flex: 1;
                padding-bottom: 16px;

                display: flex;
                flex-direction: column;
                .video-title {
                    color: #595f6d;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                    margin-bottom: 8px;
                }
                .video-container {
                    flex: 1;
                    position: relative;
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 20px;
                    overflow: hidden;
                    height: 100%;
                    video {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        cursor: pointer;
                        display: block;
                    }
                    .video-overlay {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;

                        .play-button {
                            .play-icon {
                                width: 72px;
                                height: 72px;
                                display: block;
                            }
                        }

                        .duration {
                            position: absolute;
                            bottom: 16px;
                            right: 16px;
                            padding: 8px 16px;
                            border-radius: 50px;
                            background: rgba(0, 0, 0, 0.5);
                            backdrop-filter: blur(2.3073408603668213px);
                            color: #fff;
                            // font-family: Roboto;
                            font-size: 16px;
                            font-style: normal;
                            font-weight: 400;
                            line-height: normal;
                        }
                    }
                }
            }
            &-category {
                display: flex;
                align-items: center;
                position: relative;
                overflow: auto;
                .category-tab-item {
                    // width: 100px;
                    padding: 12px;
                    height: 40px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    color: #4f5669;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                    cursor: pointer;
                    user-select: none;
                }
                .category-tab-item.active {
                    color: #1a71ff;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 700;
                    line-height: normal;
                    text-transform: capitalize;
                    border-bottom: 2px solid #1e71ff;
                    z-index: 2;
                }
                &::after {
                    content: '';
                    position: absolute;
                    bottom: 0.5px;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: #e9e9e9;
                    transform: scaleY(0.5);
                    transform-origin: bottom;
                }
            }

            &-list {
                display: flex;
                overflow: auto;
                height: 88px;
                /* 推荐加上这句，防止不滚动时滚动条空间占位 */
                scrollbar-width: thin; /* Firefox */
                scrollbar-color: #28ca42 transparent;

                .list-item {
                    display: flex;
                    justify-content: flex-end;
                    gap: 16px;
                    padding-top: 16px;
                    position: relative;
                    padding-bottom: 8px;
                    img {
                        width: 100px;
                        height: 60px;
                        border-radius: 10px;
                        cursor: pointer;
                        flex-shrink: 0;
                    }
                }
                /* 滚动条整体 */
                &::-webkit-scrollbar {
                    width: 4px; /* 垂直滚动条宽度 */
                    height: 4px; /* 水平滚动条高度 */
                }

                /* 滚动条轨道 */
                &::-webkit-scrollbar-track {
                    background: transparent; /* 透明，不抢占视觉 */
                }

                /* 滚动条滑块 */
                &::-webkit-scrollbar-thumb {
                    background-color: rgba(40, 202, 66, 0.5); /* 半透明，提升隐匿性 */
                    border-radius: 6px;
                }

                /* 滚动条滑块 hover 状态 */
                &::-webkit-scrollbar-thumb:hover {
                    background-color: #28ca42;
                }
            }
        }
        &-right {
            flex-shrink: 0;
            width: 300px;
            height: 100%;
            padding: 32px 8px 32px 16px;
            background: rgba(255, 255, 255, 0.6);
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            overflow: auto;
            min-height: 0;
            &-body {
                // flex: 1;
                overflow: auto;
                // min-height: 0;
                height: calc(100vh - 215px);
                padding-right: 8px;
                .chat-item {
                    color: #595f6d;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: 20px;
                    margin-bottom: 16px;
                    display: flex;
                    width: 100%;
                    > span {
                        display: inline-block;
                        padding: 8px 16px;
                        border-radius: 16px;
                    }
                    &.robot-item {
                        justify-content: flex-start;
                        span {
                            background: #f3f5ff;
                        }
                    }
                    &.user-item {
                        justify-content: flex-end;
                        span {
                            background: #d8e2ff;
                        }
                    }
                }
                /* 滚动条整体 */
                &::-webkit-scrollbar {
                    width: 4px; /* 垂直滚动条宽度 */
                    height: 4px; /* 水平滚动条高度 */
                }

                /* 滚动条轨道 */
                &::-webkit-scrollbar-track {
                    background: #e9e9e9;
                    border-radius: 6px;
                }

                /* 滚动条滑块 */
                &::-webkit-scrollbar-thumb {
                    background-color: #28ca42;
                    border-radius: 6px;
                }

                /* 滚动条滑块 hover 状态 */
                &::-webkit-scrollbar-thumb:hover {
                    background-color: #28ca42;
                }
            }
            &-footer {
                height: 52px;
                padding-top: 12px;
                padding-right: 6px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                position: relative;
                .send-btn {
                    flex: 1;
                    // width: 100%;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 0 6px;
                    border-radius: 90px;

                    user-select: none;
                    position: relative;
                    transition: all 0.3s ease;

                    .send-text {
                        // font-family: Roboto;
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: normal;
                        display: inline-block;
                        padding: 10px 30px;
                        // border: 1px solid red;
                    }
                }
                &::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 16px;
                    right: 16px;
                    height: 1px;
                    background: #e9e9e9;
                    transform: scaleY(0.5);
                    transform-origin: top;
                }
                .send-btn.audio-btn {
                    background: #1e71ff;
                    color: #ffffff;
                    .keyboard-icon {
                        width: 30px;
                        height: 30px;
                        position: absolute;
                        top: 5px;
                        left: 5px;
                    }
                }
                .send-btn.text-btn {
                    background: #ffffff;
                    box-sizing: border-box;
                    border: 0.5px solid #1371ff;
                    display: flex;
                    padding-left: 12px;
                    .small-voice-icon {
                        position: absolute;
                        top: 6px;
                        left: 6px;
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        gap: 2px;
                        img {
                            width: 28px;
                            height: 28px;
                        }
                        span {
                            color: #969799;
                            // font-family: Roboto;
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 400;
                            line-height: normal;
                        }
                    }
                    .send-icon {
                        width: 28px;
                        height: 28px;
                        flex-shrink: 0;
                        opacity: 1;
                    }
                    .send-icon.disabled-btn {
                        cursor: not-allowed;
                        opacity: 0.5;
                    }
                    .el-input {
                        flex: 1;
                    }
                }
                .close-icon {
                    width: 20px;
                    height: 20px;
                    flex-shrink: 0;
                    cursor: pointer;
                }
            }
        }
    }
</style>
<style lang="less">
    .input-query {
        .el-input__wrapper {
            padding: 0 8px 0 0;
            box-shadow: none;
        }
    }
    .input-query.is-disabled {
        .el-input__wrapper {
            background: none;
            box-shadow: none;
        }
    }
</style>
