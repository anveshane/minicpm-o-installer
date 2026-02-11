<!--
    ==================== 手机端语音通话组件 ====================
    独立的手机端代码，适配全屏布局
    文件路径：src/views/home/components/Voice_new_rtc.mobile.vue
-->
<template>
    <div class="remote-audio" v-for="(tracks, sid) in state.remoteTracks" :key="sid">
        <audio :ref="setRemoteAudioRef(sid)" autoplay playsinline preload="auto" :muted="false"></audio>
    </div>

    <!-- 字幕面板（从底部弹出，覆盖在页面上） -->
    <transition name="fade">
        <div v-if="showText" class="subtitle-mask" @click="showText = false"></div>
    </transition>
    <transition name="slide-up">
        <div v-if="showText" class="subtitle-panel-popup">
            <div class="subtitle-header">
                <div class="header-spacer"></div>
                <span>{{ t('captions') }}</span>
                <div class="close-btn-wrapper" @click="showText = false">
                    <div class="close-btn">
                        <SvgIcon name="ipad-close" class="icon-close" />
                    </div>
                </div>
            </div>
            <div class="subtitle-content" ref="subtitleScrollContainer">
                <p v-for="(item, index) in messagesList" :key="index">{{ item }}</p>
            </div>
        </div>
    </transition>

    <div class="mobile-layout-container" ref="mobileLayoutContainer">
        <!-- 主语音页面 -->
        <div class="voice-page" v-loading="loading" element-loading-background="transparent">
            <div class="voice-page-content">
                <div class="gif-container" v-if="isCalling || state.status === 'connecting'">
                    <VoiceGifCopy
                        :status="state.status"
                        :volume="currentVolume"
                        :animationGroup="modelType === 'simplex' ? 1 : 5"
                        :mode="modelType"
                    />
                </div>
            </div>
            <!-- 默认状态：开始按钮（底部切换栏还在）-->
            <div class="voice-page-footer-start" v-if="!isCalling && !callLoading">
                <div class="btn-start-box">
                    <SvgIcon name="start" :disabled="!state.connected" class="start-icon" @click="initRecording" />
                    <div class="footer-tips">{{ t('startBtnText') }}</div>
                </div>
            </div>

            <!-- 通话中状态：按钮组（底部切换栏已隐藏）-->
            <div
                class="voice-page-footer-calling"
                v-else-if="isCalling && state.status && state.status !== 'connecting'"
            >
                <div class="calling-buttons">
                    <!-- 1. 打断按钮 - 始终显示，只有 talking 时可点击 -->
                    <div
                        class="btn-item"
                        :class="{ disabled: state.status !== 'talking' }"
                        @click="state.status === 'talking' && interruptChat()"
                    >
                        <div class="btn-circle">
                            <SvgIcon name="mobile-interrupt" class="interrupt-icon" />
                        </div>
                        <div class="btn-label">{{ t('interrupt') }}</div>
                    </div>

                    <!-- 2. 字幕按钮 -->
                    <div class="btn-item" @click="showText = !showText">
                        <div class="btn-circle">
                            <SvgIcon name="text" class="btn-icon" />
                        </div>
                        <div class="btn-label">{{ t('captions') }}</div>
                    </div>

                    <!-- 3. 静音按钮 -->
                    <div class="btn-item" @click="toggleMic">
                        <div class="btn-circle" :class="{ 'mic-off': !state.audioEnabled }">
                            <SvgIcon v-if="state.audioEnabled" name="mobile-microphone-on" class="microphone-on" />
                            <SvgIcon v-else name="mobile-microphone-off" class="btn-icon microphone-off" />
                        </div>
                        <div class="btn-label">{{ state.audioEnabled ? t('mute') : t('unmute') }}</div>
                    </div>

                    <!-- 4. 退出按钮 -->
                    <div class="btn-item" @click="stopRecording">
                        <div class="btn-circle btn-circle-end">
                            <SvgIcon name="mobile-end" class="btn-icon btn-icon-end" />
                        </div>
                        <div class="btn-label">{{ t('exit') }}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
<script setup>
    import { sendMessage, stopMessage, uploadConfig, getRtcToken, logoutRtc } from '@/apis';
    import { encodeWAV } from '@/hooks/useVoice';
    import { getNewUserId, setNewUserId } from '@/hooks/useRandomId';
    import { fetchEventSource } from '@microsoft/fetch-event-source';
    import { MicVAD } from '@ricky0123/vad-web';
    import { voiceConfigList, voiceIdeasList, showIdeasList } from '@/enums';
    import { saveSessionId } from '@/utils/sessionStorage';
    import { getChunkLength, formatTimestamp, getErrorLogs, setErrorLogs } from '@/utils';
    import { mergeBase64ToBlob } from './merge';
    import { mergeBase64AudioSegments } from './mergeAudio';
    import WebSocketService from '@/utils/websocket';
    import { useI18n } from 'vue-i18n';
    import { useRoute } from 'vue-router';
    const route = useRoute();
    // import AutoPlayAudioStream from '@/hooks/usePlay';
    import AutoPlayAudioStream from '@/views/test/bestPlayVoice';

    // 导入 VoiceGifCopy 组件
    import VoiceGifCopy from '@/components/VoiceGifCopy/index.vue';

    // import AudioPlayer from './audioPlayer/useAudioStream';
    // const audioStream = AudioPlayer();

    import {
        useLiveKit,
        registerCleanup,
        registerTrackSubscribed,
        triggerCleanup,
        triggerNoRobotTimeout,
        getNoRobotTimerStatus
    } from '@/hooks/useLiveKit';
    import { resolveLivekitUrl } from '@/utils/rtcUrl';

    const { state, joinRoom, sendText, sendAndLeave, switchCamera, toggleMic, toggleCam, markAudioActualPlay } =
        useLiveKit();

    // 全局AudioContext预热
    let globalAudioContext = null;

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
    defineProps({
        modelType: {
            type: String,
            default: 'simplex'
        }
    });
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
    const userId = ref('');

    const showText = ref(false);
    const isLandscape = ref(false); // 横竖屏状态
    const subtitleScrollContainer = ref(null); // 字幕滚动容器
    const tabletLayoutContainer = ref(null); // 语音页面容器

    const audioPlayer = ref(null);

    let audioDOM;

    const isEnd = ref(false); // sse接口关闭，认为模型已完成本次返回

    const emits = defineEmits(['handleLogin', 'updateSessionId']);

    // 远端每个用户的 <audio> 引用集合
    const remoteAudioRefs = {};

    // 字幕消息列表
    const messagesList = computed(() => {
        return state.chatMessages.filter(item => item?.text.trim() !== '').map(item => item.text);
    });

    // 动态音量值（会持续更新模拟真实效果）
    const currentVolume = ref(0.2);
    const listeningVolume = ref(0.2); // 聆听中的麦克风音量
    const thinkingVolume = ref(0.5); // 思考中的模型音量
    let volumeUpdateInterval = null;

    // 工具函数：Clamp
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    // 从 LiveKit 获取实时音量（0-1）
    const getLocalAudioLevel = () => {
        return state.room?.localParticipant?.audioLevel ?? 0;
    };

    const getRemoteAudioLevel = () => {
        const participants = state.room?.participants;
        if (!participants) return 0;
        let maxLevel = 0;
        // LiveKit Room.participants 是 Map，防御性遍历
        participants.forEach(p => {
            maxLevel = Math.max(maxLevel, p?.audioLevel ?? 0);
        });
        return maxLevel;
    };

    // 监听本地麦克风音量（listening 状态）
    const updateListeningVolume = () => {
        // 使用 livekit 的实时本地音量
        const level = clamp(getLocalAudioLevel(), 0, 1);
        // 映射到视觉音量区间，保留轻微抖动以避免“卡死”
        const target = 0.12 + level * 0.75; // 0.12 - 0.87
        const jitter = (Math.random() - 0.5) * 0.04; // ±0.02
        listeningVolume.value = clamp(target + jitter, 0.05, 0.9);
    };

    // 监听模型说话音量（thinking 和 talking 状态）
    const updateThinkingVolume = () => {
        const level = clamp(getRemoteAudioLevel(), 0, 1);
        // 远端音量映射稍高，让回答时更有张力
        const target = 0.2 + level * 0.75; // 0.2 - 0.95
        const jitter = (Math.random() - 0.5) * 0.05; // ±0.025
        thinkingVolume.value = clamp(target + jitter, 0.1, 0.95);
    };

    // 根据状态选择合适的音量值
    const updateCurrentVolume = () => {
        if (state.status === 'listening') {
            updateListeningVolume();
            currentVolume.value = listeningVolume.value;
        } else if (state.status === 'thinking' || state.status === 'talking') {
            updateThinkingVolume();
            currentVolume.value = thinkingVolume.value;
        } else if (state.status === 'connecting' || state.status === 'initializing') {
            currentVolume.value = 0.15;
        } else {
            currentVolume.value = 0.25;
        }
    };

    // 启动音量持续更新
    const startVolumeUpdates = () => {
        if (volumeUpdateInterval) return;

        updateCurrentVolume();

        // 每 150ms 更新一次音量（聆听时对键盘敲击更敏感）
        volumeUpdateInterval = setInterval(updateCurrentVolume, 150);
    };

    // 停止音量更新
    const stopVolumeUpdates = () => {
        if (volumeUpdateInterval) {
            clearInterval(volumeUpdateInterval);
            volumeUpdateInterval = null;
        }
    };

    // 监听通话状态，自动启动/停止音量更新
    watch(
        () => isCalling.value,
        calling => {
            if (calling) {
                startVolumeUpdates();
            } else {
                stopVolumeUpdates();
                currentVolume.value = 0.2;
            }
        },
        { immediate: true }
    );

    // 检测横竖屏
    const checkOrientation = () => {
        isLandscape.value = window.innerWidth > window.innerHeight;
    };

    // 字幕自动滚动
    const scrollSubtitleToBottom = () => {
        const el = subtitleScrollContainer.value;
        if (el) {
            nextTick(() => {
                el.scrollTop = el.scrollHeight;
            });
        }
    };

    // 监听字幕变化，自动滚动
    watch(
        messagesList,
        () => {
            scrollSubtitleToBottom();
        },
        { deep: true }
    );

    // 性能监测
    const performanceMetrics = {
        firstAudioAttachTime: null,
        firstAudioPlayTime: null,
        audioContextResumeTime: null
    };

    /**
     * 简化的音频轨道attach函数 - 专注于速度
     */
    function attachAudioTrackImmediate(track, audioElement, sid) {
        const startTime = performance.now();

        try {
            // 立即attach，不做额外检查
            track.attach(audioElement);

            // 记录性能指标
            if (!performanceMetrics.firstAudioAttachTime) {
                performanceMetrics.firstAudioAttachTime = performance.now();
            }

            console.log(`🔊 音频轨道attach: ${(performance.now() - startTime).toFixed(2)}ms`, { sid });
        } catch (error) {
            console.error('音频轨道attach失败:', error, { sid });
        }
    }

    /**
     * 2. 监听远端轨道 - 移除Vue延迟，优先使用LiveKit事件
     */
    watch(
        () => state.remoteTracks,
        remMap => {
            // 移除 nextTick 以减少延迟
            for (const sid in remMap) {
                const tracks = remMap[sid];
                const audioTrack = tracks.find(t => t.kind === 'audio');
                if (audioTrack && remoteAudioRefs[sid]) {
                    const attachStart = performance.now();
                    console.log('远端音频轨道变化 (Vue watch):', { sid, trackId: audioTrack.sid });

                    // 立即 attach，不做额外处理
                    audioTrack.attach(remoteAudioRefs[sid]);

                    console.log(`🔊 Vue watch attach 耗时: ${(performance.now() - attachStart).toFixed(2)}ms`);
                }
            }
        },
        { deep: true }
    );

    /**
     * 优化的远端 <audio> ref 回调 - 激进低延迟版本
     */
    function setRemoteAudioRef(sid) {
        return el => {
            if (!el) return;

            const refStart = performance.now();

            // 设置优化属性
            el.autoplay = true;
            el.playsInline = true;
            el.preload = 'none'; // 不预加载，减少初始化延迟
            el.muted = false;
            // 标记为 LiveKit 附加音频，便于精准 DOM 检查
            el.setAttribute('data-livekit-audio', sid);

            // 添加性能监测事件
            el.onloadstart = () => {
                console.log(`🎵 音频开始加载: ${sid}, ${performance.now()}`);
            };

            el.oncanplay = () => {
                console.log(`🎵 音频可播放: ${sid}, ${performance.now()}`);
            };

            el.onplay = () => {
                const playTime = performance.now();
                if (!performanceMetrics.firstAudioPlayTime) {
                    performanceMetrics.firstAudioPlayTime = playTime;
                    console.log(`🎵 首次音频播放: ${sid}, 时间: ${playTime}`);
                } else {
                    console.log(`🎵 音频播放: ${sid}, 时间: ${playTime}`);
                }
                // 记录到全局轮次结构中
                try {
                    const { audioRounds, pendingRoundIndex } = state;
                    if (pendingRoundIndex >= 0 && audioRounds[pendingRoundIndex]) {
                        const round = audioRounds[pendingRoundIndex];
                        if (!round.firstPlayAt) {
                            round.firstPlayAt = playTime;
                            round.firstPlayWallClock = Date.now();
                            round.firstPlayWallClockFmt = formatTimestamp(round.firstPlayWallClock);
                            // 回填 participantSid
                            if (!round.participantSid) round.participantSid = sid;
                            const deltas = { ...round.deltas };
                            if (round.firstPacketAt) deltas.packetToPlay = round.firstPlayAt - round.firstPacketAt;
                            if (round.generateStartAt)
                                deltas.fromGenerateStartToPlay = round.firstPlayAt - round.generateStartAt;
                            if (round.audioStartSignalAt)
                                deltas.fromAudioSignalToPlay = round.firstPlayAt - round.audioStartSignalAt;
                            round.deltas = deltas;
                            console.log('⏱️ 首次播放时间记录:', { round: round.round, ...round });
                        }
                    }
                } catch (e) {
                    console.warn('记录首次播放时间失败:', e);
                }
            };

            el.onerror = err => {
                console.error(`🎵 音频播放错误: ${sid}`, err);
            };

            remoteAudioRefs[sid] = el;

            console.log(`🎵 Audio ref 设置耗时: ${(performance.now() - refStart).toFixed(2)}ms`);

            // 如果远端音轨已存在，就立即 attach
            const tracks = state.remoteTracks[sid] || [];
            const at = tracks.find(t => t.kind === 'audio');
            if (at) {
                console.log(`🚀 立即 attach 已存在的轨道: ${sid}`);
                attachAudioTrackImmediate(at, el, sid);
            }
        };
    }

    // 🔧 修复：移除未使用的自定义 status，统一使用 state.status
    // 原因：与视频通话保持一致，都直接使用 useLiveKit 中的 state.status
    // state.status 有完善的检查机制（包括DOM音频元素状态检查），更准确
    watch(
        [() => isCalling.value, () => callLoading.value, () => state.localAudioActive, () => state.remoteAudioActive],
        ([isCalling, callLoading, localAudioActive, remoteAudioActive]) => {
            console.log(
                '🔍 [Voice Mobile] 状态调试:',
                'isCalling:',
                isCalling,
                'callLoading:',
                callLoading,
                'localAudioActive:',
                localAudioActive,
                'remoteAudioActive:',
                Object.values(remoteAudioActive),
                'state.status:',
                state.status
            );
        },
        { immediate: true }
    );
    watch(
        () => state.chatMessages,
        msgs => {
            console.log('hhh:', msgs);
        },
        { deep: true }
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
        const startTime = performance.now();
        console.log(`🚀 开始初始化录音连接: ${startTime}`);

        // const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        // if (!userInfo || !userInfo.token) {
        //     emits('handleLogin');
        //     return;
        // }
        callLoading.value = true;
        if (!route.query.token) {
            const rtcTokenStorage = localStorage.getItem('rtcToken');
            const userIdStorage = localStorage.getItem('userId');
            if (rtcTokenStorage && userIdStorage) {
                await logoutRtc({
                    token: rtcTokenStorage,
                    userId: userIdStorage
                });
                localStorage.removeItem('rtcToken');
                localStorage.removeItem('userId');
            }
            const { code, data } = await getRtcToken('audio');
            console.log('获取到的token:', data, code);
            if (code === 0 && data.token) {
                token.value = data.token;
                userId.value = data.userId;
                localStorage.setItem('rtcToken', data.token);
                localStorage.setItem('userId', data.userId);

                // 保存session_id到localStorage
                if (data.sessionId) {
                    saveSessionId(data.sessionId);
                    localStorage.setItem('sessionId', data.sessionId);
                    emits('updateSessionId', data.sessionId);
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

        const config = { userAgent: navigator.userAgent, joinTime: Date.now() };

        // 🔧 准备初始化配置，直接传入 joinRoom 避免时序竞争
        const initConfig = {
            interface: 'init',
            type: 'audio',
            model: localStorage.getItem('model') || 'MiniCPM-o2.6'
        };
        localStorage.setItem('initStatus', '');
        console.log('💾 准备初始化配置，传入 joinRoom...');

        const joinStartTime = performance.now();
        await joinRoom(resolveLivekitUrl(), token.value, mode.value, config, initConfig);
        const joinEndTime = performance.now();

        console.log(`🎯 joinRoom耗时: ${(joinEndTime - joinStartTime).toFixed(2)}ms`);

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

        // 记录总初始化时间
        const totalInitTime = performance.now() - startTime;
        console.log(`✅ 初始化完成，总耗时: ${totalInitTime.toFixed(2)}ms`);

        // 定时重发逻辑 - 已注释，由后端模型初始化信号触发
        // sendTimer = setInterval(() => {
        //     if (count.value < 10) {
        //         count.value++;
        //         if (localStorage.getItem('initStatus') === 'done' || state.modelInitialized) {
        //             clearInterval(sendTimer);
        //             return;
        //         }
        //         // 如果模型已初始化，发送配置；否则继续等待
        //         if (state.modelInitialized) {
        //             sendText(JSON.stringify(obj));
        //             console.log('定时发送第' + count.value + '次' + `, 时间: ${+new Date()}`);
        //         }
        //     } else {
        //         clearInterval(sendTimer);
        //     }
        // }, 30 * 1000);
    };
    let audioContext;
    const analyser = ref();
    const dataArray = ref();
    let mediaRecorder;
    let audioChunks = [];
    const animationFrameId = ref();

    const isFirstPiece = ref(true);
    let mediaStream;

    // AudioContext预热和初始化 - 简化版本
    onMounted(() => {
        // 检测横竖屏
        checkOrientation();
        window.addEventListener('resize', checkOrientation);
        window.addEventListener('orientationchange', checkOrientation);

        // 延迟初始化以避免阻塞页面加载
        nextTick(() => {
            initializeAudioContext();
            setupLiveKitEventHandlers();
            // 移除预加载，因为可能造成延迟
            // preloadAudioResources();
        });

        // 开发环境：暴露测试函数到全局
        if (import.meta.env.DEV) {
            // 测试无机器人超时（支持强制模式）
            window.__testNoRobotTimeout = (force = false) => {
                console.log('🧪 Voice组件：手动触发无机器人超时测试', { force });
                const triggered = triggerNoRobotTimeout(force);
                console.log('🧪 触发结果:', triggered);
                if (triggered) {
                    console.log('🧪 执行挂断流程...');
                    // 如果成功触发，执行挂断流程
                    setTimeout(() => {
                        stopRecording();
                    }, 100); // 给 alert 一点时间
                } else {
                    console.warn('🧪 未触发超时，请检查是否已开始通话');
                    console.warn('🧪 或尝试强制模式: window.__testNoRobotTimeout(true)');
                }
                return triggered;
            };

            // 查看定时器状态
            window.__checkTimerStatus = () => {
                return getNoRobotTimerStatus();
            };

            // 完整的测试信息
            window.__debugInfo = () => {
                const info = {
                    isCalling: isCalling.value,
                    callLoading: callLoading.value,
                    livekitConnected: state.connected,
                    livekitStatus: state.status,
                    remoteParticipants: Object.keys(state.remoteTracks).length,
                    timerStatus: getNoRobotTimerStatus()
                };
                console.table(info);
                return info;
            };

            console.log('🧪 测试函数已暴露:');
            console.log('  - window.__testNoRobotTimeout(force?) : 触发超时测试');
            console.log('  - window.__checkTimerStatus() : 查看定时器状态');
            console.log('  - window.__debugInfo() : 查看完整调试信息');
        }
    });

    onBeforeUnmount(() => {
        // 移除横竖屏监听
        window.removeEventListener('resize', checkOrientation);
        window.removeEventListener('orientationchange', checkOrientation);

        // 停止音量更新
        stopVolumeUpdates();

        // 页面销毁前也清理一次
        triggerCleanup();
        if (globalAudioContext) {
            globalAudioContext.close().catch(() => {});
        }
    });

    /**
     * 初始化AudioContext以避免首次播放延迟 - 简化版本
     */
    function initializeAudioContext() {
        try {
            if (!globalAudioContext) {
                globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                performanceMetrics.audioContextResumeTime = performance.now();

                console.log('🎧 AudioContext初始化完成:', globalAudioContext.state);

                // 不立即恢复，等到需要时再恢复
                // if (globalAudioContext.state === 'suspended') {
                //     globalAudioContext.resume();
                // }
            }
        } catch (error) {
            console.error('AudioContext初始化失败:', error);
        }
    }

    /**
     * 预加载音频资源
     */
    function preloadAudioResources() {
        try {
            // 创建一个静音的音频轨道来预热解码器
            const silentAudio = document.createElement('audio');
            silentAudio.preload = 'auto';
            silentAudio.muted = true;
            silentAudio.autoplay = true;
            silentAudio.style.display = 'none';

            // 创建一个很短的静音音频数据URL
            const silentDataUrl =
                'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmHgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
            silentAudio.src = silentDataUrl;

            document.body.appendChild(silentAudio);

            // 短时间后移除
            setTimeout(() => {
                if (silentAudio.parentNode) {
                    silentAudio.parentNode.removeChild(silentAudio);
                }
            }, 1000);

            console.log('🎧 音频资源预热完成');
        } catch (error) {
            console.warn('音频资源预热失败:', error);
        }
    }

    /**
     * 设置LiveKit事件处理器 - 激进低延迟版本
     */
    function setupLiveKitEventHandlers() {
        // 注册轨道订阅回调 - 优先级最高
        registerTrackSubscribed((track, participant) => {
            const sid = participant.sid;
            const audioElement = remoteAudioRefs[sid];

            if (track.kind === 'audio' && audioElement) {
                const liveKitAttachStart = performance.now();
                console.log(`🚀 LiveKit原生事件触发 attach: ${sid}`);

                // 立即 attach，无任何延迟
                track.attach(audioElement);

                // 添加详细的音频事件监听器
                const playingListener = () => {
                    const playingTime = performance.now();
                    console.log(
                        `%c▶️ [Audio Playing 事件] iPad端`,
                        'color: #00ff00; font-weight: bold; font-size: 14px',
                        {
                            参与者SID: sid,
                            触发时间: playingTime.toFixed(2) + 'ms',
                            音频元素状态: {
                                paused: audioElement.paused,
                                currentTime: audioElement.currentTime.toFixed(3) + 's',
                                duration: audioElement.duration ? audioElement.duration.toFixed(3) + 's' : 'N/A',
                                readyState: audioElement.readyState,
                                networkState: audioElement.networkState
                            },
                            Track信息: {
                                trackSid: track.sid,
                                enabled: track.mediaStreamTrack?.enabled,
                                muted: track.mediaStreamTrack?.muted,
                                readyState: track.mediaStreamTrack?.readyState
                            }
                        }
                    );
                    // 记录到 audioRounds
                    markAudioActualPlay(sid);
                };

                const canplayListener = () => {
                    console.log(
                        `%c🎵 [Audio CanPlay 事件] iPad端`,
                        'color: #ffcc00; font-weight: bold; font-size: 13px',
                        {
                            参与者SID: sid,
                            触发时间: performance.now().toFixed(2) + 'ms',
                            readyState: audioElement.readyState
                        }
                    );
                };

                const loadedmetadataListener = () => {
                    console.log(
                        `%c📊 [Audio LoadedMetadata 事件] iPad端`,
                        'color: #66ccff; font-weight: bold; font-size: 13px',
                        {
                            参与者SID: sid,
                            触发时间: performance.now().toFixed(2) + 'ms',
                            duration: audioElement.duration ? audioElement.duration.toFixed(3) + 's' : 'N/A'
                        }
                    );
                };

                // 绑定事件监听器
                audioElement.addEventListener('playing', playingListener, { once: true });
                audioElement.addEventListener('canplay', canplayListener, { once: true });
                audioElement.addEventListener('loadedmetadata', loadedmetadataListener, { once: true });

                // 手动触发播放以确保立即开始
                const playPromise = audioElement.play();
                if (playPromise) {
                    playPromise.catch(err => {
                        console.warn('自动播放被阻止:', err);
                        // 尝试静音播放
                        audioElement.muted = true;
                        audioElement.play().catch(() => {});
                    });
                }

                console.log(`🚀 LiveKit attach 耗时: ${(performance.now() - liveKitAttachStart).toFixed(2)}ms`);
            } else if (track.kind === 'audio') {
                console.warn(`⚠️ 音频元素尚未就绪: ${sid}`);
            }
        });

        console.log('🎯 LiveKit事件处理器已设置 (激进模式)');
    }

    /**
     * 打印详细的性能报告 - 针对700ms问题
     */
    function printPerformanceReport() {
        const report = {
            audioContextResumeTime: performanceMetrics.audioContextResumeTime,
            firstAudioAttachTime: performanceMetrics.firstAudioAttachTime,
            firstAudioPlayTime: performanceMetrics.firstAudioPlayTime,
            totalResponseTime: performanceMetrics.firstAudioPlayTime - performanceMetrics.audioContextResumeTime,

            // 新增的详细指标
            attachToPlayDelay: performanceMetrics.firstAudioPlayTime - performanceMetrics.firstAudioAttachTime,
            contextToAttachDelay: performanceMetrics.firstAudioAttachTime - performanceMetrics.audioContextResumeTime
        };

        console.log('📈 WebRTC音频性能详细报告:', report);

        // 详细分析
        console.log('🔍 延迟分析:');
        console.log(`  - AudioContext 初始化到 Attach: ${report.contextToAttachDelay?.toFixed(2) || 'N/A'}ms`);
        console.log(`  - Attach 到播放: ${report.attachToPlayDelay?.toFixed(2) || 'N/A'}ms`);
        console.log(`  - 总响应时间: ${report.totalResponseTime?.toFixed(2) || 'N/A'}ms`);

        // 性能评估
        if (report.totalResponseTime) {
            if (report.totalResponseTime < 200) {
                console.log('✅ 性能极佳！响应时间 < 200ms');
            } else if (report.totalResponseTime < 500) {
                console.log('✅ 性能优秀！响应时间 < 500ms');
            } else if (report.totalResponseTime < 1000) {
                console.log('⚠️ 性能一般，响应时间 < 1s');
            } else {
                console.log('❌ 性能需要优化！响应时间 > 1s');

                // 提供优化建议
                if (report.contextToAttachDelay > 300) {
                    console.log('⚠️ 建议: LiveKit 连接或轨道订阅过慢');
                }
                if (report.attachToPlayDelay > 200) {
                    console.log('⚠️ 建议: 浏览器音频处理过慢，检查 playoutDelay 设置');
                }
            }
        }

        return report;
    }

    /**
     * 实时延迟监测工具
     */
    function startLatencyMonitoring() {
        // 监测后端音频开始信号
        const originalHandleChatMessage = state.room?.handleChatMessage;
        if (originalHandleChatMessage) {
            state.room.handleChatMessage = function (msg, participant) {
                if (msg.message === '<state><audio_start>') {
                    performanceMetrics.backendAudioStartTime = performance.now();
                    console.log(`📡 后端音频开始信号: ${performanceMetrics.backendAudioStartTime}`);
                }
                return originalHandleChatMessage.call(this, msg, participant);
            };
        }

        console.log('🔍 延迟监测已启动');
    }

    // 在首次音频播放后立即打印性能报告
    watch(
        () => performanceMetrics.firstAudioPlayTime,
        playTime => {
            if (playTime) {
                // 立即打印报告，不等待5秒
                setTimeout(() => {
                    printPerformanceReport();
                }, 100);
            }
        }
    );
    const stopRecording = async () => {
        // 🚀 优化：立即更新状态，避免 UI 延迟
        isCalling.value = false;
        showText.value = false;

        // 停止音量更新
        stopVolumeUpdates();

        // 然后再执行清理和登出操作
        const obj = {
            interface: 'stop'
        };
        sendAndLeave(JSON.stringify(obj));
        triggerCleanup();

        // 异步登出不阻塞UI更新
        await logoutRtc({
            token: token.value,
            userId: userId.value
        });
        localStorage.removeItem('rtcToken');
        localStorage.removeItem('userId');
    };
    const interruptChat = async () => {
        const obj = {
            interface: 'break'
        };
        sendText(JSON.stringify(obj), false);
    };
    const toggleMicrophone = () => {
        isMicrophoneOn.value = !isMicrophoneOn.value;
    };
    const errorMsg = ref('');
    let connectingTimeout;

    // 监听连接状态，自动重置UI状态（修复超时挂断后按钮消失问题）
    watch(
        () => state.connected,
        newConnected => {
            if (!newConnected && isCalling.value) {
                console.log('🔄 检测到连接断开，自动重置UI状态');
                isCalling.value = false;
                callLoading.value = false;
            }
        }
    );

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
            } else if (newStatus === 'init_failed') {
                // 模型初始化失败
                clearTimeout(connectingTimeout);
                ElMessage({
                    type: 'error',
                    message: t('modelInitFailedMsg'),
                    duration: 3000,
                    customClass: 'system-error'
                });
                // 自动挂断
                setTimeout(() => {
                    if (isCalling.value) {
                        stopRecording();
                    }
                }, 500);
            } else if (newStatus === 'robot_exit') {
                // 机器人退出
                clearTimeout(connectingTimeout);
                ElMessage({
                    type: 'warning',
                    message: t('peerLeftCall'),
                    duration: 3000,
                    customClass: 'system-error'
                });
                // 自动挂断
                setTimeout(() => {
                    if (isCalling.value) {
                        stopRecording();
                    }
                }, 500);
            } else if (newStatus !== null) {
                clearTimeout(connectingTimeout);
            }
        }
    );
    onUnmounted(() => {
        clearTimeout(connectingTimeout);
        // clearInterval(sendTimer); // 定时器已注释
    });
    defineExpose({
        stopRecording,
        printPerformanceReport,
        performanceMetrics,
        startLatencyMonitoring
    });
    const selectorDialog = ref();

    function openSelector() {
        selectorDialog.value.open();
    }

    function handleVoice(voice) {
        console.log('你选择了声音：', voice);
    }
</script>
<style lang="less" scoped>
    /* 平板布局容器 */
    .mobile-layout-container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        margin: 0;
    }

    /* 字幕遮罩层 */
    .subtitle-mask {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 1000;
    }

    /* 字幕面板（从底部弹出，覆盖在页面上） */
    .subtitle-panel-popup {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        height: 80vh;
        background: #ffffff;
        border-radius: 40px 40px 0 0;
        padding: 0 0 16px 0;
        padding-bottom: calc(16px + env(safe-area-inset-bottom)); /* iPhone 安全区域支持 */
        display: flex;
        flex-direction: column;
        overflow: hidden;
        // box-shadow: 0px -4px 20px 0px rgba(0, 0, 0, 0.15);
        z-index: 1001;

        .subtitle-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 16px 0px;
            // height: 44px;
            // margin-bottom: 12px;
            flex-shrink: 0;

            .header-spacer {
                width: 36px;
                flex-shrink: 0;
                order: 1;
            }

            span {
                color: #333;
                text-align: center;
                font-feature-settings:
                    'liga' off,
                    'clig' off;
                // font-family: 'PingFang SC';
                font-size: 17px;
                font-style: normal;
                font-weight: 600;
                line-height: 22px;
                letter-spacing: -0.43px;
                flex: 1;
                order: 2;
            }

            .close-btn-wrapper {
                width: 36px;
                height: 36px;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                flex-shrink: 0;
                order: 3;
                -webkit-tap-highlight-color: transparent;

                .close-btn {
                    border-radius: 50%;
                    background: #ffffff;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    width: 100%;
                    height: 100%;
                    transition: background 0.2s ease;

                    /* 移动端禁用 hover 效果，避免点击后样式残留 */
                    @media (hover: hover) and (pointer: fine) {
                        &:hover {
                            background: #f5f5f5;
                        }
                    }

                    .icon-close {
                        width: 18px;
                        height: 18px;
                        pointer-events: none;
                    }
                }
            }
        }

        .subtitle-content {
            flex: 1;
            overflow: auto;
            padding: 16px;
            word-break: break-word;
            -webkit-overflow-scrolling: touch;

            p {
                padding: 8px 16px;
                border-radius: 16px;
                background: #f3f5ff;
                margin-bottom: 8px;
                color: #595f6d;
                // font-family: 'SF Pro';
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: 20px;
                display: inline-block;
                word-wrap: break-word;
                word-break: break-word;
                overflow-wrap: break-word;
            }
        }
    }

    /* 从底部滑入动画 */
    .slide-up-enter-active,
    .slide-up-leave-active {
        transition: transform 0.3s ease-out;
    }

    .slide-up-enter-from,
    .slide-up-leave-to {
        transform: translateY(100%);
    }

    .slide-up-enter-to,
    .slide-up-leave-from {
        transform: translateY(0);
    }

    /* 遮罩淡入淡出动画 */
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.3s ease-out;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }

    .fade-enter-to,
    .fade-leave-from {
        opacity: 1;
    }

    .voice-page {
        flex: 1; /* 自动填充父容器 */
        min-height: 0; /* 允许 flex 收缩 */
        display: flex;
        flex-direction: column;
        padding: 0; /* 手机端全屏无内边距 */
        background: #f6f8ff; /* 手机端背景 */
        border-radius: 0; /* 手机端无圆角 */
        position: relative;
        overflow: hidden;

        &-content {
            flex: 1; /* 自动填充剩余空间 */
            min-height: 0; /* 允许收缩 */
            display: flex;
            // align-items: flex-end;
            justify-content: center;
            overflow: hidden;
            position: relative;

            .gif-container {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                display: flex;
                justify-content: center;
                align-items: center;
            }
        }
        /* 开始通话按钮（未通话时，需要避开底部切换栏）*/
        &-footer-start {
            position: absolute;
            bottom: 140px; /* 避开底部切换栏：62px(按钮)+20px(间距)+34px(安全区域)+24px(缓冲)=140px */
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: center;

            .btn-start-box {
                position: relative;
                -webkit-tap-highlight-color: transparent;

                .start-icon {
                    width: 72px;
                    height: 72px;
                    display: block;
                    cursor: pointer;
                }

                .footer-tips {
                    position: absolute;
                    bottom: -16px;
                    left: 50%;
                    transform: translateX(-50%);
                    text-align: center;
                    color: #6893fb;
                    font-size: 12px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: 1;
                    user-select: none;
                    white-space: nowrap;
                }
            }
        }

        /* 通话中按钮组（底部切换栏已隐藏，距离底部16px）*/
        &-footer-calling {
            position: absolute;
            bottom: calc(20px + env(safe-area-inset-bottom)); /* iPhone 安全区域支持 */
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;

            .calling-buttons {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding: 0 16px;
                width: 100%;

                .btn-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    cursor: pointer;
                    -webkit-tap-highlight-color: transparent;

                    /* 禁用状态 */
                    &.disabled {
                        cursor: not-allowed;
                        opacity: 0.5;
                        pointer-events: none;
                    }

                    .btn-circle {
                        width: 70px;
                        height: 70px;
                        border-radius: 50%;
                        background: #eef0fe;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        transition: all 0.3s ease;

                        /* 麦克风关闭状态 - 红色背景 */
                        &.mic-off {
                            // background: rgba(235, 87, 87, 0.15);
                            background: #e4e8f4;

                            .btn-icon {
                                color: #eb5757;
                            }
                        }

                        .btn-icon {
                            width: 34px;
                            height: 34px;
                            color: #365a98;

                            &.btn-icon-end {
                                width: 70px;
                                height: 70px;
                            }
                        }

                        .interrupt-icon,
                        .microphone-on,
                        .microphone-off {
                            width: 34px;
                            height: 34px;
                        }
                        .microphone-on,
                        .interrupt-icon {
                            color: #365a98;
                        }
                        .microphone-off {
                            color: #eb5757;
                        }
                    }

                    .btn-label {
                        margin-top: 6px;
                        color: #595f6d;
                        // font-family: 'PingFang SC';
                        font-size: 12px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: 1;
                        text-align: center;
                        white-space: nowrap;
                    }

                    /* 移动端禁用 hover 效果，避免点击后样式残留 */
                    @media (hover: hover) and (pointer: fine) {
                        &:hover:not(.disabled) .btn-circle {
                            background: #dde5fe;
                            transform: scale(1.05);
                        }

                        &:hover:not(.disabled) .btn-circle.mic-off {
                            background: rgba(235, 87, 87, 0.25);
                        }
                    }

                    /* 点击效果 - 所有设备都保留 */
                    &:active:not(.disabled) .btn-circle {
                        transform: scale(0.95);
                    }
                }
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
