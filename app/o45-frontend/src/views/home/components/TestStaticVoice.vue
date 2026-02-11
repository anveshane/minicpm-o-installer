<template>
    <!-- 远端音频（后端返回的AI回复音频） -->
    <div class="remote-audio" v-for="(tracks, sid) in state.remoteTracks" :key="sid">
        <audio
            :ref="setRemoteAudioRef(sid)"
            autoplay
            @play="console.log('🔊 远端音频开始播放（后端返回的AI回复）')"
            @ended="console.log('🔇 远端音频播放结束')"
            @loadeddata="onRemoteAudioLoaded"
        ></audio>
    </div>
    <div class="voice-page" v-loading="loading" element-loading-background="rgba(255, 255, 255, 1)">
        <div class="voice-page-content">
            <div class="gif-container" v-if="isCalling || state.status === 'connecting'">
                <VoiceGif :status="state.status" />
            </div>
            <!-- 新增：静态媒体信息显示 -->
            <div class="static-media-info" v-if="isCalling">
                <div class="info-item">
                    <span class="label">发送音频:</span>
                    <span class="value">{{ STATIC_MEDIA_CONFIG.audioFilePath }}</span>
                </div>
                <div class="info-item">
                    <span class="label">发送图片:</span>
                    <span class="value">{{ STATIC_MEDIA_CONFIG.imageFilePath }}</span>
                </div>
                <div class="info-item">
                    <span class="label">播放逻辑:</span>
                    <span class="value">listening时播放，talking时停止</span>
                </div>
                <div class="info-item">
                    <span class="label">说明:</span>
                    <span class="value">静音只影响AI回复音频</span>
                </div>
                <div class="info-item">
                    <span class="label">音频循环:</span>
                    <span class="value">{{ STATIC_MEDIA_CONFIG.enableAudioLoop ? '启用' : '禁用' }}</span>
                </div>
                <div class="info-item">
                    <span class="label">播放状态:</span>
                    <span class="value" :class="getAudioStatusClass()">{{ getAudioStatusText() }}</span>
                </div>
                <div class="info-item">
                    <span class="label">远端静音:</span>
                    <div class="mute-switch" @click="togglePageMute">
                        <div class="switch" :class="{ 'switch-on': isPageMuted }">
                            <div class="switch-handle"></div>
                        </div>
                        <span class="switch-label">{{ isPageMuted ? '已静音' : '未静音' }}</span>
                        <span class="hotkey-tip">(M键)</span>
                    </div>
                </div>
                <div class="info-item">
                    <span class="label">本地播放:</span>
                    <div class="mute-switch" @click="toggleLocalPlayback">
                        <div class="switch" :class="{ 'switch-on': enableLocalPlayback }">
                            <div class="switch-handle"></div>
                        </div>
                        <span class="switch-label">{{ enableLocalPlayback ? '已启用' : '已禁用' }}</span>
                        <span class="hotkey-tip">(录屏用)</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="voice-page-footer">
            <!-- <el-button @click="openSelector">打开语音选择器</el-button>
            <VoiceSelectorDialog ref="selectorDialog" @confirm="handleVoice" /> -->
            <div class="footer-btn">
                <section v-if="!isCalling && !callLoading" @click="initRecording">
                    <SvgIcon name="start" :disabled="!state.connected" class="start-icon" />
                </section>
                <section v-if="isCalling && state.status && state.status !== 'connecting'">
                    <div class="text-btn">
                        <SvgIcon name="text" class="text-icon" @click="showText = true" />
                    </div>
                    <SvgIcon name="end" class="end-icon" @click="stopRecording" />
                    <div class="microphone-btn" @click="toggleMic">
                        <SvgIcon v-if="state.audioEnabled" name="microphone-on" class="microphone-on-icon" />
                        <SvgIcon v-else name="microphone-off" class="microphone-off-icon" />
                    </div>
                </section>
                <div class="interrupt-btn" v-if="isCalling && state.status === 'talking'" @click="interruptChat">
                    <SvgIcon name="interrupt" class="interrupt-icon" />
                    <span>{{ t('audioInterruptionBtn') }}</span>
                </div>
            </div>
            <div :class="`footer-tips ${callLoading || isCalling ? 'hidden-tips' : ''}`">
                {{ isCalling ? '录屏模式：固定音频本地播放已启用，按M键切换远端静音' : t('startBtnText') }}
            </div>
        </div>
    </div>
    <DraggableDialog v-if="showText" :message="state.chatMessages" @close="showText = false" />
</template>
<script setup>
    import { sendMessage, stopMessage, uploadConfig, getRtcToken, logoutRtc } from '@/apis';
    import { encodeWAV } from '@/hooks/useVoice';
    import { getNewUserId, setNewUserId } from '@/hooks/useRandomId';
    import { fetchEventSource } from '@microsoft/fetch-event-source';
    import { MicVAD } from '@ricky0123/vad-web';
    import { voiceConfigList, voiceIdeasList, showIdeasList } from '@/enums';
    import { getChunkLength, formatTimestamp, getErrorLogs, setErrorLogs } from '@/utils';
    import { mergeBase64ToBlob } from './merge';
    import { mergeBase64AudioSegments } from './mergeAudio';
    import WebSocketService from '@/utils/websocket';
    import { useI18n } from 'vue-i18n';
    import { useRoute } from 'vue-router';
    const route = useRoute();
    // import AutoPlayAudioStream from '@/hooks/usePlay';
    import AutoPlayAudioStream from '@/views/test/bestPlayVoice';

    // import AudioPlayer from './audioPlayer/useAudioStream';
    // const audioStream = AudioPlayer();

    // 使用静态媒体的 LiveKit hook
    import { useLiveKit, registerCleanup } from '@/hooks/useLiveKitStatic';
    import { resolveLivekitUrl } from '@/utils/rtcUrl';

    const {
        state,
        joinRoom,
        sendText,
        sendAndLeave,
        switchCamera,
        toggleMic,
        toggleCam,
        STATIC_MEDIA_CONFIG,
        notifyStatusChange,
        setFixedAudioLocalPlayback,
        setFixedAudioLocalVolume
    } = useLiveKit();

    import useAudioStream from '@/audio-core/useAudioStream';
    let streamPlayer = null;

    const { t, locale } = useI18n();

    let ctrl = new AbortController();
    let socket = null;
    const audioData = ref({
        base64Str: '',
        type: 'mp3'
    }); // 自定义音色base64
    const isCalling = defineModel('isCalling');
    const loading = defineModel('loading');
    const taskQueue = ref([]);
    const running = ref(false);
    const outputData = ref([]);
    const textQueue = ref('');
    const textAnimationInterval = ref();

    const isFirstReturn = ref(true); // 首次返回的音频是前端发给后端的音频片段，需要单独处理

    const audioPlayQueue = ref([]);
    const base64List = ref([]);
    const playing = ref(false);
    const skipDisabled = ref(true);
    const stopFlag = ref(false);
    const timbre = ref([1]);
    const isReturnError = ref(false);
    const allVoice = ref([]);
    const callDisabled = ref(true);
    const isMicrophoneOn = ref(true); // 麦克风开关状态

    const feedbackStatus = ref('');
    const curResponseId = ref('');
    const delayTimestamp = ref(0); // 当前发送片延时
    const delayCount = ref(0); // 当前剩余多少ms未发送到接口

    const callLoading = ref(false);

    const modelVersion = ref('');

    const token = ref('');

    const showText = ref(false);

    const audioPlayer = ref(null);

    let audioDOM;

    const isEnd = ref(false); // sse接口关闭，认为模型已完成本次返回

    const emits = defineEmits(['handleLogin']);

    // 远端每个用户的 <audio> 引用集合
    const remoteAudioRefs = {};

    // 在 attach 时为音频元素增加 onplay 记录（与 Voice_new_rtc 对齐）
    function bindPerfEventsForAudio(el, sid) {
        if (!el) return;
        if (el.hasAttribute('data-perf-bound')) return;
        el.setAttribute('data-perf-bound', 'true');
        el.onplay = () => {
            const playTime = performance.now();
            try {
                const { audioRounds, pendingRoundIndex } = state;
                if (pendingRoundIndex >= 0 && audioRounds[pendingRoundIndex]) {
                    const round = audioRounds[pendingRoundIndex];
                    if (!round.firstPlayAt) {
                        round.firstPlayAt = playTime;
                        round.firstPlayWallClock = Date.now();
                        round.firstPlayWallClockFmt = formatTimestamp(round.firstPlayWallClock);
                        if (!round.participantSid) round.participantSid = sid;
                        const deltas = { ...round.deltas };
                        if (round.firstPacketAt) deltas.packetToPlay = round.firstPlayAt - round.firstPacketAt;
                        if (round.generateStartAt)
                            deltas.fromGenerateStartToPlay = round.firstPlayAt - round.generateStartAt;
                        if (round.audioStartSignalAt)
                            deltas.fromAudioSignalToPlay = round.firstPlayAt - round.audioStartSignalAt;
                        round.deltas = deltas;
                        console.log('⏱️ 首次播放时间记录(静态):', { round: round.round, ...round });
                    }
                }
            } catch (e) {
                console.warn('记录首次播放时间失败(静态):', e);
            }
        };
    }

    /**
     * 生成远端 <audio> 的 ref 回调
     */
    function setRemoteAudioRef(sid) {
        return el => {
            if (!el) return;
            remoteAudioRefs[sid] = el;

            // 绑定播放事件用于记录
            bindPerfEventsForAudio(el, sid);

            // 立即应用当前的静音状态
            if (isPageMuted.value) {
                el.volume = 0;
                el.muted = true;
            } else {
                el.volume = 1;
                el.muted = false;
            }
            console.log(`🔊 新音频元素应用静音状态: ${isPageMuted.value}, 音量: ${el.volume}`);

            // 如果远端音轨已存在，就立即 attach
            const tracks = state.remoteTracks[sid] || [];
            const at = tracks.find(t => t.kind === 'audio');
            if (at) {
                at.attach(el);
            }
        };
    }
    const status = ref('connecting'); // 当前状态
    watch(
        [() => isCalling.value, () => callLoading.value, () => state.localAudioActive, () => state.remoteAudioActive],
        ([isCalling, callLoading, localAudioActive, remoteAudioActive]) => {
            console.log(
                '静态媒体模式 - isCalling:',
                isCalling,
                'callLoading:',
                callLoading,
                'localAudioActive:',
                localAudioActive,
                'remoteAudioActive:',
                Object.values(remoteAudioActive)
            );
            if (callLoading) {
                status.value = 'connecting';
                return;
            }
            if (!isCalling) {
                status.value = '';
            } else if (Object.values(remoteAudioActive).every(active => !active)) {
                status.value = 'listening';
            } else if (Object.values(remoteAudioActive).some(active => active)) {
                status.value = 'talking';
            } else {
                // status.value = 'thinking';
                status.value = 'listening'; // 默认状态为 listening
            }
        },
        { immediate: true }
    );
    watch(
        () => state.chatMessages,
        msgs => {
            console.log('静态媒体模式聊天消息:', msgs);
        },
        { deep: true }
    );

    // 监听状态变化，控制固定音频的发送
    watch(
        () => state.status,
        (newStatus, oldStatus) => {
            console.log(`🔄 状态变化: ${oldStatus} → ${newStatus}`);

            // 更新第一次listening标志
            if (newStatus === 'listening' && isFirstListening.value) {
                // 延迟设置，让UI能显示"立即发送"
                setTimeout(() => {
                    isFirstListening.value = false;
                }, 100);
            }

            if (newStatus && notifyStatusChange) {
                notifyStatusChange(newStatus);
            }
        },
        { immediate: true }
    );

    // 清理函数：接受一个 SID 数组（或空表示全部）
    registerCleanup((sids = []) => {
        const list = sids.length ? sids : Object.keys(remoteAudioRefs);
        list.forEach(sid => {
            const el = remoteAudioRefs[sid];
            if (el?.parentNode) el.parentNode.removeChild(el);
            delete remoteAudioRefs[sid];
        });
    });

    const vadStartTime = ref();
    const isSkip = ref(false);
    const mode = ref('audio'); // 'video' or 'audio'
    const count = ref(0);
    let sendTimer = null;
    const initRecording = async () => {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (!userInfo || !userInfo.token) {
            emits('handleLogin');
            return;
        }
        callLoading.value = true;

        console.log('🎯 开始初始化静态媒体通话...');

        if (!route.query.token) {
            // const rtcTokenStorage = localStorage.getItem('rtcToken');
            // if (rtcTokenStorage) {
            //     await logoutRtc({
            //         token: rtcTokenStorage
            //     });
            //     localStorage.removeItem('rtcToken');
            // }
            const { code, data } = await getRtcToken({ userToken: userInfo.token });
            console.log('获取到的token:', data, code);
            if (code === 0 && data.token) {
                token.value = data.token;
                // localStorage.setItem('rtcToken', data.token);
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
                callLoading.value = false;
                return;
            }
        } else {
            token.value = route.query.token;
        }

        const config = {
            userAgent: navigator.userAgent,
            joinTime: Date.now(),
            staticMediaMode: true, // 标记为静态媒体模式
            audioFile: STATIC_MEDIA_CONFIG.audioFilePath,
            imageFile: STATIC_MEDIA_CONFIG.imageFilePath
        };

        console.log('🎯 使用静态媒体配置:', config);
        mode.value = route.query.mode && route.query.mode === 'video' ? 'video' : 'audio';
        console.log('mode: ', mode.value);

        // 🔧 准备初始化配置，直接传入 joinRoom 避免时序竞争
        const initConfig = {
            interface: 'init',
            type: mode.value,
            model: localStorage.getItem('model') || 'MiniCPM-o2.6',
            staticMediaMode: true // 告知后端使用静态媒体模式
        };
        localStorage.setItem('initStatus', '');
        console.log('💾 准备初始化配置（静态媒体模式），传入 joinRoom...');

        await joinRoom(resolveLivekitUrl(), token.value, mode.value, config, initConfig);
        if (state.error) {
            ElMessage({
                type: 'error',
                message: t('callErrMsg'),
                duration: 3000,
                customClass: 'system-error'
            });
            callLoading.value = false;
            return;
        }
        isCalling.value = true;
        callLoading.value = false;

        // 确保本地播放已启用（录屏需要）
        if (setFixedAudioLocalPlayback) {
            setFixedAudioLocalPlayback(enableLocalPlayback.value);
        }

        console.log('✅ 静态媒体通话初始化完成');
    };
    let connectingTimeout;
    watch(
        () => state.status,
        async newStatus => {
            console.log('status变化:', newStatus);
            if (newStatus === 'connecting') {
                connectingTimeout = setTimeout(() => {
                    ElMessage({
                        type: 'error',
                        message: t('callErrMsg'),
                        duration: 3000,
                        customClass: 'system-error'
                    });
                    callLoading.value = false;
                }, 90 * 1000);
            } else if (newStatus !== null) {
                clearTimeout(connectingTimeout);
            }
        }
    );
    onUnmounted(() => {
        clearTimeout(connectingTimeout);
        clearInterval(sendTimer);
    });
    let audioContext;
    const analyser = ref();
    const dataArray = ref();
    let mediaRecorder;
    let audioChunks = [];
    const animationFrameId = ref();

    const isFirstPiece = ref(true);
    let mediaStream;

    // 键盘快捷键支持
    function handleKeyPress(event) {
        if (event.key === 'm' || event.key === 'M') {
            if (!event.ctrlKey && !event.altKey && !event.shiftKey) {
                // 防止在输入框中误触发
                if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
                    event.preventDefault();
                    togglePageMute();
                }
            }
        }
    }

    onMounted(() => {
        // 添加键盘事件监听
        document.addEventListener('keydown', handleKeyPress);

        // 定期检查和应用静音状态（每秒检查一次）
        const muteCheckInterval = setInterval(() => {
            if (isPageMuted.value) {
                // 强制确保所有音频元素都处于静音状态
                const allAudioElements = document.querySelectorAll('.remote-audio audio');
                allAudioElements.forEach(audio => {
                    if (audio.volume > 0 || !audio.muted) {
                        audio.volume = 0;
                        audio.muted = true;
                        console.log('🔧 强制应用静音状态');
                    }
                });
            }
        }, 1000);

        // 保存定时器引用，用于清理
        window.muteCheckInterval = muteCheckInterval;
    });

    onBeforeUnmount(() => {
        // 移除键盘事件监听
        document.removeEventListener('keydown', handleKeyPress);

        // 清理定时器
        if (window.muteCheckInterval) {
            clearInterval(window.muteCheckInterval);
            window.muteCheckInterval = null;
        }

        // 页面销毁前也清理一次
        registerCleanup();

        // 重置远端音频静音状态
        if (isPageMuted.value) {
            // 只重置远端音频元素
            Object.values(remoteAudioRefs).forEach(audioEl => {
                if (audioEl) {
                    audioEl.volume = 1;
                    audioEl.muted = false;
                }
            });
            const remoteAudioElements = document.querySelectorAll('.remote-audio audio');
            remoteAudioElements.forEach(audio => {
                audio.volume = 1;
                audio.muted = false;
            });
        }
    });
    const stopRecording = async () => {
        console.log('🛑 停止静态媒体通话...');

        const obj = {
            interface: 'stop',
            staticMediaMode: true
        };
        sendAndLeave(JSON.stringify(obj));
        registerCleanup();
        await logoutRtc({
            token: token.value
        });
        localStorage.removeItem('rtcToken');
        isCalling.value = false;
        showText.value = false;

        // 重置第一次listening标志
        isFirstListening.value = true;

        // 重置远端音频静音状态
        if (isPageMuted.value) {
            isPageMuted.value = false;
            // 立即恢复所有远端音频的音量
            Object.values(remoteAudioRefs).forEach(audioEl => {
                if (audioEl) {
                    audioEl.volume = 1;
                    audioEl.muted = false;
                }
            });
        }

        console.log('✅ 静态媒体通话已停止');
    };
    const interruptChat = async () => {
        console.log('🚫 静态媒体模式 - 打断操作');

        const obj = {
            interface: 'break',
            staticMediaMode: true
        };
        sendText(JSON.stringify(obj), false);
    };
    const toggleMicrophone = () => {
        isMicrophoneOn.value = !isMicrophoneOn.value;
    };
    const errorMsg = ref('');
    // 每次call先上传当前用户配置
    const uploadUserConfig = async () => {
        if (!localStorage.getItem('configData')) {
            return new Promise(resolve => resolve());
        }
        const {
            videoQuality,
            useAudioPrompt,
            voiceClonePrompt,
            assistantPrompt,
            vadThreshold,
            audioFormat,
            base64Str
        } = JSON.parse(localStorage.getItem('configData'));
        const obj = {
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            input_audio: {
                                data: base64Str,
                                format: audioFormat
                            }
                        },
                        {
                            type: 'options',
                            options: {
                                hd_video: videoQuality,
                                use_audio_prompt: useAudioPrompt,
                                vad_threshold: vadThreshold,
                                voice_clone_prompt: voiceClonePrompt,
                                assistant_prompt: assistantPrompt,
                                static_media_mode: true // 标记静态媒体模式
                            }
                        }
                    ]
                }
            ]
        };
        const { code, message, data } = await uploadConfig(obj);
        modelVersion.value = data?.choices?.content || '';
        return new Promise((resolve, reject) => {
            if (code !== 0) {
                ElMessage({
                    type: 'error',
                    message: message,
                    duration: 3000,
                    customClass: 'system-error'
                });
                reject();
            } else {
                resolve();
            }
        });
    };
    defineExpose({
        stopRecording
    });
    const selectorDialog = ref();

    function openSelector() {
        selectorDialog.value.open();
    }

    function handleVoice(voice) {
        console.log('静态媒体模式 - 你选择了声音：', voice);
    }

    // 远端音频加载完成时的处理
    function onRemoteAudioLoaded(event) {
        const audioElement = event.target;
        if (isPageMuted.value) {
            audioElement.volume = 0;
            audioElement.muted = true;
        } else {
            audioElement.volume = 1;
            audioElement.muted = false;
        }
        console.log(`🔊 远端音频加载完成，应用静音状态: ${isPageMuted.value}, 音量: ${audioElement.volume}`);
    }

    // 切换固定音频本地播放
    function toggleLocalPlayback() {
        enableLocalPlayback.value = !enableLocalPlayback.value;

        // 通知音频控制器
        if (setFixedAudioLocalPlayback) {
            setFixedAudioLocalPlayback(enableLocalPlayback.value);
        }

        console.log(`🔊 固定音频本地播放: ${enableLocalPlayback.value ? '已启用' : '已禁用'}`);

        // 显示提示信息
        ElMessage({
            type: 'info',
            message: enableLocalPlayback.value ? '固定音频本地播放已启用（适合录屏）' : '固定音频本地播放已禁用',
            duration: 2000
        });
    }

    // 应用静音状态到远端音频元素
    function applyMuteToRemoteAudio() {
        // 控制远端音频引用的音量和静音状态
        Object.values(remoteAudioRefs).forEach(audioEl => {
            if (audioEl) {
                if (isPageMuted.value) {
                    // 静音：设置音量为0并标记为静音
                    audioEl.volume = 0;
                    audioEl.muted = true;
                } else {
                    // 取消静音：恢复音量并取消静音标记
                    audioEl.volume = 1;
                    audioEl.muted = false;
                }
                console.log(`🔊 远端音频${audioEl.id || ''}静音状态: ${isPageMuted.value}, 音量: ${audioEl.volume}`);
            }
        });

        // 也控制页面上所有标记为远端的audio元素
        const remoteAudioElements = document.querySelectorAll('.remote-audio audio');
        remoteAudioElements.forEach(audio => {
            if (isPageMuted.value) {
                audio.volume = 0;
                audio.muted = true;
            } else {
                audio.volume = 1;
                audio.muted = false;
            }
            console.log(`🔊 远端音频元素静音状态: ${isPageMuted.value}, 音量: ${audio.volume}`);
        });
    }

    // 切换远端音频静音状态
    function togglePageMute() {
        isPageMuted.value = !isPageMuted.value;

        // 立即应用静音状态到远端音频
        applyMuteToRemoteAudio();

        // 延迟再次检查，确保状态正确应用
        setTimeout(() => {
            applyMuteToRemoteAudio();
        }, 50);

        console.log(`🔊 远端音频静音状态: ${isPageMuted.value ? '已静音' : '未静音'}`);

        // 显示提示信息
        ElMessage({
            type: isPageMuted.value ? 'warning' : 'success',
            message: isPageMuted.value ? '远端音频已静音' : '远端音频已取消静音',
            duration: 2000
        });
    }

    // 跟踪是否是第一次listening状态
    const isFirstListening = ref(true);

    // 远端音频静音控制（只影响后端返回的AI回复音频，不影响发送给后端的固定音频）
    const isPageMuted = ref(false);

    // 固定音频本地播放控制（用于录屏）
    const enableLocalPlayback = ref(true);

    // 获取音频发送状态文本
    function getAudioStatusText() {
        if (!state.status) return '未连接';

        switch (state.status) {
            case 'listening':
                if (isFirstListening.value) {
                    return '立即播放音频';
                } else {
                    return '等待中(3秒后重新播放)';
                }
            case 'talking':
                return '已停止播放';
            case 'thinking':
                return '已停止播放';
            case 'connecting':
                return '连接中';
            default:
                return state.status;
        }
    }

    // 获取音频发送状态样式类
    function getAudioStatusClass() {
        if (!state.status) return 'status-disconnected';

        switch (state.status) {
            case 'listening':
                return 'status-waiting';
            case 'talking':
            case 'thinking':
                return 'status-stopped';
            case 'connecting':
                return 'status-connecting';
            default:
                return '';
        }
    }
</script>
<style lang="less" scoped>
    .voice-page {
        flex: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 32px 0 14px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 20px;
        &-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            padding-bottom: 140px;
            justify-content: center;
            .gif-container {
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                position: relative;
            }
            .static-media-info {
                position: absolute;
                top: 20px;
                left: 20px;
                background: rgba(255, 255, 255, 0.9);
                border-radius: 8px;
                padding: 12px;
                font-size: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                .info-item {
                    display: flex;
                    margin-bottom: 4px;
                    .label {
                        font-weight: bold;
                        color: #666;
                        margin-right: 8px;
                        min-width: 60px;
                    }
                    .value {
                        color: #333;
                        flex: 1;
                    }
                }
                .info-item:last-child {
                    margin-bottom: 0;
                }

                .status-waiting {
                    color: #28a745;
                    font-weight: 500;
                }

                .status-stopped {
                    color: #dc3545;
                    font-weight: 500;
                }

                .status-connecting {
                    color: #ffc107;
                    font-weight: 500;
                }

                .status-disconnected {
                    color: #6c757d;
                    font-weight: 500;
                }

                .mute-switch {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;

                    .switch {
                        width: 40px;
                        height: 20px;
                        background: #ccc;
                        border-radius: 10px;
                        position: relative;
                        transition: background-color 0.3s;

                        &.switch-on {
                            background: #ff6b6b;
                        }

                        // 本地播放开关使用绿色
                        .info-item:last-child &.switch-on {
                            background: #28a745;
                        }

                        .switch-handle {
                            width: 16px;
                            height: 16px;
                            background: white;
                            border-radius: 50%;
                            position: absolute;
                            top: 2px;
                            left: 2px;
                            transition: transform 0.3s;
                            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                        }

                        &.switch-on .switch-handle {
                            transform: translateX(20px);
                        }
                    }

                    .switch-label {
                        font-size: 12px;
                        color: #666;
                        font-weight: 500;

                        .switch-on + & {
                            color: #ff6b6b;
                        }
                    }

                    &:hover .switch {
                        opacity: 0.8;
                    }

                    .hotkey-tip {
                        font-size: 10px;
                        color: #999;
                        font-style: italic;
                    }
                }
            }
        }
        &-footer {
            // cursor: pointer;
            position: absolute;
            bottom: 14px;
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-direction: column;
            .footer-btn {
                width: 100%;
                // margin-bottom: 6px;
                padding-bottom: 1.5px;
                section {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 72px;
                    .text-btn,
                    .microphone-btn {
                        width: 60px;
                        height: 60px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        border-radius: 50%;
                        background: #f3f6ff;
                    }
                    .text-icon,
                    .microphone-on-icon {
                        width: 30px;
                        height: 30px;
                        color: #365a98;
                    }
                    .microphone-off-icon {
                        width: 30px;
                        height: 30px;
                        color: #eb5757;
                    }
                }

                .start-icon,
                .end-icon {
                    width: 72px;
                    height: 72px;
                }
                .text-icon,
                .microphone-icon {
                    width: 30px;
                    height: 30px;
                }
                .interrupt-btn {
                    position: absolute;
                    left: 50%;
                    top: 0;
                    transform: translate(-50%, calc(-100% - 20px));
                    display: inline-flex;
                    justify-content: center;
                    align-items: center;
                    padding: 8px 16px;
                    gap: 4px;
                    border-radius: 12px;
                    background: #fff;
                    box-shadow: 0 0 15px 0 rgba(0, 0, 0, 0.05);
                    cursor: pointer;
                    .interrupt-icon {
                        width: 16px;
                        height: 16px;
                    }
                    span {
                        color: #6893fb;
                        // font-family: Roboto;
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: normal;
                    }
                }
            }
            .footer-tips {
                text-align: center;
                color: #6893fb;
                // font-family: Roboto;
                font-size: 12px;
                font-style: normal;
                font-weight: 400;
                line-height: normal;
                user-select: none;
            }
            .hidden-tips {
                opacity: 0;
            }
        }
        &-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1px 0 8px;
            box-shadow: 0 0.5px 0 0 rgba(224, 224, 224, 0.5);
            margin-bottom: 8px;
            .header-left {
                display: flex;
                align-items: center;
                .voice-container {
                    margin-left: 16px;
                    display: flex;
                    .voice-icon {
                        width: 144px;
                        height: 34px;
                    }
                }
            }
        }
        &-output {
            flex: 1;
            height: 0;
            padding: 0 16px 8px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 0.5px 0 0 rgba(224, 224, 224, 0.5);
            .output-content {
                flex: 1;
                overflow: auto;
            }
            .skip-box {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                margin-top: 16px;
            }
        }
        &-btn {
            text-align: center;
            padding: 8px 0;
            .el-button {
                width: 284px;
                height: 46px;
                border-radius: 8px;
            }
            .el-button.el-button--success {
                background: #647fff;
                border-color: #647fff;
                &:hover {
                    opacity: 0.8;
                }
                span {
                    color: #fff;
                    // font-family: PingFang SC;
                    font-size: 16px;
                    font-style: normal;
                    font-weight: 500;
                    line-height: normal;
                }
            }
            .el-button.el-button--success.is-disabled {
                background: #f3f3f3;
                border-color: #f3f3f3;
                span {
                    color: #d1d1d1;
                }
            }
            .el-button.el-button--danger {
                border-color: #dc3545;
                background-color: #dc3545;
                color: #ffffff;
                // font-family: PingFang SC;
                font-size: 16px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
                .phone-icon {
                    margin-right: 10px;
                }
                .btn-text {
                    margin-right: 10px;
                }
                .btn-desc {
                    margin-right: 16px;
                }
                .time {
                    display: flex;
                    align-items: center;
                    .time-minute,
                    .time-second {
                        width: 26px;
                        height: 26px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        border-radius: 3.848px;
                        background: rgba(47, 47, 47, 0.5);
                    }
                    .time-colon {
                        margin: 0 3px;
                    }
                }
            }
        }
    }
</style>
