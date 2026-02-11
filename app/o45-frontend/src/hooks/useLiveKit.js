import {
    Room,
    RoomEvent,
    createLocalAudioTrack,
    createLocalVideoTrack,
    DataPacket_Kind,
    VideoPresets,
    ScreenSharePresets,
    BackupCodecPolicy,
    LogLevel,
    setLogLevel,
    ParticipantEvent
} from 'livekit-client';
import { reactive } from 'vue';
import { ElMessage } from 'element-plus';
import timeSync from '@/utils/timeSync';
import en from '@/i18n/en.json';
import zh from '@/i18n/zh.json';

// 设置日志级别为 debug
setLogLevel(LogLevel.debug);

// 使用同步后的时间格式化时间戳
const formatSyncedTimestamp = () => {
    return timeSync.formatSyncedTime('YYYY-MM-DD HH:mm:ss.SSS');
};

const getI18nMessage = key => {
    const language = localStorage.getItem('language') || 'zh';
    const messages = language.startsWith('en') ? en : zh;
    return messages[key] || zh[key] || en[key] || '';
};

// 算法要求：视频流最小尺寸不能小于 448x448
const MIN_VIDEO_DIMENSION = 448;

// 🔧 视频初始化配置（防止黑屏）
const VIDEO_INIT_CONFIG = {
    // 视频就绪检测超时时间（毫秒）
    readyTimeout: {
        default: 5000, // 普通设备：5 秒（增加等待时间）
        iPad: 8000 // iPad：8 秒（摄像头初始化较慢）
    },
    // 发布后缓冲延迟（毫秒）- 跳过初始黑屏帧
    postPublishDelay: {
        default: 1500, // 普通设备：1.5秒（增加以跳过更多初始黑帧）
        iPad: 2000 // iPad：2 秒
    },
    // 画面亮度检测阈值（0-255）
    brightnessThreshold: 15,
    // 黑屏检测间隔（毫秒）
    blackScreenCheckInterval: 100,
    // 是否发送视频就绪信号给后端
    sendReadySignal: true,
    // 🔥 新增：后端建议等待时间（毫秒）- 用于 video_stream_ready 信号
    backendStartDelay: {
        default: 2000, // 建议后端额外等待 2 秒再开始采样
        iPad: 3000 // iPad 建议等待 3 秒
    }
};

// 视频分辨率配置（确保满足算法要求）
const VIDEO_RESOLUTION_CONFIG = {
    // 高质量：1280x720 (算法要求，所有场景统一使用)
    high: VideoPresets.h720.resolution, // { width: 1280, height: 720 }

    // 标准质量：960x540 (备用配置) - 推荐低配置设备使用
    standard: VideoPresets.h540.resolution, // { width: 960, height: 540 }

    // 最低质量：640x480 (4:3比例，满足最低要求)
    minimum: { width: 640, height: 480 },

    // 正方形：640x640 (如果算法需要正方形输入)
    square: { width: 640, height: 640 },

    // 🔧 新增：低配置模式（针对低配置 Windows 设备优化）
    lowPerformance: { width: 640, height: 480 } // 480p，15fps，降低资源占用
};

// 🔧 新增：性能监测数据
let performanceMonitor = {
    frameDropCount: 0, // 丢帧次数
    lastCheckTime: 0, // 上次检查时间
    degradeCount: 0, // 降级次数
    currentLevel: null, // 当前性能等级
    staticLevel: null, // 静态硬件等级
    isDegraded: false // 是否已降级
};

/**
 * 获取视频分辨率配置
 * 根据用户的高清模式设置返回对应的分辨率
 * @returns {Object} 分辨率对象 {width, height}
 */
function getVideoResolution() {
    // 从 localStorage 获取高清模式配置
    const hdMode = localStorage.getItem('hdMode') === 'true';

    if (hdMode) {
        // 高清模式：使用 720p 高质量采集
        console.log('📹 视频采集模式: 高清模式 (720p)');
        return VIDEO_RESOLUTION_CONFIG.high; // 1280x720
    } else {
        // 标准模式：使用 540p 标准质量采集
        console.log('📹 视频采集模式: 标准模式 (540p)');
        return VIDEO_RESOLUTION_CONFIG.standard; // 960x540
    }
}

/**
 * 检测设备性能等级（静态硬件检测）
 * @returns {'high' | 'standard' | 'low'} 性能等级
 */
function detectDevicePerformance() {
    // 🔧 优先检查手动设置
    const manualLevel = localStorage.getItem('forcePerformanceLevel');
    if (manualLevel && ['low', 'standard', 'high'].includes(manualLevel)) {
        console.log('🎯 使用手动设置的性能等级:', manualLevel);
        performanceMonitor.staticLevel = manualLevel;
        performanceMonitor.currentLevel = manualLevel;
        return manualLevel;
    }

    const ua = navigator.userAgent.toLowerCase();
    const isWindows = ua.includes('windows');

    // 获取 CPU 核心数
    const cores = navigator.hardwareConcurrency || 2;

    // 获取内存信息（如果支持）
    const memory = navigator.deviceMemory || 4; // GB

    let level;

    // 检测是否为低配置设备
    if (isWindows && (cores <= 2 || memory <= 4)) {
        console.log('🔍 检测到低配置 Windows 设备:', { cores, memory: memory + 'GB' });
        level = 'low';
    } else if (cores <= 4 || memory <= 8) {
        console.log('🔍 检测到中等配置设备:', { cores, memory: memory + 'GB' });
        level = 'standard';
    } else {
        console.log('🔍 检测到高配置设备:', { cores, memory: memory + 'GB' });
        level = 'high';
    }

    performanceMonitor.staticLevel = level;
    performanceMonitor.currentLevel = level;

    return level;
}

/**
 * 🔧 动态性能监测：根据实际运行情况调整性能等级
 * 检测帧率、丢帧情况，如果性能不佳则自动降级
 */
function monitorRuntimePerformance(videoTrack) {
    if (!videoTrack || !videoTrack.mediaStreamTrack) {
        return;
    }

    try {
        const stats = videoTrack.mediaStreamTrack.getSettings();
        const currentTime = performance.now();

        // 每 10 秒检查一次
        if (currentTime - performanceMonitor.lastCheckTime < 10000) {
            return;
        }

        performanceMonitor.lastCheckTime = currentTime;

        // 检查实际帧率
        const actualFrameRate = stats.frameRate || 0;
        const expectedFrameRate =
            performanceMonitor.currentLevel === 'high' ? 30 : performanceMonitor.currentLevel === 'standard' ? 20 : 15;

        // 如果实际帧率远低于预期（低于 70%），认为性能不佳
        const performanceRatio = actualFrameRate / expectedFrameRate;

        console.log('📊 性能监测:', {
            当前等级: performanceMonitor.currentLevel,
            静态等级: performanceMonitor.staticLevel,
            预期帧率: expectedFrameRate,
            实际帧率: actualFrameRate.toFixed(1),
            性能比率: (performanceRatio * 100).toFixed(0) + '%',
            是否已降级: performanceMonitor.isDegraded
        });

        // 性能不佳，考虑降级
        if (performanceRatio < 0.7 && !performanceMonitor.isDegraded) {
            performanceMonitor.frameDropCount++;

            // 连续 3 次检测到性能不佳，触发降级
            if (performanceMonitor.frameDropCount >= 3) {
                console.warn('⚠️ 检测到性能不佳，建议降级');
                suggestPerformanceDowngrade();
            }
        } else if (performanceRatio >= 0.9) {
            // 性能恢复正常，重置计数
            performanceMonitor.frameDropCount = 0;
        }
    } catch (error) {
        console.warn('性能监测失败:', error);
    }
}

/**
 * 🔧 建议性能降级（提示用户）
 * ⚠️ 已禁用：防止视频采集中间出现黑屏
 */
function suggestPerformanceDowngrade() {
    // 🔥 禁用性能降级：采集开始后的性能降级可能导致视频流中断，出现黑帧
    console.log('⚠️ 性能降级已被禁用（防止视频中间出现黑屏）');
    return;

    // 以下代码已禁用
    /* 
    if (performanceMonitor.isDegraded) {
        return; // 已经降级过了
    }

    const currentLevel = performanceMonitor.currentLevel;
    let suggestedLevel = currentLevel;

    if (currentLevel === 'high') {
        suggestedLevel = 'standard';
    } else if (currentLevel === 'standard') {
        suggestedLevel = 'low';
    }

    if (suggestedLevel !== currentLevel) {
        console.warn('💡 性能建议: 当前设备实际性能不佳，建议从', currentLevel, '降级到', suggestedLevel);

        // 提示用户（可选：自动降级或询问用户）
        const autoDowngrade = localStorage.getItem('autoPerformanceDowngrade') === 'true';

        if (autoDowngrade) {
            // 自动降级
            console.log('🔄 自动降级到:', suggestedLevel);
            performanceMonitor.currentLevel = suggestedLevel;
            performanceMonitor.isDegraded = true;
            performanceMonitor.degradeCount++;

            // 触发 ElMessage 提示（需要在 Vue 组件中调用）
            if (typeof ElMessage !== 'undefined') {
                ElMessage({
                    type: 'info',
                    message: `检测到设备运行卡顿，已自动降低画质以提升流畅度`,
                    duration: 5000
                });
            }
        } else {
            // 提示用户手动调整
            console.log('💡 建议: 在控制台运行以下命令手动降级:');
            console.log(`localStorage.setItem('forcePerformanceLevel', '${suggestedLevel}'); location.reload();`);
        }
    }
    */
}

/**
 * 🔧 获取当前有效的性能等级（考虑动态降级）
 */
function getCurrentPerformanceLevel() {
    return performanceMonitor.currentLevel || detectDevicePerformance();
}

/**
 * 全局 reactive 状态
 * - room: LiveKit Room 实例
 * - connected: 是否已连接
 * - error: 如果 joinRoom 报错，会写在这里
 * - localTracks: Array<LocalTrack>，包含音频轨和（可选）视频轨
 * - remoteTracks: { [participantSid]: Track[] }，包含远端所有轨道
 * - localAudioActive: boolean，本地是否在说话
 * - remoteAudioActive: { [participantSid]: boolean }，远端谁在说话
 * - videoFacing: 'user' | 'environment'
 * - audioEnabled: 本地麦克风是否开启
 * - videoEnabled: 本地摄像头是否开启
 * - messages: Array<{ from, payload }>，收发的 DataChannel 文本消息
 */
// 🔧 根据设备类型确定默认摄像头方向
// - 移动设备（手机/iPad）：默认后置摄像头（environment）
// - PC/桌面设备：默认前置摄像头（user）
const getDefaultFacingMode = () => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isIPadDevice = /iPad|Macintosh/i.test(navigator.userAgent) && 'ontouchend' in document;

    if (isMobileDevice || isIPadDevice) {
        console.log('📱 检测到移动设备，默认使用后置摄像头');
        return 'environment';
    } else {
        console.log('💻 检测到PC设备，默认使用前置摄像头');
        return 'user';
    }
};

const state = reactive({
    room: null,
    connected: false,
    error: null,
    localTracks: [],
    remoteTracks: {},
    // 新增：本地是否在说话
    localAudioActive: false,
    // 新增：每个远端参与者的说话状态
    remoteAudioActive: {},
    videoFacing: getDefaultFacingMode(), // 根据设备类型自动选择摄像头方向
    audioEnabled: true,
    videoEnabled: true,
    messages: [],
    chatMessages: [],
    messageIndex: -1, // 用于标记消息序号
    status: '',
    generateEnd: false, // 用于标记生成结束状态
    firstInit: true, // 标记是否是首次收到初始化信号
    modelInitialized: false, // 标记模型是否初始化成功
    initConfig: null, // 存储初始化配置
    muteRemoteAudio: false, // 标记是否静音远端音频（打断后生效）
    mode: 'audio', // 当前通话模式：'audio' 或 'video'
    // 新增：按轮记录音频关键时间点
    // audioRounds[roundIndex] = {
    //   round: number,
    //   generateStartAt?: number,
    //   audioStartSignalAt?: number,
    //   firstPacketAt?: number,   // 前端检测到远端开始"说话"的首包时间
    //   firstPlayAt?: number,     // <audio> 首次真正开始播放时间
    //   participantSid?: string,
    //   deltas?: { fromGenerateStart?: number, fromAudioStartSignal?: number }
    // }
    audioRounds: [],
    pendingRoundIndex: -1,
    playEndSent: false, // 标记是否已发送 play_end（用于防止延迟音频包干扰）
    playEndTimestamp: 0, // 记录发送 play_end 的时间戳
    currentRoundHasAudio: false, // 标记当前轮次是否有音频（用于检测空轮次）
    generateEndTimestamp: 0 // 🔧 记录 generate_end 的接收时间（用于静默检查保护）
});

let timer = null;
let noRobotTimer = null; // 用于检测是否有机器人加入的定时器

// 🔧 新增：视频健康监控定时器
let videoHealthCheckTimer = null;
let videoRecoveryAttempts = 0; // 视频恢复尝试次数
const MAX_VIDEO_RECOVERY_ATTEMPTS = 3; // 最大恢复尝试次数
const VIDEO_HEALTH_CHECK_INTERVAL = 5000; // 每 5 秒检查一次视频健康状态

// 🔧 新增：内存管理配置
const MAX_AUDIO_ROUNDS = 20; // 最多保留 20 轮音频数据
const MAX_CHAT_MESSAGES = 50; // 最多保留 50 条聊天消息
const MEMORY_CHECK_INTERVAL = 30000; // 每 30 秒检查一次内存
const MEMORY_THRESHOLD_MB = 200; // 内存超过 200MB 触发清理
let memoryCheckTimer = null;

// 静默超时配置（根据模式动态调整）
const SILENCE_CONFIG = {
    audio: {
        timeout: 800, // 🔧 音频模式：500ms → 800ms（容忍多段音频间隔和网络延迟）
        safetyDelay: 300, // 🔧 安全延迟：200ms → 300ms（增加保护时间）
        generateEndBuffer: 1000, // 🔧 generate_end 缓冲：600ms → 1000ms（关键：实际测试显示延迟可达 782ms）
        minAudioDuration: 600 // 🔧 新增：短音频最小保护时间 600ms（两个字音频约 400-500ms）
    },
    video: {
        timeout: 1500, // 🔧 视频模式：1200ms → 1500ms（视频模式网络开销更大）
        safetyDelay: 500, // 🔧 安全延迟：400ms → 500ms（增加保护时间）
        generateEndBuffer: 1200, // 🔧 generate_end 缓冲：800ms → 1200ms（视频模式网络延迟更大）
        minAudioDuration: 800 // 🔧 新增：短音频最小保护时间 800ms
    }
};

// 获取当前模式的配置
const getSilenceConfig = () => SILENCE_CONFIG[state.mode] || SILENCE_CONFIG.audio;

const silenceTimers = new Map();
// 🔥 新增：音频结束确认计数器（防止误判）
const audioEndConfirmCount = new Map(); // { participantSid: confirmCount }

let onCleanup = null;
let onTrackSubscribed = null;
let localVideoElement = null;

export function registerCleanup(fn) {
    onCleanup = fn;
}

// 新增：注册轨道订阅回调，用于立即attach
export function registerTrackSubscribed(fn) {
    onTrackSubscribed = fn;
}

// 注册本地 video 元素，用于切换摄像头时强制刷新画面
export function registerLocalVideoElement(el) {
    localVideoElement = el || null;
}

// 触发已注册的清理回调（不要用 registerCleanup() 误触发覆盖）
export function triggerCleanup(sids = []) {
    if (onCleanup) {
        try {
            onCleanup(sids);
        } catch {}
    }
    // 🔧 清理视频健康监控定时器
    stopVideoHealthMonitoring();
}

/**
 * 🔧 启动视频健康监控
 * 定期检查视频轨道是否正常，如果发现问题则尝试自动恢复
 */
function startVideoHealthMonitoring() {
    if (videoHealthCheckTimer) {
        console.log('⚠️ 视频健康监控已在运行');
        return;
    }

    console.log('🏥 启动视频健康监控，每 5 秒检查一次');
    videoRecoveryAttempts = 0;

    videoHealthCheckTimer = setInterval(() => {
        checkVideoHealth();
    }, VIDEO_HEALTH_CHECK_INTERVAL);
}

/**
 * 🔧 停止视频健康监控
 */
function stopVideoHealthMonitoring() {
    if (videoHealthCheckTimer) {
        clearInterval(videoHealthCheckTimer);
        videoHealthCheckTimer = null;
        videoRecoveryAttempts = 0;
        console.log('🏥 视频健康监控已停止');
    }
}

/**
 * 🔧 检查视频健康状态
 */
async function checkVideoHealth() {
    try {
        // 只在视频模式且已连接时检查
        if (state.mode !== 'video' || !state.connected || !state.room) {
            return;
        }

        const videoTrack = state.localTracks.find(t => t.kind === 'video');
        if (!videoTrack || !videoTrack.mediaStreamTrack) {
            console.warn('⚠️ 未找到视频轨道或 MediaStreamTrack');
            return;
        }

        const mediaTrack = videoTrack.mediaStreamTrack;
        const readyState = mediaTrack.readyState;
        const enabled = mediaTrack.enabled;

        // 🔧 禁用：动态性能监测（防止中间出现黑屏）
        // 性能降级可能会导致视频流中断，出现黑帧
        // monitorRuntimePerformance(videoTrack);

        // 检查视频轨道状态
        if (readyState === 'ended' || !enabled) {
            console.error('❌ 视频轨道异常:', { readyState, enabled });

            // 尝试自动恢复
            if (videoRecoveryAttempts < MAX_VIDEO_RECOVERY_ATTEMPTS) {
                videoRecoveryAttempts++;
                console.log(`🔄 尝试自动恢复视频轨道 (第 ${videoRecoveryAttempts}/${MAX_VIDEO_RECOVERY_ATTEMPTS} 次)`);
                await recoverVideoTrack();
            } else {
                console.error('❌ 视频恢复失败，已达到最大尝试次数');
                stopVideoHealthMonitoring();
            }
        } else {
            // 视频正常，重置恢复计数器
            if (videoRecoveryAttempts > 0) {
                console.log('✅ 视频轨道已恢复正常，重置恢复计数器');
                videoRecoveryAttempts = 0;
            }
        }

        // 检查 video 元素是否正常渲染
        if (localVideoElement) {
            const videoWidth = localVideoElement.videoWidth;
            const videoHeight = localVideoElement.videoHeight;

            if (videoWidth === 0 || videoHeight === 0) {
                console.warn('⚠️ Video 元素未渲染内容:', { videoWidth, videoHeight });
            }
        }
    } catch (error) {
        console.error('❌ 视频健康检查出错:', error);
    }
}

/**
 * 🔧 恢复视频轨道
 */
async function recoverVideoTrack() {
    try {
        console.log('🔄 开始恢复视频轨道...');

        const currentVideoTrack = state.localTracks.find(t => t.kind === 'video');
        if (!currentVideoTrack) {
            console.error('❌ 未找到当前视频轨道');
            return;
        }

        // 获取当前配置
        const performanceLevel = detectDevicePerformance();
        let resolution, targetFrameRate, maxFrameRate;

        switch (performanceLevel) {
            case 'low':
                resolution = VIDEO_RESOLUTION_CONFIG.lowPerformance;
                targetFrameRate = 15;
                maxFrameRate = 20;
                break;
            case 'standard':
                resolution = VIDEO_RESOLUTION_CONFIG.standard;
                targetFrameRate = 20;
                maxFrameRate = 24;
                break;
            case 'high':
            default:
                resolution = VIDEO_RESOLUTION_CONFIG.high;
                targetFrameRate = 30;
                maxFrameRate = 30;
                break;
        }

        // 尝试使用 restartTrack（如果支持）
        if (typeof currentVideoTrack.restartTrack === 'function') {
            console.log('🔄 使用 restartTrack 恢复视频轨道');
            await currentVideoTrack.restartTrack({
                width: { ideal: resolution.width, min: MIN_VIDEO_DIMENSION },
                height: { ideal: resolution.height, min: MIN_VIDEO_DIMENSION },
                aspectRatio: { ideal: 16 / 9 },
                frameRate: { ideal: targetFrameRate, max: maxFrameRate },
                facingMode: { ideal: state.videoFacing }
            });
            console.log('✅ 视频轨道恢复成功 (restartTrack)');
        } else {
            // 降级方案：重新创建轨道
            console.log('🔄 降级使用重新创建轨道方案');
            const newTrack = await createLocalVideoTrack({
                facingMode: { ideal: state.videoFacing },
                width: { ideal: resolution.width, min: MIN_VIDEO_DIMENSION },
                height: { ideal: resolution.height, min: MIN_VIDEO_DIMENSION },
                aspectRatio: { ideal: 16 / 9 },
                frameRate: { ideal: targetFrameRate, max: maxFrameRate }
            });

            // 替换旧轨道
            await state.room.localParticipant.unpublishTrack(currentVideoTrack);
            currentVideoTrack.stop();

            // 🔥🔥🔥 新方案：根据模型状态决定是否立即发布
            // - 如果模型已初始化：立即发布新轨道
            // - 如果模型未初始化：只创建不发布，等待 model_init_success 信号
            if (state.modelInitialized) {
                // 模型已初始化，立即发布新轨道
                const encodingConfig =
                    performanceLevel === 'low'
                        ? { maxBitrate: 1000000, maxFramerate: 20, minBitrate: 300000 }
                        : performanceLevel === 'standard'
                          ? { maxBitrate: 1500000, maxFramerate: 24, minBitrate: 500000 }
                          : { maxBitrate: 2500000, maxFramerate: 30, minBitrate: 800000 };

                // 🔥 关键修复：发布视频前确保video元素已就绪
                if (localVideoElement) {
                    const currentReadyState = localVideoElement.readyState;
                    console.log(`📹 [恢复视频-发布前检查] video元素readyState: ${currentReadyState}`);

                    if (currentReadyState < 2) {
                        console.warn(`⚠️ video元素未就绪(readyState=${currentReadyState})，等待加载...`);

                        // 等待video元素就绪，最多等待3秒
                        await new Promise(resolve => {
                            const startTime = Date.now();
                            const checkReady = () => {
                                if (localVideoElement.readyState >= 2) {
                                    console.log(
                                        `✅ video元素已就绪(readyState=${localVideoElement.readyState})，继续发布`
                                    );
                                    resolve();
                                } else if (Date.now() - startTime > 3000) {
                                    console.warn(
                                        `⚠️ video元素等待超时(readyState=${localVideoElement.readyState})，强制继续发布`
                                    );
                                    resolve();
                                } else {
                                    setTimeout(checkReady, 100);
                                }
                            };
                            checkReady();
                        });
                    } else {
                        console.log(`✅ video元素已就绪(readyState=${currentReadyState})，可以发布`);
                    }
                }

                await state.room.localParticipant.publishTrack(newTrack, {
                    videoEncoding: encodingConfig,
                    degradationPreference: 'maintain-resolution'
                });
                console.log(
                    `%c✅ [切换摄像头-新方案] 模型已初始化，新轨道已发布并发送`,
                    'color: #00ff00; font-weight: bold; font-size: 13px; background: #003300; padding: 2px 6px;'
                );
            } else {
                // 模型未初始化，只创建不发布
                console.log(
                    `%c⏳ [切换摄像头-新方案] 模型未初始化，新轨道已创建但不发布（等待 model_init_success）`,
                    'color: #ffaa00; font-weight: bold; font-size: 13px; background: #332200; padding: 2px 6px;'
                );
            }

            // 更新 state
            const index = state.localTracks.findIndex(t => t.kind === 'video');
            if (index !== -1) {
                state.localTracks[index] = newTrack;
            }

            // 重新绑定到 video 元素
            if (localVideoElement) {
                newTrack.attach(localVideoElement);
            }

            console.log('✅ 视频轨道恢复成功 (重新创建)');
        }
    } catch (error) {
        console.error('❌ 视频轨道恢复失败:', error);
    }
}

/**
 * 🔧 内存监控：定期检查内存使用情况
 */
function startMemoryMonitoring() {
    // 检查浏览器是否支持 memory API（仅 Chrome/Edge 支持）
    if (!performance.memory) {
        console.warn('⚠️ 浏览器不支持 performance.memory API，无法进行内存监控');
        return;
    }

    if (memoryCheckTimer) {
        console.log('⚠️ 内存监控已在运行');
        return;
    }

    console.log('💾 启动内存监控，每 30 秒检查一次');

    memoryCheckTimer = setInterval(() => {
        checkMemoryUsage();
    }, MEMORY_CHECK_INTERVAL);
}

/**
 * 🔧 停止内存监控
 */
function stopMemoryMonitoring() {
    if (memoryCheckTimer) {
        clearInterval(memoryCheckTimer);
        memoryCheckTimer = null;
        console.log('💾 内存监控已停止');
    }
}

/**
 * 🔧 检查内存使用情况
 */
function checkMemoryUsage() {
    if (!performance.memory) {
        return;
    }

    try {
        const usedMemoryMB = performance.memory.usedJSHeapSize / 1048576;
        const totalMemoryMB = performance.memory.totalJSHeapSize / 1048576;
        const limitMemoryMB = performance.memory.jsHeapSizeLimit / 1048576;
        const usagePercent = (usedMemoryMB / totalMemoryMB) * 100;

        console.log('💾 内存使用情况:', {
            已使用: usedMemoryMB.toFixed(2) + ' MB',
            总容量: totalMemoryMB.toFixed(2) + ' MB',
            上限: limitMemoryMB.toFixed(2) + ' MB',
            使用率: usagePercent.toFixed(1) + '%',
            数据统计: {
                audioRounds: state.audioRounds.length,
                chatMessages: state.chatMessages.length,
                messages: state.messages.length
            }
        });

        // 超过阈值或使用率 > 80%，触发清理
        if (usedMemoryMB > MEMORY_THRESHOLD_MB || usagePercent > 80) {
            console.warn('⚠️ 内存占用过高，触发自动清理', {
                内存: usedMemoryMB.toFixed(2) + ' MB',
                使用率: usagePercent.toFixed(1) + '%'
            });
            cleanupOldData();
        }
    } catch (error) {
        console.error('❌ 内存检查出错:', error);
    }
}

/**
 * 🔧 清理旧数据：限制数组长度，释放内存
 */
function cleanupOldData() {
    let cleanedCount = 0;

    // 1. 清理 audioRounds（只保留最近 20 轮）
    if (state.audioRounds.length > MAX_AUDIO_ROUNDS) {
        const removed = state.audioRounds.splice(0, state.audioRounds.length - MAX_AUDIO_ROUNDS);
        cleanedCount += removed.length;
        console.log(`🧹 清理旧的音频轮次: ${removed.length} 条，剩余: ${state.audioRounds.length}`);
    }

    // 2. 清理 chatMessages（只保留最近 50 条）
    if (state.chatMessages.length > MAX_CHAT_MESSAGES) {
        const removed = state.chatMessages.splice(0, state.chatMessages.length - MAX_CHAT_MESSAGES);
        cleanedCount += removed.length;
        console.log(`🧹 清理旧的聊天消息: ${removed.length} 条，剩余: ${state.chatMessages.length}`);
    }

    // 3. 清理 messages（只保留最近 50 条）
    if (state.messages.length > MAX_CHAT_MESSAGES) {
        const removed = state.messages.splice(0, state.messages.length - MAX_CHAT_MESSAGES);
        cleanedCount += removed.length;
        console.log(`🧹 清理旧的 messages: ${removed.length} 条，剩余: ${state.messages.length}`);
    }

    if (cleanedCount > 0) {
        console.log(`✅ 内存清理完成，共清理 ${cleanedCount} 条数据`);

        // 建议浏览器进行垃圾回收（仅开发环境有效）
        if (window.gc && typeof window.gc === 'function') {
            window.gc();
            console.log('🗑️ 已触发垃圾回收（开发环境）');
        }
    }
}

/**
 * 🔧 会话结束时彻底清理所有数据
 */
function cleanupOnSessionEnd() {
    console.log('🧹 会话结束，开始彻底清理所有数据...');

    // 清理所有累积数据
    state.audioRounds = [];
    state.chatMessages = [];
    state.messages = [];
    state.messageIndex = -1;
    state.pendingRoundIndex = -1;

    // 重置状态
    state.playEndSent = false;
    state.playEndTimestamp = 0;
    state.currentRoundHasAudio = false;
    state.generateEnd = false;
    state.generateEndTimestamp = 0; // 🔧 重置 generate_end 时间戳
    state.firstInit = true;

    console.log('✅ 所有数据已清理', {
        audioRounds: state.audioRounds.length,
        chatMessages: state.chatMessages.length,
        messages: state.messages.length
    });
}

// 测试辅助函数：手动触发无机器人超时（用于前端测试）
export function triggerNoRobotTimeout(force = false) {
    console.log('🧪 测试：triggerNoRobotTimeout 被调用', {
        hasTimer: !!noRobotTimer,
        force
    });

    if (noRobotTimer) {
        console.log('🧪 测试：发现活跃的定时器，清除并触发超时');
        clearTimeout(noRobotTimer);
        noRobotTimer = null;
        alert(getI18nMessage('connectionTimeoutEndingCall'));
        return true;
    } else if (force) {
        console.log('🧪 测试：强制模式，即使没有定时器也触发超时');
        alert(getI18nMessage('connectionTimeoutEndingCall'));
        return true;
    } else {
        console.warn('🧪 测试失败：没有活跃的无机器人检测定时器');
        console.warn('🧪 提示：请先开始通话，或使用强制模式: triggerNoRobotTimeout(true)');
        return false;
    }
}

// 测试辅助函数：获取当前定时器状态
export function getNoRobotTimerStatus() {
    const status = {
        hasActiveTimer: !!noRobotTimer,
        timerExists: noRobotTimer !== null,
        timestamp: new Date().toISOString()
    };
    console.log('🧪 定时器状态:', status);
    return status;
}

// 测试辅助函数：获取 play_end 防护状态
export function getPlayEndGuardStatus() {
    const status = {
        playEndSent: state.playEndSent,
        playEndTimestamp: state.playEndTimestamp,
        timeSincePlayEnd: state.playEndSent ? (performance.now() - state.playEndTimestamp).toFixed(0) + 'ms' : 'N/A',
        currentStatus: state.status,
        generateEnd: state.generateEnd,
        currentRoundHasAudio: state.currentRoundHasAudio,
        remoteAudioActive: state.remoteAudioActive
    };
    console.log('🛡️ play_end 防护状态:', status);
    return status;
}

// 测试辅助函数：获取当前轮次状态（用于调试空轮次问题）
export function getCurrentRoundStatus() {
    const status = {
        currentStatus: state.status,
        generateEnd: state.generateEnd,
        currentRoundHasAudio: state.currentRoundHasAudio,
        playEndSent: state.playEndSent,
        remoteAudioActive: state.remoteAudioActive,
        audioRoundsCount: state.audioRounds.length,
        lastRound: state.audioRounds[state.audioRounds.length - 1] || null
    };
    console.log('🔍 当前轮次状态:', status);
    return status;
}

// 测试辅助函数：测试消息发送（用于调试前后端通信）
export function testSendMessage(message = '测试消息') {
    console.log('🧪 [测试] 开始测试消息发送...');

    // 1. 检查连接状态
    const connectionStatus = {
        hasRoom: !!state.room,
        connected: state.connected,
        roomState: state.room?.state,
        localParticipantId: state.room?.localParticipant?.identity,
        localParticipantSid: state.room?.localParticipant?.sid,
        remoteParticipantsCount: state.room?.remoteParticipants?.size || 0
    };

    console.log('🧪 [测试] 1️⃣ 连接状态检查:', connectionStatus);

    if (!state.room || !state.connected) {
        console.error('❌ [测试失败] 房间未连接，请先调用 joinRoom()');
        return false;
    }

    // 2. 获取远端参与者信息
    const remoteParticipants = Array.from(state.room.remoteParticipants.values());
    console.log(
        '🧪 [测试] 远端参与者:',
        remoteParticipants.map(p => ({
            identity: p.identity,
            sid: p.sid,
            isSpeaking: p.isSpeaking
        }))
    );

    // 3. 同时测试两种发送方式
    const testMessage = `[测试消息 ${new Date().toLocaleTimeString()}] ${message}`;
    const results = {
        publishData: { success: false, error: null },
        sendText: { success: false, error: null }
    };

    // 测试 publishData
    try {
        const payload = new TextEncoder().encode(testMessage);

        console.log('🧪 [测试] 2️⃣-A 发送 publishData:', {
            消息内容: testMessage,
            payload大小: payload.length + ' bytes',
            发送方式: 'publishData ({ reliable: true })'
        });

        state.room.localParticipant.publishData(payload, {
            reliable: true,
            topic: 'lk.chat'
        });

        results.publishData.success = true;
        console.log('✅ [publishData] 已发送');
    } catch (error) {
        results.publishData.error = error.message;
        console.error('❌ [publishData] 发送失败:', error);
    }

    // 测试 sendText
    // try {
    //     console.log('🧪 [测试] 2️⃣-B 发送 sendText:', {
    //         消息内容: testMessage,
    //         发送方式: 'sendText ({ topic: "lk.chat" })'
    //     });

    //     state.room.localParticipant.sendText(testMessage, { topic: 'lk.chat' });

    //     results.sendText.success = true;
    //     console.log('✅ [sendText] 已发送');
    // } catch (error) {
    //     results.sendText.error = error.message;
    //     console.error('❌ [sendText] 发送失败:', error);
    // }

    console.log('🧪 [测试] 3️⃣ 发送结果:', results);
    console.log('🧪 [测试] 4️⃣ 请检查后端日志，看收到哪种方式的消息');
    console.log(`🧪 [测试] 期待收到内容: ${testMessage}`);

    return results;
}

// 测试辅助函数：对比两种发送方式（用于调试兼容性）
export function testBothSendMethods(message = '双模式测试') {
    console.log('🧪 [双模式测试] 开始对比 publishData 和 sendText...');

    if (!state.room || !state.connected) {
        console.error('❌ [测试失败] 房间未连接');
        return { success: false, error: '房间未连接' };
    }

    const results = {
        publishData: { success: false, error: null },
        sendText: { success: false, error: null }
    };

    // 测试 publishData
    try {
        const msg1 = `[publishData] ${message} ${Date.now()}`;
        const payload = new TextEncoder().encode(msg1);
        state.room.localParticipant.publishData(payload, {
            reliable: true,
            topic: 'lk.chat'
        });
        results.publishData.success = true;
        console.log('✅ [publishData] 发送成功:', msg1);
    } catch (error) {
        results.publishData.error = error.message;
        console.error('❌ [publishData] 发送失败:', error);
    }

    // 测试 sendText（如果后端还支持）
    // try {
    //     const msg2 = `[sendText] ${message} ${Date.now()}`;
    //     state.room.localParticipant.sendText(msg2, { topic: 'lk.chat' });
    //     results.sendText.success = true;
    //     console.log('✅ [sendText] 发送成功:', msg2);
    // } catch (error) {
    //     results.sendText.error = error.message;
    //     console.error('❌ [sendText] 发送失败:', error);
    // }

    console.log('🧪 [双模式测试] 结果:', results);
    console.log('🧪 请检查后端日志，看收到哪种方式的消息');

    return results;
}

// 测试辅助函数：获取当前音频 jitter buffer 状态
export function getJitterBufferStatus() {
    if (!state.room) {
        console.warn('⚠️ 房间未连接');
        return null;
    }

    const results = [];

    try {
        // 获取所有 RTCRtpReceiver
        const pc = state.room.engine?.client?.pc;
        if (!pc || !pc.getReceivers) {
            console.warn('⚠️ 无法获取 PeerConnection');
            return null;
        }

        const receivers = pc.getReceivers();
        receivers.forEach((receiver, index) => {
            if (receiver.track && receiver.track.kind === 'audio') {
                const info = {
                    索引: index,
                    轨道ID: receiver.track.id,
                    轨道标签: receiver.track.label,
                    轨道状态: receiver.track.readyState,
                    jitterBufferTarget支持: typeof receiver.jitterBufferTarget !== 'undefined',
                    jitterBufferTarget值:
                        receiver.jitterBufferTarget !== undefined ? receiver.jitterBufferTarget + 'ms' : '不支持'
                };
                results.push(info);
            }
        });

        if (results.length === 0) {
            console.log('🔍 当前没有音频接收器');
        } else {
            console.log(
                `%c🎯 [Jitter Buffer 状态] 找到 ${results.length} 个音频接收器`,
                'color: #00ff00; font-weight: bold; font-size: 14px'
            );
            console.table(results);
        }

        return results;
    } catch (error) {
        console.error('❌ 获取 Jitter Buffer 状态失败:', error);
        return null;
    }
}

export function useLiveKit() {
    // 摄像头切换防抖标记（浏览器级别保护）
    let isSwitchingCamera = false;

    // 摄像头设备缓存（避免频繁 facingMode 切换导致浏览器风控）
    let cachedVideoDevices = {
        front: null, // 前置摄像头 deviceId
        back: null, // 后置摄像头 deviceId
        initialized: false
    };

    /**
     * 验证分辨率是否满足算法要求（最小 448x448）
     * @param {Object} resolution { width, height }
     * @returns {boolean}
     */
    function validateResolution(resolution) {
        const isValid = resolution.width >= MIN_VIDEO_DIMENSION && resolution.height >= MIN_VIDEO_DIMENSION;
        if (!isValid) {
            console.error(`❌ 分辨率不满足算法要求 (最小${MIN_VIDEO_DIMENSION}x${MIN_VIDEO_DIMENSION}):`, resolution);
        } else {
            console.log(`✅ 分辨率满足算法要求:`, resolution);
        }
        return isValid;
    }

    /**
     * 枚举并缓存摄像头设备（避免频繁使用 facingMode 导致浏览器风控）
     * 使用 deviceId 比 facingMode 更稳定
     *
     * 🔥 关键优化：排除长焦镜头，优先选择主摄/广角镜头
     * ✅ 兼容 iOS 和 Android 设备
     */
    async function initVideoDevices() {
        if (cachedVideoDevices.initialized) {
            console.log('✅ 摄像头设备已缓存:', cachedVideoDevices);
            return;
        }

        try {
            console.log('🔍 开始枚举摄像头设备...');
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            console.log(
                `📹 找到 ${videoDevices.length} 个摄像头设备:`,
                videoDevices.map(d => ({
                    deviceId: d.deviceId,
                    label: d.label,
                    groupId: d.groupId
                }))
            );

            // 🔥 关键优化：识别并排除长焦镜头（兼容 iOS 和 Android）
            const backCandidates = []; // 后置摄像头候选列表

            // 识别前后置摄像头
            videoDevices.forEach(device => {
                const label = device.label.toLowerCase();

                // 📱 前置摄像头识别（iOS + Android）
                if (
                    label.includes('front') ||
                    label.includes('user') ||
                    label.includes('前') ||
                    label.includes('facing front') || // Android 标准格式
                    label.includes('camera 1') || // 部分安卓设备的编号方式
                    label.includes('camera2 1') // camera2 API 格式
                ) {
                    cachedVideoDevices.front = device.deviceId;
                    console.log('✅ 识别到前置摄像头:', device.label);
                }
                // 📷 后置摄像头识别（iOS + Android，排除长焦）
                else if (
                    label.includes('back') ||
                    label.includes('rear') ||
                    label.includes('environment') ||
                    label.includes('后') ||
                    label.includes('facing back') // Android 标准格式（包括 camera2 格式）
                ) {
                    // 🚫 排除长焦镜头（会导致画面放大）
                    // iOS 关键词: tele, telephoto, zoom
                    // Android 关键词: telephoto, zoom, macro（微距）
                    if (
                        label.includes('tele') ||
                        label.includes('zoom') ||
                        label.includes('长焦') ||
                        label.includes('macro') || // Android 微距镜头也需排除
                        label.includes('depth') // Android 景深镜头
                    ) {
                        console.warn('⚠️ 跳过特殊镜头:', device.label, '(长焦/微距/景深)');
                        return; // 跳过这个设备
                    }

                    // 🎯 优先级排序（兼容 iOS 和 Android）
                    let priority = 0;
                    let cameraType = '';

                    // 🔥 关键优化：识别 camera2 X 格式（Android Camera2 API）
                    const camera2Match = label.match(/camera2?\s+(\d+)/); // 匹配 "camera2 X" 或 "camera X"
                    if (camera2Match) {
                        const cameraId = parseInt(camera2Match[1]);

                        if (cameraId === 0) {
                            // camera2 0 = 主后置摄像头（Android 标准）
                            priority = 10; // 最高优先级
                            cameraType = 'Android 主摄 (camera2 0)';
                            console.log('✅ 识别到 Android 主摄 (camera2 0):', device.label);
                        } else if (cameraId === 2) {
                            // camera2 2 通常是超广角或其他辅助镜头
                            priority = 6;
                            cameraType = 'Android 辅助镜头 (camera2 2)';
                        } else if (cameraId === 3 || cameraId === 4) {
                            // camera2 3/4 通常是长焦、微距或景深
                            priority = 3;
                            cameraType = `Android 特殊镜头 (camera2 ${cameraId})`;
                            console.warn('⚠️ 低优先级镜头:', device.label, '(可能是长焦/微距)');
                        } else {
                            priority = 5;
                            cameraType = `Android 其他镜头 (camera2 ${cameraId})`;
                        }
                    }
                    // iOS 识别模式
                    else if (label.includes('wide') && !label.includes('ultra')) {
                        priority = 10; // 主摄广角（最高优先级）
                        cameraType = 'iOS 主摄广角';
                    } else if (label.includes('dual') || label.includes('triple') || label.includes('三镜头')) {
                        priority = 9; // 双广角/三镜头
                        cameraType = 'iOS 多镜头';
                    } else if (label.includes('ultra') || label.includes('超广角')) {
                        priority = 5; // 超广角（较低优先级，视野过宽）
                        cameraType = 'iOS 超广角';
                    }
                    // Android 其他识别模式
                    else if (label.includes('main') || label.includes('primary') || label.includes('主摄')) {
                        priority = 10; // Android 主摄（最高优先级）
                        cameraType = 'Android 主摄';
                    } else if (label.includes('wide') && label.includes('angle')) {
                        priority = 9; // Android 广角
                        cameraType = 'Android 广角';
                    } else if (label.includes('camera 0') || label.includes('back camera')) {
                        priority = 8; // Android 默认后置（通常是主摄）
                        cameraType = 'Android 默认后置';
                    } else {
                        priority = 7; // 其他后置摄像头
                        cameraType = '通用后置';
                    }

                    backCandidates.push({
                        deviceId: device.deviceId,
                        label: device.label,
                        priority,
                        cameraType
                    });
                }
            });

            // 🎯 选择优先级最高的后置摄像头
            if (backCandidates.length > 0) {
                // 按优先级排序
                backCandidates.sort((a, b) => b.priority - a.priority);
                cachedVideoDevices.back = backCandidates[0].deviceId;
                console.log(
                    '✅ 选择后置摄像头:',
                    backCandidates[0].label,
                    `(${backCandidates[0].cameraType}, 优先级: ${backCandidates[0].priority})`
                );
                console.log('📊 所有后置摄像头候选:', backCandidates);
            }

            // 如果无法通过 label 识别，使用默认策略
            if (!cachedVideoDevices.front && videoDevices.length > 0) {
                cachedVideoDevices.front = videoDevices[0].deviceId;
                console.log('⚠️ 无法识别前置摄像头，使用第一个设备');
            }
            if (!cachedVideoDevices.back && videoDevices.length > 1) {
                // 从后往前找，避免选到长焦/微距/景深
                for (let i = videoDevices.length - 1; i >= 0; i--) {
                    const label = videoDevices[i].label.toLowerCase();
                    if (
                        !label.includes('tele') &&
                        !label.includes('zoom') &&
                        !label.includes('长焦') &&
                        !label.includes('macro') &&
                        !label.includes('depth')
                    ) {
                        cachedVideoDevices.back = videoDevices[i].deviceId;
                        console.log('⚠️ 降级策略：使用设备', i, ':', videoDevices[i].label);
                        break;
                    }
                }
                // 如果仍未找到，使用第二个设备
                if (!cachedVideoDevices.back) {
                    cachedVideoDevices.back = videoDevices[1].deviceId;
                    console.log('⚠️ 最终降级：使用第二个设备');
                }
            }

            cachedVideoDevices.initialized = true;
            console.log('✅ 摄像头设备缓存完成:', {
                front: cachedVideoDevices.front ? '✅' : '❌',
                back: cachedVideoDevices.back ? '✅' : '❌'
            });
        } catch (error) {
            console.error('❌ 枚举摄像头设备失败:', error);
            // 降级：标记为已初始化，避免重复尝试
            cachedVideoDevices.initialized = true;
        }
    }

    /**
     * 等待视频轨道准备好有效画面数据
     * @param {LocalVideoTrack} videoTrack - 视频轨道
     * @param {number} timeout - 超时时间（毫秒），默认 3000ms
     * @returns {Promise<boolean>} 是否成功准备就绪
     */
    async function waitForVideoReady(videoTrack, timeout) {
        // 🔧 iPad 修复：检测设备并调整超时时间
        const isIPad = /iPad|Macintosh/i.test(navigator.userAgent) && 'ontouchend' in document;
        const actualTimeout =
            timeout || (isIPad ? VIDEO_INIT_CONFIG.readyTimeout.iPad : VIDEO_INIT_CONFIG.readyTimeout.default);

        console.log(`⏳ 等待视频轨道准备有效画面... ${isIPad ? '(iPad 模式，延长等待时间)' : ''}`);

        return new Promise(resolve => {
            // 创建临时视频元素来检测画面
            const tempVideo = document.createElement('video');
            tempVideo.style.display = 'none';
            tempVideo.muted = true;
            tempVideo.playsInline = true;
            tempVideo.autoplay = true;

            let resolved = false;
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    console.warn(`⚠️ 视频准备超时(${actualTimeout}ms)，继续发布（可能第一帧仍是黑屏）`);
                    cleanup();
                    resolve(false);
                }
            }, actualTimeout);

            const cleanup = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    try {
                        tempVideo.pause();
                        tempVideo.srcObject = null;
                        tempVideo.remove();
                    } catch (e) {
                        console.warn('清理临时视频元素失败:', e);
                    }
                }
            };

            // 监听视频准备就绪事件
            const onCanPlay = () => {
                console.log('✅ 视频准备就绪（canplay 事件触发）');

                // 🔧 iPad 修复：检测视频画面是否是黑屏
                const checkVideoFrame = () => {
                    try {
                        if (tempVideo.videoWidth === 0 || tempVideo.videoHeight === 0) {
                            console.warn('⚠️ 视频尺寸为 0，可能还未完全初始化');
                            // 继续等待
                            setTimeout(checkVideoFrame, VIDEO_INIT_CONFIG.blackScreenCheckInterval);
                            return;
                        }

                        // 创建临时 Canvas 检测画面
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.min(tempVideo.videoWidth, 100);
                        canvas.height = Math.min(tempVideo.videoHeight, 100);
                        const ctx = canvas.getContext('2d');

                        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);

                        // 🔧 优化：多点采样，提高检测准确性
                        const samplePoints = [
                            { x: canvas.width / 2, y: canvas.height / 2 }, // 中心
                            { x: canvas.width / 4, y: canvas.height / 4 }, // 左上
                            { x: (canvas.width * 3) / 4, y: canvas.height / 4 }, // 右上
                            { x: canvas.width / 4, y: (canvas.height * 3) / 4 }, // 左下
                            { x: (canvas.width * 3) / 4, y: (canvas.height * 3) / 4 } // 右下
                        ];

                        let totalBrightness = 0;
                        let validSamples = 0;

                        for (const point of samplePoints) {
                            try {
                                const imageData = ctx.getImageData(point.x - 5, point.y - 5, 10, 10);
                                const pixels = imageData.data;
                                let brightness = 0;

                                // 计算该采样点的平均亮度
                                for (let i = 0; i < pixels.length; i += 4) {
                                    const r = pixels[i];
                                    const g = pixels[i + 1];
                                    const b = pixels[i + 2];
                                    brightness += (r + g + b) / 3;
                                }
                                brightness /= pixels.length / 4;
                                totalBrightness += brightness;
                                validSamples++;
                            } catch (e) {
                                // 采样点超出边界，跳过
                            }
                        }

                        const averageBrightness = validSamples > 0 ? totalBrightness / validSamples : 0;
                        const hasNonBlackPixel = averageBrightness > VIDEO_INIT_CONFIG.brightnessThreshold;

                        if (hasNonBlackPixel) {
                            console.log(
                                `%c✅ 检测到有效画面，视频已就绪 (亮度: ${averageBrightness.toFixed(1)}, 阈值: ${VIDEO_INIT_CONFIG.brightnessThreshold})`,
                                'color: #00ff00; font-weight: bold; font-size: 14px; background: #003300; padding: 4px 8px;'
                            );
                            cleanup();
                            resolve(true);
                        } else {
                            console.log(
                                `%c⚠️ 检测到黑屏，继续等待... (亮度: ${averageBrightness.toFixed(1)}, 阈值: ${VIDEO_INIT_CONFIG.brightnessThreshold})`,
                                'color: #ff6600; font-weight: bold; font-size: 12px; background: #331100; padding: 2px 6px;'
                            );
                            setTimeout(checkVideoFrame, VIDEO_INIT_CONFIG.blackScreenCheckInterval);
                        }
                    } catch (err) {
                        console.warn('⚠️ 画面检测失败，直接返回:', err);
                        cleanup();
                        resolve(true);
                    }
                };

                // 等待 300ms 后开始检测
                setTimeout(checkVideoFrame, 300);
            };

            const onLoadedData = () => {
                console.log('✅ 视频数据加载完成（loadeddata 事件触发）');
            };

            tempVideo.addEventListener('canplay', onCanPlay, { once: true });
            tempVideo.addEventListener('loadeddata', onLoadedData, { once: true });

            // attach 视频轨道
            try {
                videoTrack.attach(tempVideo);
                console.log('📹 视频轨道已 attach 到临时元素，等待画面准备...');
            } catch (e) {
                console.error('❌ attach 视频失败:', e);
                cleanup();
                resolve(false);
            }
        });
    }

    /**
     * 创建本地视频轨道（带就绪检查）
     * @param {Object} options 视频配置
     * @returns {Promise<LocalVideoTrack>} 视频轨道
     */
    async function createLocalVideoTrackWithReadyCheck(options) {
        const createStartTime = performance.now();

        // 创建原始视频轨道
        const videoTrack = await createLocalVideoTrack(options);
        console.log(`📹 视频轨道创建耗时: ${(performance.now() - createStartTime).toFixed(0)}ms`);

        // 验证实际采集的分辨率
        const actualSettings = videoTrack.mediaStreamTrack.getSettings();

        // 兼容两种格式：旧的 resolution 对象和新的 MediaTrackConstraints
        const requestedWidth = options.resolution?.width || options.width?.ideal || options.width;
        const requestedHeight = options.resolution?.height || options.height?.ideal || options.height;
        const requestedFacing = typeof options.facingMode === 'object' ? options.facingMode.ideal : options.facingMode;

        console.log(`%c📐 [摄像头详情] 实际采集信息`, 'color: #00ff00; font-weight: bold; font-size: 14px', {
            '📱 设备信息': {
                deviceId: actualSettings.deviceId,
                label: actualSettings.label || '(设备标签未提供)',
                groupId: actualSettings.groupId
            },
            '🎥 采集参数': {
                请求分辨率: requestedWidth && requestedHeight ? `${requestedWidth}x${requestedHeight}` : '未指定',
                实际分辨率: `${actualSettings.width}x${actualSettings.height}`,
                帧率: actualSettings.frameRate + ' fps',
                宽高比: (actualSettings.width / actualSettings.height).toFixed(2)
            },
            '📷 摄像头方向': {
                请求: requestedFacing || '未指定',
                实际: actualSettings.facingMode || '未知'
            },
            '💡 提示': actualSettings.label
                ? actualSettings.label.includes('ultra') || actualSettings.label.includes('wide')
                    ? '✅ 超广角镜头'
                    : actualSettings.label.includes('tele') || actualSettings.label.includes('zoom')
                      ? '⚠️ 长焦镜头（可能导致画面放大）'
                      : '✅ 主摄（广角）'
                : '请在 iOS 设置中允许浏览器访问摄像头标签'
        });

        // 检查是否满足算法要求
        const meetsRequirement =
            actualSettings.width >= MIN_VIDEO_DIMENSION && actualSettings.height >= MIN_VIDEO_DIMENSION;
        if (!meetsRequirement) {
            console.error(
                `❌ 警告：实际采集分辨率 ${actualSettings.width}x${actualSettings.height} 低于算法要求 ${MIN_VIDEO_DIMENSION}x${MIN_VIDEO_DIMENSION}`
            );
            ElMessage({
                type: 'warning',
                message: `视频分辨率可能影响AI识别效果 (${actualSettings.width}x${actualSettings.height})`,
                duration: 3000
            });
        } else {
            console.log(
                `✅ 实际采集分辨率满足算法要求 (${actualSettings.width}x${actualSettings.height} >= ${MIN_VIDEO_DIMENSION}x${MIN_VIDEO_DIMENSION})`
            );
        }

        // 🔧 移动设备修复：确保视频轨道有有效画面后再返回
        const isIPad = /iPad|Macintosh/i.test(navigator.userAgent) && 'ontouchend' in document;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile || isIPad) {
            const deviceType = isIPad ? 'iPad' : '移动设备';
            const timeout = isIPad ? VIDEO_INIT_CONFIG.readyTimeout.iPad : VIDEO_INIT_CONFIG.readyTimeout.default;

            console.log(`⏳ ${deviceType}检测到，等待视频轨道准备有效画面...`);
            try {
                const isReady = await waitForVideoReady(videoTrack, timeout);
                if (isReady) {
                    console.log(`✅ ${deviceType}视频轨道已准备就绪`);
                } else {
                    console.warn(`⚠️ ${deviceType}视频轨道等待超时，可能存在黑屏风险`);
                }
            } catch (err) {
                console.warn(`⚠️ ${deviceType}视频就绪检查失败:`, err);
            }
        }

        return videoTrack;
    }

    /**
     * 启动3分钟无机器人检测定时器
     */
    function startNoRobotTimer(room) {
        // 如果已经有远端参与者，不需要启动定时器
        if (room.remoteParticipants.size > 0) {
            console.log('✅ 房间已有远端参与者，无需启动无机器人检测定时器');
            return;
        }

        // 根据环境自动设置超时时间
        const isLocalhost =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('localhost');
        const TIMEOUT_MS = isLocalhost ? 10 * 1000 : 3 * 60 * 1000; // localhost: 10秒, 生产: 3分钟

        console.log(`⏰ 启动无机器人检测定时器 (${TIMEOUT_MS / 1000}秒)...`);
        console.log(`🌍 当前环境: ${isLocalhost ? 'localhost (测试)' : '生产环境'}`);

        noRobotTimer = setTimeout(() => {
            const timestamp = formatSyncedTimestamp();
            // 检查是否有远端参与者
            if (room && room.remoteParticipants.size === 0) {
                console.warn(`⚠️ [${timestamp}] ${TIMEOUT_MS / 1000}秒内未检测到机器人加入，准备挂断...`);
                console.warn('当前远端参与者数量:', room.remoteParticipants.size);

                // 提示用户（使用 toast 而不是 alert）
                ElMessage({
                    type: 'warning',
                    message: getI18nMessage('connectionTimeoutEndingCall'),
                    duration: 3000,
                    showClose: true
                });

                // 执行挂断流程
                leaveRoom();
            } else {
                console.log(`✅ [${timestamp}] 已有远端参与者，无需处理`);
                console.log('远端参与者数量:', room.remoteParticipants.size);
            }
            noRobotTimer = null;
        }, TIMEOUT_MS); // 测试用10秒，正式：3 * 60 * 1000
    }

    // 轮次与时间点记录
    function ensureRoundForParticipant(participantSid) {
        const last = state.audioRounds[state.audioRounds.length - 1];
        if (
            !last ||
            (last && last.firstPlayAt && last.participantSid !== participantSid) ||
            (last && last.participantSid === participantSid && last.firstPlayAt)
        ) {
            state.audioRounds.push({
                round: state.audioRounds.length,
                participantSid,
                generateStartAt: undefined,
                audioStartSignalAt: undefined,
                firstPacketAt: undefined,
                firstPlayAt: undefined,
                deltas: {}
            });

            // 🔧 限制 audioRounds 长度，防止内存泄漏
            if (state.audioRounds.length > MAX_AUDIO_ROUNDS) {
                const removed = state.audioRounds.shift();
                console.log(
                    `🧹 自动清理最旧的音频轮次 (round ${removed.round})，当前保留: ${state.audioRounds.length}`
                );
            }
        }
        state.pendingRoundIndex = state.audioRounds.length - 1;
        return state.pendingRoundIndex;
    }

    function markFirstPacket(participant) {
        try {
            const idx = ensureRoundForParticipant(participant.sid);
            const round = state.audioRounds[idx];
            if (!round.firstPacketAt) {
                round.firstPacketAt = performance.now();
                round.firstPacketWallClock = timeSync.getSyncedTimestamp();
                round.firstPacketWallClockFmt = formatSyncedTimestamp();
                const deltas = {};
                if (round.generateStartAt) deltas.fromGenerateStart = round.firstPacketAt - round.generateStartAt;
                if (round.audioStartSignalAt)
                    deltas.fromAudioStartSignal = round.firstPacketAt - round.audioStartSignalAt;
                round.deltas = { ...round.deltas, ...deltas };
                console.log(
                    `%c🎤 [音频帧到达] Round ${round.round}`,
                    'color: #00ff00; font-weight: bold; font-size: 14px',
                    {
                        事件类型: '首包音频帧检测 (speaking/unmute)',
                        参与者SID: round.participantSid,
                        首包时间戳: round.firstPacketAt.toFixed(2) + 'ms',
                        墙上时钟: round.firstPacketWallClockFmt,
                        延迟计算: {
                            距离生成开始: deltas.fromGenerateStart ? deltas.fromGenerateStart.toFixed(2) + 'ms' : 'N/A',
                            距离音频信号: deltas.fromAudioStartSignal
                                ? deltas.fromAudioStartSignal.toFixed(2) + 'ms'
                                : 'N/A'
                        },
                        原始数据: {
                            firstPacketAt: round.firstPacketAt,
                            firstPacketWallClock: round.firstPacketWallClock,
                            deltas
                        }
                    }
                );
            }
        } catch (e) {
            console.warn('记录首包时间失败:', e);
        }
    }

    /**
     * 记录真实的音频播放时间（由组件层调用）
     */
    function markAudioActualPlay(participantSid) {
        try {
            const idx = state.pendingRoundIndex >= 0 ? state.pendingRoundIndex : state.audioRounds.length - 1;
            if (idx < 0) return;

            const round = state.audioRounds[idx];
            if (!round || round.participantSid !== participantSid) return;

            // 只记录第一次真实播放时间
            if (!round.actualPlayAt) {
                round.actualPlayAt = performance.now();
                round.actualPlayWallClock = timeSync.getSyncedTimestamp();
                round.actualPlayWallClockFmt = formatSyncedTimestamp();

                const deltasPlay = { ...round.deltas };
                if (round.firstPacketAt) {
                    deltasPlay.packetToActualPlay = round.actualPlayAt - round.firstPacketAt;
                }
                if (round.generateStartAt) {
                    deltasPlay.fromGenerateStartToActualPlay = round.actualPlayAt - round.generateStartAt;
                }
                if (round.audioStartSignalAt) {
                    deltasPlay.fromAudioSignalToActualPlay = round.actualPlayAt - round.audioStartSignalAt;
                }
                round.deltas = deltasPlay;

                console.log(
                    `%c🔊 [实际播放] Round ${round.round}`,
                    'color: #ff9500; font-weight: bold; font-size: 14px',
                    {
                        事件类型: 'Audio元素真实播放事件',
                        参与者SID: round.participantSid,
                        实际播放时间戳: round.actualPlayAt.toFixed(2) + 'ms',
                        墙上时钟: round.actualPlayWallClockFmt,
                        延迟计算: {
                            从首包到播放: deltasPlay.packetToActualPlay
                                ? deltasPlay.packetToActualPlay.toFixed(2) + 'ms'
                                : 'N/A',
                            从生成到播放: deltasPlay.fromGenerateStartToActualPlay
                                ? deltasPlay.fromGenerateStartToActualPlay.toFixed(2) + 'ms'
                                : 'N/A',
                            从音频信号到播放: deltasPlay.fromAudioSignalToActualPlay
                                ? deltasPlay.fromAudioSignalToActualPlay.toFixed(2) + 'ms'
                                : 'N/A'
                        },
                        原始数据: {
                            actualPlayAt: round.actualPlayAt,
                            actualPlayWallClock: round.actualPlayWallClock,
                            deltas: round.deltas
                        }
                    }
                );
            }
        } catch (e) {
            console.warn('记录实际播放时间失败:', e);
        }
    }

    /**
     * 发送 play_end 信号并设置防护标记
     */
    function sendPlayEnd(reason = '音频播放结束') {
        sendText('<state><play_end>');
        state.playEndSent = true;
        state.playEndTimestamp = performance.now();

        // 使用醒目的样式打印日志
        console.log(
            `%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            'color: #ff0000; font-weight: bold; font-size: 14px'
        );
        console.log(
            `%c🛑 [${formatSyncedTimestamp()}] 发送 play_end 给后端`,
            'color: #ff0000; font-weight: bold; font-size: 16px; background: #fff3cd; padding: 4px 8px;'
        );
        console.log(`%c   原因: ${reason}`, 'color: #ff0000; font-weight: bold; font-size: 14px');
        console.log(`%c   当前状态: ${state.status} → listening`, 'color: #ff0000; font-weight: bold; font-size: 14px');
        console.log(
            `%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            'color: #ff0000; font-weight: bold; font-size: 14px'
        );
    }

    function handleSpeakingChanged(participant, speaking) {
        const sid = participant.sid;
        const timestamp = formatSyncedTimestamp();

        // 清除旧定时器
        if (silenceTimers.has(sid)) {
            clearTimeout(silenceTimers.get(sid));
            silenceTimers.delete(sid);
        }

        if (speaking) {
            // 🔥 关键优化：检查是否是 play_end 后的延迟音频包
            const timeSincePlayEnd = performance.now() - state.playEndTimestamp;
            const IGNORE_DELAY_THRESHOLD = 500; // 500ms 内的音频包被认为是延迟包

            if (state.playEndSent && timeSincePlayEnd < IGNORE_DELAY_THRESHOLD) {
                console.warn(
                    `%c⚠️ [${timestamp}] 检测到 play_end 后 ${timeSincePlayEnd.toFixed(0)}ms 的延迟音频包，忽略！`,
                    'color: orange; font-weight: bold; font-size: 14px',
                    {
                        participant: participant.identity,
                        sid: participant.sid,
                        currentStatus: state.status,
                        generateEnd: state.generateEnd,
                        说明: '这可能是网络延迟导致的音频包，属于已结束的轮次，应该被忽略'
                    }
                );
                return; // 直接返回，不处理这个延迟的 speaking 事件
            }

            // 🔥 重置音频结束确认计数（检测到新音频）
            audioEndConfirmCount.set(sid, 0);

            // 标记该参与者正在说话
            state.remoteAudioActive[sid] = true;
            // 标记本轮有音频
            state.currentRoundHasAudio = true;
            // 记录首包音频时间
            markFirstPacket(participant);

            console.log(
                `%c🔊 [${timestamp}] 远端开始说话 (可能是多段音频的其中一段):` +
                    JSON.stringify({
                        participant: participant.identity,
                        sid: participant.sid,
                        speaking,
                        currentStatus: state.status,
                        generateEnd: state.generateEnd,
                        remoteAudioActive: state.remoteAudioActive,
                        timeSincePlayEnd: state.playEndSent ? timeSincePlayEnd.toFixed(0) + 'ms' : 'N/A',
                        mode: state.mode,
                        说明: state.generateEnd
                            ? '⚠️ 后端已发送generate_end，但音频仍在播放（可能是多段音频）'
                            : '✅ 正常播放'
                    }),
                'color: yellow; font-size: 32px'
            );

            // 🔥 打断保护：如果处于打断状态，忽略所有音频播放信号
            if (state.muteRemoteAudio) {
                console.log(`🚫 [${timestamp}] 检测到音频播放但处于打断状态，忽略音频信号（等待 vad_end）`, {
                    participant: participant.identity,
                    muteRemoteAudio: state.muteRemoteAudio,
                    currentStatus: state.status
                });
                return; // 直接返回，不处理任何音频播放逻辑
            }

            // 简化切换逻辑：只有在thinking状态检测到实际音频播放时才切换到talking
            if (state.status === 'thinking') {
                state.status = 'talking';
                console.log(`▶️ [${timestamp}] 远端 ${participant.identity} 开始播放音频，从thinking切换到talking`);
            } else if (state.status === 'talking') {
                console.log(`▶️ [${timestamp}] 远端 ${participant.identity} 继续播放音频，保持talking状态`);
            } else {
                // 兜底：部分场景未经历 thinking（如缺失 vad_end），仍需在首帧音频时切换
                const canForceTalking = ['listening', 'connecting', 'initializing', ''].includes(state.status);
                if (canForceTalking) {
                    state.status = 'talking';
                    console.log(
                        `▶️ [${timestamp}] 远端 ${participant.identity} 首帧音频，兜底切换到talking（原状态: ${state.status || '空'}）`
                    );
                } else {
                    console.log(`⏸️ [${timestamp}] 检测到音频播放但不切换状态，当前状态: ${state.status}`);
                }
            }
        } else {
            // 音频停止说话，启动优化的检查流程
            const config = getSilenceConfig();
            const currentAudioElements = document.querySelectorAll('audio[data-livekit-audio]').length;
            console.log(
                `%c🔇 [${timestamp}] 远端停止说话 (可能是多段音频的其中一段结束):`,
                'color: orange; font-weight: bold; font-size: 14px',
                {
                    participant: participant.identity,
                    sid: participant.sid,
                    speaking: false,
                    mode: state.mode,
                    silenceTimeout: config.timeout + 'ms',
                    generateEnd: state.generateEnd,
                    audioElements: currentAudioElements,
                    说明: state.generateEnd
                        ? '⚠️ 后端已发送generate_end，将在' + config.timeout + 'ms后检查是否还有音频（多段音频场景）'
                        : '✅ 等待后端发送更多音频或generate_end'
                }
            );
            console.log(
                `🔇 [${timestamp}] ${participant.identity} 停止说话，开始精确检查 (${state.mode}模式: ${config.timeout}ms)...`
            );

            const tid = setTimeout(() => {
                const checkTimestamp = formatSyncedTimestamp();
                silenceTimers.delete(sid);
                state.remoteAudioActive[sid] = false;

                // 🔥 打断保护：如果处于打断状态，忽略静默检查
                if (state.muteRemoteAudio) {
                    console.log(`🚫 [${checkTimestamp}] 静默检查但处于打断状态，忽略检查（等待 vad_end）`, {
                        participant: participant.identity,
                        muteRemoteAudio: state.muteRemoteAudio,
                        currentStatus: state.status
                    });
                    return; // 直接返回，不处理任何静默检查逻辑
                }

                // 基础条件检查
                const remoteStillSpeaking = Object.entries(state.remoteAudioActive).some(
                    ([id, active]) => id !== state.room?.localParticipant.sid && active
                );

                console.log(`🔇 [${checkTimestamp}] ${participant.identity} 静默检查:`, {
                    remoteStillSpeaking,
                    generateEnd: state.generateEnd,
                    currentStatus: state.status,
                    mode: state.mode
                });

                // 如果基础条件满足，进行快速精确检查
                if (!remoteStillSpeaking && state.generateEnd && state.status === 'talking') {
                    // 🔧 关键保护：如果 generate_end 刚收到不久，增加额外缓冲时间防止误判
                    const timeSinceGenerateEnd = state.generateEndTimestamp
                        ? performance.now() - state.generateEndTimestamp
                        : Infinity;
                    const RECENT_GENERATE_END_THRESHOLD = 1000; // 1秒内认为是"刚收到"
                    const isRecentGenerateEnd = timeSinceGenerateEnd < RECENT_GENERATE_END_THRESHOLD;

                    // 如果是刚收到的 generate_end，使用更长的延迟时间
                    const actualSafetyDelay = isRecentGenerateEnd
                        ? Math.max(config.safetyDelay, config.generateEndBuffer) // 使用更长的缓冲时间
                        : config.safetyDelay;

                    console.log(`⏱️ [${checkTimestamp}] 启动快速精确检查 (${actualSafetyDelay}ms)...`, {
                        timeSinceGenerateEnd: timeSinceGenerateEnd.toFixed(0) + 'ms',
                        isRecentGenerateEnd,
                        原始延迟: config.safetyDelay + 'ms',
                        实际延迟: actualSafetyDelay + 'ms'
                    });

                    setTimeout(() => {
                        const preciseCheckTimestamp = formatSyncedTimestamp();
                        const finalRemoteCheck = Object.entries(state.remoteAudioActive).some(
                            ([id, active]) => id !== state.room?.localParticipant.sid && active
                        );

                        console.log(`🔇 [${preciseCheckTimestamp}] ${participant.identity} 精确检查:`, {
                            finalRemoteCheck,
                            generateEnd: state.generateEnd,
                            currentStatus: state.status
                        });

                        // 优先使用remoteAudioActive状态，DOM检查作为辅助
                        if (!finalRemoteCheck && state.generateEnd && state.status === 'talking') {
                            // 进行DOM检查，但设置更短的超时
                            const audioElementsPlaying = checkAudioElementsStatus();

                            if (!audioElementsPlaying) {
                                // 🔥 增加确认计数机制：防止单次误判
                                const currentCount = (audioEndConfirmCount.get(sid) || 0) + 1;
                                audioEndConfirmCount.set(sid, currentCount);

                                // 🔥 要求连续确认次数（视频模式更严格）
                                const requiredConfirms = state.mode === 'video' ? 2 : 1;

                                console.log(
                                    `%c🔍 [${preciseCheckTimestamp}] DOM检查显示无音频，确认次数: ${currentCount}/${requiredConfirms}`,
                                    'color: #ff9800; font-weight: bold; font-size: 13px'
                                );

                                if (currentCount < requiredConfirms) {
                                    // 还需要更多确认，给予额外缓冲时间（有缓冲区检测，可适当缩短）
                                    const extraBufferTime = state.mode === 'video' ? 500 : 250;
                                    console.log(
                                        `⏳ [${preciseCheckTimestamp}] 需要${requiredConfirms - currentCount}次额外确认，给予${extraBufferTime}ms缓冲...`
                                    );

                                    setTimeout(() => {
                                        // 递归检查
                                        if (
                                            !Object.values(state.remoteAudioActive).some(v => v) &&
                                            state.generateEnd &&
                                            state.status === 'talking'
                                        ) {
                                            const recursiveCheck = checkAudioElementsStatus();
                                            if (!recursiveCheck) {
                                                // 再次触发检查逻辑（通过设置 remoteAudioActive 为 false）
                                                // 这会增加确认计数
                                                console.log(`🔄 [${formatSyncedTimestamp()}] 继续确认检查...`);
                                            }
                                        } else {
                                            // 状态改变，重置计数
                                            audioEndConfirmCount.set(sid, 0);
                                        }
                                    }, extraBufferTime);
                                } else {
                                    // 确认次数足够，可以发送 play_end（有缓冲区和网络状态双重保障）
                                    const extraBufferTime = state.mode === 'video' ? 300 : 150;
                                    console.log(
                                        `✅ [${preciseCheckTimestamp}] 已连续${currentCount}次确认无音频，给予最后${extraBufferTime}ms缓冲...`
                                    );

                                    setTimeout(() => {
                                        if (
                                            !Object.values(state.remoteAudioActive).some(v => v) &&
                                            state.generateEnd &&
                                            state.status === 'talking'
                                        ) {
                                            // 最终检查
                                            const finalBufferCheck = checkAudioElementsStatus();
                                            if (!finalBufferCheck) {
                                                audioEndConfirmCount.set(sid, 0); // 重置计数
                                                state.status = 'listening';
                                                sendPlayEnd(`静默检查：连续${currentCount}次确认后结束`);
                                                console.log(
                                                    `🛑 [${formatSyncedTimestamp()}] 连续确认检查通过，切换到 listening`
                                                );
                                            } else {
                                                audioEndConfirmCount.set(sid, 0); // 重置计数
                                                console.log(
                                                    `🎵 [${formatSyncedTimestamp()}] 最终检查发现有音频，重置计数继续等待...`
                                                );
                                            }
                                        } else {
                                            audioEndConfirmCount.set(sid, 0);
                                        }
                                    }, extraBufferTime);
                                }
                            } else {
                                // DOM检查显示还在播放，给予额外时间
                                const extraCheckTime = state.mode === 'video' ? 300 : 100;
                                console.log(
                                    `🔄 [${preciseCheckTimestamp}] DOM检查显示仍在播放，给予${extraCheckTime}ms额外时间...`
                                );
                                setTimeout(() => {
                                    if (
                                        !Object.values(state.remoteAudioActive).some(v => v) &&
                                        state.generateEnd &&
                                        state.status === 'talking'
                                    ) {
                                        // 再次进行DOM检查
                                        const finalAudioCheck = checkAudioElementsStatus();
                                        if (!finalAudioCheck) {
                                            state.status = 'listening';
                                            sendPlayEnd(`静默检查：额外${extraCheckTime}ms检查通过`);
                                            console.log(`🛑 [${formatSyncedTimestamp()}] 额外检查后切换到 listening`);
                                        } else {
                                            console.log(
                                                `🔄 [${formatSyncedTimestamp()}] 最终DOM检查仍显示音频播放，再等${extraCheckTime}ms...`
                                            );
                                            setTimeout(() => {
                                                if (
                                                    !Object.values(state.remoteAudioActive).some(v => v) &&
                                                    state.generateEnd &&
                                                    state.status === 'talking'
                                                ) {
                                                    // 🔧 修复：在最后强制切换之前，必须再次检查 DOM 状态
                                                    const ultimateFinalCheck = checkAudioElementsStatus();
                                                    if (!ultimateFinalCheck) {
                                                        // 确实没有音频了，可以安全切换
                                                        state.status = 'listening';
                                                        sendPlayEnd('静默检查：最终确认后结束');
                                                        console.log(
                                                            `🛑 [${formatSyncedTimestamp()}] 最终确认无音频，切换到 listening`
                                                        );
                                                    } else {
                                                        // 仍有音频播放，重置计数器，等待下一轮检测
                                                        audioEndConfirmCount.set(sid, 0);
                                                        console.log(
                                                            `🔄 [${formatSyncedTimestamp()}] 最终检查仍发现音频播放，重置检测流程，继续等待...`
                                                        );
                                                    }
                                                }
                                            }, extraCheckTime);
                                        }
                                    }
                                }, extraCheckTime);
                            }
                        } else {
                            console.log(`⏸️ [${preciseCheckTimestamp}] 精确检查未通过:`, {
                                noRemoteSpeaking: !finalRemoteCheck,
                                hasGenerateEnd: state.generateEnd,
                                isTalking: state.status === 'talking'
                            });
                        }
                    }, config.safetyDelay);
                } else {
                    console.log(`⏸️ [${checkTimestamp}] 基础检查未通过，条件不满足`);
                }
            }, config.timeout);
            silenceTimers.set(sid, tid);
        }
    }

    // 增强：更准确的DOM音频检查（支持缓冲区检测）
    function checkAudioElementsStatus() {
        try {
            const audioElements = document.querySelectorAll('audio[data-livekit-audio]');
            let hasPlayingAudio = false;
            let shortAudioPlaying = false; // 🔧 新增：是否有短音频正在播放

            console.log(`🎵 检查 ${audioElements.length} 个音频元素状态...`);

            audioElements.forEach((audio, index) => {
                // 更严格的播放状态检查
                const isActuallyPlaying =
                    !audio.paused && !audio.ended && audio.currentTime > 0 && audio.readyState >= 2;

                // 额外检查：是否接近结束（对于非流式音频）
                const isStreamingAudio = !isFinite(audio.duration); // duration 为 Infinity 表示流式音频
                const isNearEnd =
                    !isStreamingAudio &&
                    audio.duration &&
                    audio.currentTime &&
                    audio.duration - audio.currentTime < 0.1;

                // 🔧 新增：检测是否为短音频（<1秒）
                const isShortAudio = audio.duration > 0 && audio.duration < 1.0;
                const remainingTime =
                    audio.duration && audio.currentTime && isFinite(audio.duration)
                        ? audio.duration - audio.currentTime
                        : 0;

                // 🔥 关键优化：检查缓冲区是否还有数据
                let hasBufferedData = false;
                let bufferedInfo = { ranges: 0, ahead: 0 };
                try {
                    if (audio.buffered && audio.buffered.length > 0) {
                        bufferedInfo.ranges = audio.buffered.length;
                        // 检查缓冲区中是否有当前播放位置之后的数据
                        for (let i = 0; i < audio.buffered.length; i++) {
                            const bufferEnd = audio.buffered.end(i);
                            const bufferStart = audio.buffered.start(i);
                            const aheadTime = bufferEnd - audio.currentTime;

                            // 🔧 优化：降低阈值，避免多段音频场景的误判
                            // 只要缓冲区领先时间超过 0.05 秒（50ms），就认为有未播放数据
                            // 原来 0.1 秒的阈值在多段音频切换时容易误判
                            if (aheadTime > 0.05) {
                                hasBufferedData = true;
                                bufferedInfo.ahead = aheadTime.toFixed(2);
                                break;
                            } else if (aheadTime > 0) {
                                // 记录微小的缓冲区数据（但不算作"有数据"）
                                bufferedInfo.ahead = aheadTime.toFixed(2) + '(忽略)';
                            }
                        }
                    }
                } catch (e) {
                    // 某些浏览器可能不支持 buffered API
                }

                // 🔥 检查网络状态：是否正在加载数据
                // NETWORK_EMPTY (0): 未初始化
                // NETWORK_IDLE (1): 已缓冲完成，网络空闲
                // NETWORK_LOADING (2): 正在下载数据
                // NETWORK_NO_SOURCE (3): 未找到资源
                //
                // 🔧 平衡修复：对于流式音频，需要综合判断
                // 1. 如果 LOADING 且有缓冲数据（ranges > 0 且 ahead > 0），肯定有音频
                // 2. 如果 LOADING 但 ranges=0，且 generateEnd=false，可能有新音频在路上
                // 3. 如果 LOADING 但 ranges=0，且 generateEnd=true，可能真的结束了（状态更新延迟）
                const hasBufferedAhead = bufferedInfo.ranges > 0 && parseFloat(bufferedInfo.ahead) > 0;
                const isLoadingData =
                    audio.networkState === HTMLMediaElement.NETWORK_LOADING && (hasBufferedAhead || !state.generateEnd); // 有缓冲数据，或者还没收到 generateEnd

                // 关键信息单独打印，避免被省略
                console.log(
                    `🎵 音频元素 ${index}: paused=${audio.paused}, ended=${audio.ended}, ` +
                        `currentTime=${audio.currentTime.toFixed(2)}s, duration=${isStreamingAudio ? 'Infinity(流式)' : audio.duration?.toFixed(2)}`
                );
                console.log(
                    `   📊 状态检查: readyState=${audio.readyState}, networkState=${audio.networkState} ` +
                        `(${audio.networkState === 0 ? 'EMPTY' : audio.networkState === 1 ? 'IDLE' : audio.networkState === 2 ? 'LOADING' : 'NO_SOURCE'})`
                );
                console.log(
                    `   💾 缓冲区: ranges=${bufferedInfo.ranges}, ahead=${bufferedInfo.ahead}s, ` +
                        `hasBufferedData=${hasBufferedData}, isLoadingData=${isLoadingData}` +
                        (audio.networkState === HTMLMediaElement.NETWORK_LOADING && bufferedInfo.ranges === 0
                            ? ` 🔄 LOADING+ranges=0（generateEnd=${state.generateEnd}）`
                            : '')
                );
                console.log(
                    `   🎯 判断: isActuallyPlaying=${isActuallyPlaying}, isStreamingAudio=${isStreamingAudio}, ` +
                        `isNearEnd=${isNearEnd}`
                );

                // 判断逻辑：满足以下任一条件即认为"还有音频要播放"
                // 1. 缓冲区还有数据（即使当前暂停） - 最可靠的指标
                // 2. 网络正在加载数据（说明后续还有音频片段）
                // 3. 正在播放且不接近结束（对于非流式音频）
                // 4. 流式音频：正在播放 且（有缓冲数据 或 正在加载）
                let shouldConsiderPlaying = false;
                let reason = '';

                if (hasBufferedData) {
                    shouldConsiderPlaying = true;
                    reason = '缓冲区有数据';
                } else if (isLoadingData) {
                    shouldConsiderPlaying = true;
                    reason = '网络正在加载';
                } else if (isStreamingAudio) {
                    // 流式音频：如果没有缓冲数据且不在加载，说明已经播完了
                    // 即使 paused=false，也不应该认为还在播放
                    shouldConsiderPlaying = false;
                    reason = '流式音频已播完（无缓冲数据且不在加载）';
                    if (isActuallyPlaying) {
                        console.log(`   🎯 ${reason}，忽略 paused=false 状态`);
                    }
                } else if (isActuallyPlaying && !isNearEnd) {
                    // 非流式音频：正在播放且不接近结束
                    shouldConsiderPlaying = true;
                    reason = '非流式音频正在播放';
                } else {
                    reason = '所有条件都不满足，音频已结束';
                }

                console.log(`   ✅ 最终判断: shouldConsiderPlaying=${shouldConsiderPlaying}, 原因: ${reason}`);

                if (shouldConsiderPlaying) {
                    hasPlayingAudio = true;

                    // 🔧 标记是否有短音频正在播放
                    if (isShortAudio && isActuallyPlaying) {
                        shortAudioPlaying = true;
                    }
                }
            });

            const result = shortAudioPlaying ? '有短音频播放' : hasPlayingAudio ? '有音频播放' : '无音频播放';
            console.log(`🎵 DOM检查结果: ${result}`);

            return hasPlayingAudio;
        } catch (error) {
            console.error('检查音频状态出错:', error);
            return false;
        }
    }

    /**
     * 🔧 新增：获取短音频信息（用于 generate_end 保护）
     */
    function getShortAudioInfo() {
        try {
            const audioElements = document.querySelectorAll('audio[data-livekit-audio]');

            for (const audio of audioElements) {
                const isPlaying = !audio.paused && !audio.ended && audio.currentTime > 0 && audio.readyState >= 2;

                if (!isPlaying || !audio.duration) {
                    continue;
                }

                // 检测短音频（< 1.5秒，大约3-4个字）
                const isShort = audio.duration < 1.5;
                const remainingTime = audio.duration - audio.currentTime;

                if (isShort && remainingTime > 0) {
                    return {
                        hasShort: true,
                        duration: audio.duration,
                        remainingTime: remainingTime * 1000
                    };
                }
            }

            return { hasShort: false, duration: 0, remainingTime: 0 };
        } catch (error) {
            return { hasShort: false, duration: 0, remainingTime: 0 };
        }
    }

    function subscribeParticipant(p) {
        // 初始化状态
        state.remoteAudioActive[p.sid] = false;
        console.log(`🎯 [${formatSyncedTimestamp()}] 订阅远端参与者说话事件:`, {
            participant: p.identity,
            sid: p.sid
        });
        p.on(ParticipantEvent.IsSpeakingChanged, speaking => {
            handleSpeakingChanged(p, speaking);
        });
    }
    /**
     * 加入房间（先 connect 再拿轨道）
     * @param {string} url LiveKit 服务器 URL
     * @param {string} token 由后端生成的房间访问 token
     * @param {'audio'|'video'} mode 选择"仅音频"或"音视频"
     * @param {Object} config 业务配置，会通过 metadata 发送给后端
     * @param {Object} initConfig 模型初始化配置（会在收到 model_init_success 后自动发送）
     * @param {boolean} enableAV 是否启用音视频轨道（可选，默认 true）
     */
    async function joinRoom(url, token, mode = 'audio', config = {}, initConfig = null, enableAV = true) {
        // 🔥 开始计时
        const joinStartTime = performance.now();
        const timings = {
            start: joinStartTime,
            roomConnected: 0,
            audioCreated: 0,
            videoCreated: 0,
            tracksPublished: 0,
            completed: 0
        };
        console.log(
            `%c🚀 [LiveKit joinRoom 开始] ${new Date().toLocaleTimeString()}.${Date.now() % 1000}`,
            'color: #00ff00; font-weight: bold; font-size: 16px; background: #000; padding: 4px 8px;'
        );

        // 🔍 【网络预检】在真正连接前进行快速网络测试
        console.log('%c🌐 [预检] 开始网络质量检测...', 'color: #00aaff; font-weight: bold; font-size: 13px;');

        const preCheckStart = performance.now();
        const preCheckResults = {
            在线状态: navigator.onLine ? '✅ 在线' : '❌ 离线',
            网络类型: '未知',
            延迟估计: '未知',
            带宽估计: '未知'
        };

        // 检查网络连接API
        if (navigator.connection) {
            const conn = navigator.connection;
            preCheckResults.网络类型 = conn.effectiveType || '未知';
            preCheckResults.延迟估计 = conn.rtt ? conn.rtt + 'ms' : '未知';
            preCheckResults.带宽估计 = conn.downlink ? conn.downlink + ' Mbps' : '未知';

            // 🔍 根据网络类型给出预警
            if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
                console.warn(
                    '%c⚠️ [预检] 检测到网络质量很差 (2G)，连接可能会很慢！',
                    'color: #ff0000; font-weight: bold; font-size: 14px;'
                );
            } else if (conn.effectiveType === '3g') {
                console.warn('%c⚠️ [预检] 网络质量一般 (3G)，可能影响连接速度', 'color: #ff8800; font-weight: bold;');
            }

            if (conn.rtt && conn.rtt > 500) {
                console.warn(
                    `%c⚠️ [预检] 网络延迟较高 (${conn.rtt}ms)，建议检查网络环境`,
                    'color: #ff8800; font-weight: bold;'
                );
            }

            if (conn.downlink && conn.downlink < 1) {
                console.warn(
                    `%c⚠️ [预检] 下行带宽较低 (${conn.downlink} Mbps)，可能影响音视频质量`,
                    'color: #ff8800; font-weight: bold;'
                );
            }
        }

        console.log('📊 [预检] 网络状态:', preCheckResults);
        console.log(`✅ [预检] 完成 (${(performance.now() - preCheckStart).toFixed(0)}ms)\n`);

        // 清理上次残留
        if (onCleanup) onCleanup();
        state.error = null;
        state.messages = [];
        state.chatMessages = [];
        state.messageIndex = -1;
        // state.status = '';
        state.status = 'initializing'; // 修改：等待模型初始化
        state.remoteTracks = {};
        // 清空远端说话状态
        state.remoteAudioActive = {};
        state.localTracks = [];
        // 清空本地说话状态
        state.localAudioActive = false;
        state.connected = false;
        timer = null;
        state.generateEnd = false;
        state.generateEndTimestamp = 0; // 🔧 重置 generate_end 时间戳
        state.firstInit = true;
        state.modelInitialized = false; // 重置模型初始化状态
        state.initConfig = initConfig; // 🔧 使用传入的初始化配置（避免时序竞争）
        state.muteRemoteAudio = false; // 重置静音状态
        state.playEndSent = false; // 重置 play_end 防护标记
        state.playEndTimestamp = 0;
        state.currentRoundHasAudio = false; // 重置音频标记
        state.mode = mode; // 保存当前通话模式

        silenceTimers.forEach(clearTimeout);
        silenceTimers.clear();
        audioEndConfirmCount.clear(); // 清空确认计数

        // 清除之前的无机器人检测定时器
        if (noRobotTimer) {
            clearTimeout(noRobotTimer);
            noRobotTimer = null;
        }

        // 创建优化的低延迟配置
        const roomOptions = {
            // 禁用自适应流：确保AI模型始终收到高质量视频（不受前端video元素尺寸影响）
            adaptiveStream: false,

            // 禁用动态联播：始终发送视频流
            dynacast: false,

            // 发布默认配置 - 优化音频延迟
            publishDefaults: {
                // 禁用联播：只发送单一高质量层（720p），保证AI视觉理解质量
                simulcast: false,

                // 移除视频联播层配置（已禁用simulcast，不再需要）
                // videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h216],

                // 🔧 优化：优先使用 H.264 编解码器（硬件加速更好，尤其是 Windows）
                // H.264 在大多数设备上都有硬件加速支持，性能优于 VP8
                videoCodec: 'h264',

                // 🔥 关键配置：降级策略 - 优先保持分辨率，牺牲帧率
                // 'maintain-resolution': 弱网时降低帧率，保持分辨率（确保 AI 始终看到清晰画面）
                // 'maintain-framerate': 弱网时降低分辨率，保持帧率（默认，不适合 AI）
                // 'balanced': 平衡降级（默认，可能降低分辨率，不适合 AI）
                degradationPreference: 'maintain-resolution',

                // 🔥 视频编码配置：动态配置会在 publishTrack 时覆盖此默认值
                videoEncoding: {
                    maxBitrate: 2500000, // 最高 2.5Mbps（720p 推荐值）
                    maxFramerate: 30, // 最高 30fps
                    // 🎯 关键：设置最低码率，防止极端弱网时降级到低分辨率
                    minBitrate: 800000 // 最低 800kbps（维持 720p 的最低要求）
                },

                // 音频配置 - 激进低延迟优化
                dtx: false, // 关闭间断传输以减少延迟
                maxPacketTime: 5, // 降低到5ms
                red: false, // 关闭冗余编码减少处理时间
                forceStereo: false,

                // 屏幕共享配置
                screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,

                // SVC 可扩展性模式
                scalabilityMode: 'L3T3_KEY',

                // 备份编解码器策略
                backupCodecPolicy: undefined
            },

            // 视频捕获默认配置（确保满足算法要求 ≥448x448）
            videoCaptureDefaults: {
                resolution: getVideoResolution() // 根据高清模式配置动态获取分辨率
            },

            // 端到端加密配置（默认禁用）
            e2ee: undefined
        };

        // 连接选项 - 优化订阅延迟
        const connectOptions = {
            autoSubscribe: true, // 自动订阅其他参与者的流
            maxRetries: 3, // 最大重试次数
            peerConnectionTimeout: 15000 // 15秒超时
        };

        // 创建房间实例
        const room = new Room(roomOptions);
        state.room = room;

        // ==================== 低延迟音频优化配置 ====================
        //
        // 🎯 问题：WebRTC 默认的 jitter buffer 设置较大（20-200ms），会导致音频延迟高
        //
        // 📊 优化策略：
        // 1. setPlayoutDelay(0) - 设置播放延迟为 0ms（部分浏览器支持）
        // 2. playoutDelayHint = 0 - Chrome 延迟提示（Chrome 支持）
        // 3. jitterBufferTarget = 0 - 直接控制 jitter buffer（Chrome 94+ 最有效）
        //    - 默认值：20-200ms（保守设置，保证流畅但延迟高）
        //    - 优化值：0-20ms（激进设置，大幅降低延迟，可能偶尔卡顿）
        //
        // ⚠️ 注意：设置过低可能导致网络抖动时音频卡顿，但对于实时对话场景，
        //          低延迟比偶尔卡顿更重要。
        //
        // 参考：https://developer.chrome.com/blog/adjustable-playout-delay/
        // ================================================================

        const PLAY_DELAY_MS = 0; // 播放延迟：0ms（激进模式）

        // 打印连接配置
        console.log('=== LiveKit 连接配置 ===');
        console.log('Room Options:', JSON.stringify(roomOptions, null, 2));
        console.log('Connect Options:', JSON.stringify(connectOptions, null, 2));
        console.log('URL:', url);
        console.log('Mode:', mode);
        console.log('Config:', config);

        room.on(RoomEvent.ConnectionStateChanged, connectionState => {
            const timestamp = formatSyncedTimestamp();
            const stateChangeTime = performance.now();
            const timeSinceStart = joinStartTime ? (stateChangeTime - joinStartTime).toFixed(0) : 'N/A';

            console.log(
                `%c🔗 [${timestamp}] Room连接状态变化: ${connectionState} (距离开始: ${timeSinceStart}ms)`,
                'color: #00ccff; font-weight: bold; font-size: 13px; background: #001a33; padding: 2px 6px;'
            );

            // 🔍 【诊断日志】详细记录每个状态
            if (connectionState === 'connecting') {
                console.log(`🔄 [${timestamp}] 正在建立连接... (WebSocket握手中)`);
            } else if (connectionState === 'connected') {
                console.log(
                    `%c✅ [${timestamp}] 房间连接成功！信令通道已建立，开始优化音频处理`,
                    'color: #00ff00; font-weight: bold; font-size: 14px;'
                );

                // 打印WebRTC连接质量信息
                if (room.engine?.client?.pc) {
                    const pc = room.engine.client.pc;
                    console.log('📊 [诊断] PeerConnection 状态:', {
                        connectionState: pc.connectionState,
                        iceConnectionState: pc.iceConnectionState,
                        iceGatheringState: pc.iceGatheringState,
                        signalingState: pc.signalingState
                    });
                }
            } else if (connectionState === 'reconnecting') {
                console.log(`%c🔄 [${timestamp}] 房间重连中... (连接中断)`, 'color: #ff8800; font-weight: bold;');
            } else if (connectionState === 'disconnected') {
                console.log(`%c🚫 [${timestamp}] 房间已断开`, 'color: #ff0000; font-weight: bold;');
            }
        });

        room.on(RoomEvent.Disconnected, reason => {
            const timestamp = formatSyncedTimestamp();
            console.warn(`🚫 [${timestamp}] 房间断开:`, reason);
        });

        // 🔍 【诊断日志】监听 ICE 连接状态变化（用于诊断网络问题）
        if (room.engine?.client?.pc) {
            const pc = room.engine.client.pc;
            const iceStartTime = performance.now();

            // ICE连接状态监听
            pc.addEventListener('iceconnectionstatechange', () => {
                const iceTime = (performance.now() - iceStartTime).toFixed(0);
                const timestamp = formatSyncedTimestamp();
                console.log(
                    `%c🧊 [${timestamp}] ICE连接状态: ${pc.iceConnectionState} (耗时: ${iceTime}ms)`,
                    pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed'
                        ? 'color: #00ff00; font-weight: bold;'
                        : pc.iceConnectionState === 'failed'
                          ? 'color: #ff0000; font-weight: bold;'
                          : 'color: #ffaa00;'
                );

                if (pc.iceConnectionState === 'checking') {
                    console.log('🔍 [诊断] 正在检查ICE候选... (尝试建立P2P连接)');
                } else if (pc.iceConnectionState === 'connected') {
                    console.log('✅ [诊断] ICE连接成功！媒体流可以传输');

                    // 检查是否使用了TURN服务器
                    pc.getStats()
                        .then(stats => {
                            const candidatePairs = [];
                            const localCandidates = new Map();
                            const remoteCandidates = new Map();

                            stats.forEach(report => {
                                if (report.type === 'local-candidate') {
                                    localCandidates.set(report.id, report);
                                } else if (report.type === 'remote-candidate') {
                                    remoteCandidates.set(report.id, report);
                                } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                                    candidatePairs.push(report);
                                }
                            });

                            if (candidatePairs.length > 0) {
                                const activePair = candidatePairs[0];
                                const localCandidate = localCandidates.get(activePair.localCandidateId);
                                const remoteCandidate = remoteCandidates.get(activePair.remoteCandidateId);

                                console.log('📊 [诊断] ICE连接详情:', {
                                    本地候选: localCandidate
                                        ? {
                                              类型: localCandidate.candidateType, // host/srflx/relay
                                              协议: localCandidate.protocol,
                                              地址: localCandidate.address || localCandidate.ip,
                                              端口: localCandidate.port
                                          }
                                        : '未知',
                                    远程候选: remoteCandidate
                                        ? {
                                              类型: remoteCandidate.candidateType,
                                              协议: remoteCandidate.protocol,
                                              地址: remoteCandidate.address || remoteCandidate.ip,
                                              端口: remoteCandidate.port
                                          }
                                        : '未知',
                                    连接类型:
                                        localCandidate?.candidateType === 'relay' ||
                                        remoteCandidate?.candidateType === 'relay'
                                            ? '🔄 TURN中继 (网络受限，延迟较高)'
                                            : localCandidate?.candidateType === 'srflx' ||
                                                remoteCandidate?.candidateType === 'srflx'
                                              ? '🌐 STUN穿透 (NAT环境，延迟正常)'
                                              : '⚡ 直连 (局域网，延迟最低)',
                                    往返延迟: activePair.currentRoundTripTime
                                        ? (activePair.currentRoundTripTime * 1000).toFixed(0) + 'ms'
                                        : '未知'
                                });

                                // ⚠️ 如果使用TURN中继，给出警告
                                if (
                                    localCandidate?.candidateType === 'relay' ||
                                    remoteCandidate?.candidateType === 'relay'
                                ) {
                                    console.warn(
                                        '%c⚠️ [诊断] 检测到使用TURN中继连接！这会增加延迟，可能是因为:',
                                        'color: #ff8800; font-weight: bold; font-size: 14px;'
                                    );
                                    console.warn('   1. 设备处于严格的NAT/防火墙环境');
                                    console.warn('   2. 公司网络限制了P2P连接');
                                    console.warn('   3. 代理服务器拦截了UDP流量');
                                    console.warn('   建议: 检查网络环境、防火墙设置、代理配置');
                                }
                            }
                        })
                        .catch(err => {
                            console.warn('⚠️ [诊断] 无法获取ICE统计信息:', err);
                        });
                } else if (pc.iceConnectionState === 'failed') {
                    console.error('❌ [诊断] ICE连接失败！无法建立媒体流连接');
                    console.error('可能原因: 防火墙阻止、网络不通、TURN服务器不可用');
                }
            });

            // ICE候选收集状态监听
            pc.addEventListener('icegatheringstatechange', () => {
                const timestamp = formatSyncedTimestamp();
                console.log(`%c🧊 [${timestamp}] ICE候选收集状态: ${pc.iceGatheringState}`, 'color: #00aaff;');

                if (pc.iceGatheringState === 'gathering') {
                    console.log('🔍 [诊断] 正在收集ICE候选... (发现可用的网络路径)');
                } else if (pc.iceGatheringState === 'complete') {
                    const gatherTime = (performance.now() - iceStartTime).toFixed(0);
                    console.log(`✅ [诊断] ICE候选收集完成 (耗时: ${gatherTime}ms)`);
                }
            });

            // 监听ICE候选
            let candidateCount = 0;
            pc.addEventListener('icecandidate', event => {
                if (event.candidate) {
                    candidateCount++;
                    const candidate = event.candidate;
                    console.log(`🧊 [诊断] 发现ICE候选 #${candidateCount}:`, {
                        类型: candidate.type || '未知',
                        协议: candidate.protocol,
                        地址: candidate.address || '未知',
                        端口: candidate.port || '未知',
                        优先级: candidate.priority
                    });
                }
            });
        }

        // 新增：监听轨道静音/取消静音事件以优化状态切换
        room.on(RoomEvent.TrackMuted, (track, participant) => {
            if (track.kind === 'audio') {
                const timestamp = formatSyncedTimestamp();
                console.log(`🔇 [${timestamp}] 音频轨道静音:`, {
                    trackSid: track.sid,
                    participantSid: participant.sid,
                    participantIdentity: participant.identity
                });
            }
        });

        room.on(RoomEvent.TrackUnmuted, (track, participant) => {
            if (track.kind === 'audio') {
                const timestamp = formatSyncedTimestamp();
                console.log(`🔊 [${timestamp}] 音频轨道取消静音:`, {
                    trackSid: track.sid,
                    participantSid: participant.sid,
                    participantIdentity: participant.identity
                });
                // 某些情况下取消静音即代表首包可播放
                markFirstPacket(participant);
            }
        });

        // 监听远端轨道发布/取消发布 - 优化版本
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            const sid = participant.sid;
            const subscribeTime = performance.now();
            const timestamp = formatSyncedTimestamp();

            console.log(`%c📥 [轨道订阅] ${track.kind}`, 'color: #00ccff; font-weight: bold; font-size: 13px', {
                轨道类型: track.kind,
                轨道SID: track.sid,
                参与者SID: sid,
                参与者身份: participant.identity,
                订阅时间戳: subscribeTime.toFixed(2) + 'ms',
                墙上时钟: timestamp,
                publication: {
                    muted: publication?.isMuted,
                    subscribed: publication?.isSubscribed
                }
            });

            if (!state.remoteTracks[sid]) {
                state.remoteTracks[sid] = [];
                subscribeParticipant(participant);
            }
            state.remoteTracks[sid].push(track);

            // 音频轨道的特殊处理 - 激进优化
            if (track.kind === 'audio') {
                // 设置极低的播放延迟
                if (typeof track.setPlayoutDelay === 'function') {
                    track.setPlayoutDelay(PLAY_DELAY_MS);
                }

                // 尝试设置延迟提示 (Chrome 支持)
                if (track.playoutDelayHint !== undefined) {
                    track.playoutDelayHint = 0; // 20ms
                }

                // 🔥 关键优化：设置 jitter buffer 目标延迟（Chrome 94+）
                // 这是直接控制 WebRTC jitter buffer 大小的最有效方法
                try {
                    // 方法1：尝试从 LiveKit publication 获取 receiver
                    let receiver = null;

                    // LiveKit 的 RemoteTrackPublication 可能有 audioTrack 属性
                    if (publication && publication.audioTrack) {
                        receiver = publication.audioTrack.receiver;
                    }

                    // 方法2：如果方法1失败，尝试从 RTCPeerConnection 获取
                    if (!receiver && state.room?.engine?.client) {
                        const pc = state.room.engine.client.pc;
                        if (pc && pc.getReceivers) {
                            const receivers = pc.getReceivers();
                            // 找到对应的音频 receiver
                            receiver = receivers.find(r => r.track && r.track.id === track.mediaStreamTrack?.id);
                        }
                    }

                    if (receiver && typeof receiver.jitterBufferTarget !== 'undefined') {
                        // 设置为极低的 jitter buffer 目标（0-50ms，推荐 0-20ms）
                        // 0 表示让浏览器使用最小可能值（通常是 0-20ms）
                        receiver.jitterBufferTarget = 0;
                        console.log(`%c🎯 [Jitter Buffer 优化]`, 'color: #ff0000; font-weight: bold; font-size: 14px', {
                            轨道SID: track.sid,
                            参与者SID: sid,
                            jitterBufferTarget: receiver.jitterBufferTarget + 'ms',
                            说明: '已设置为最小值，大幅降低音频缓冲延迟（50-200ms -> 0-20ms）'
                        });
                    } else {
                        console.warn(`⚠️ [Jitter Buffer] 浏览器不支持 jitterBufferTarget API`, {
                            receiver: !!receiver,
                            hasProperty: receiver ? typeof receiver.jitterBufferTarget : 'N/A',
                            浏览器: navigator.userAgent.substring(0, 100)
                        });
                    }
                } catch (error) {
                    console.error('❌ 设置 jitterBufferTarget 失败:', error);
                }

                // 如果当前处于静音状态（打断后），静音该音频轨道
                if (state.muteRemoteAudio) {
                    track.setMuted(true);
                    console.log(`🔇 [${timestamp}] 音频轨道已订阅但被静音（打断状态）:`, {
                        trackSid: track.sid,
                        participantSid: sid
                    });
                }

                // 立即尝试attach到已存在的audio元素
                if (onTrackSubscribed) {
                    onTrackSubscribed(track, participant);
                }

                // 获取 jitterBufferTarget 值用于日志
                let jitterBufferValue = '未知';
                try {
                    let receiver = null;
                    if (publication && publication.audioTrack) {
                        receiver = publication.audioTrack.receiver;
                    }
                    if (!receiver && state.room?.engine?.client) {
                        const pc = state.room.engine.client.pc;
                        if (pc && pc.getReceivers) {
                            const receivers = pc.getReceivers();
                            receiver = receivers.find(r => r.track && r.track.id === track.mediaStreamTrack?.id);
                        }
                    }
                    if (receiver && typeof receiver.jitterBufferTarget !== 'undefined') {
                        jitterBufferValue = receiver.jitterBufferTarget + 'ms ✅';
                    } else {
                        jitterBufferValue = '不支持 ⚠️';
                    }
                } catch (e) {
                    jitterBufferValue = '获取失败';
                }

                console.log(`%c🎧 [音频配置]`, 'color: #9d00ff; font-weight: bold; font-size: 13px', {
                    轨道SID: track.sid,
                    参与者SID: sid,
                    播放延迟设置: PLAY_DELAY_MS + 'ms',
                    延迟提示: track.playoutDelayHint,
                    jitterBufferTarget: jitterBufferValue,
                    是否静音: state.muteRemoteAudio,
                    MediaStreamTrack状态: {
                        enabled: track.mediaStreamTrack?.enabled,
                        muted: track.mediaStreamTrack?.muted,
                        readyState: track.mediaStreamTrack?.readyState
                    }
                });
            }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, _, participant) => {
            const sid = participant.sid;
            if (state.remoteTracks[sid]) {
                state.remoteTracks[sid] = state.remoteTracks[sid].filter(t => t !== track);
                if (!state.remoteTracks[sid].length) {
                    delete state.remoteTracks[sid];
                    delete state.remoteAudioActive[sid];
                }
            }
            // if (track.kind === 'audio') {
            //     // 删除说话状态
            //     delete state.remoteAudioActive[sid];
            // }
            // 通知组件清理对应 <audio>
            if (onCleanup) onCleanup([sid]);
        });
        room.on(RoomEvent.ParticipantDisconnected, participant => {
            const sid = participant.sid;
            delete state.remoteTracks[sid];
            delete state.remoteAudioActive[sid];
            if (onCleanup) onCleanup([sid]);
        });

        // 监听 DataChannel 消息（改为处理文本消息）
        room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
            try {
                // 解码二进制数据为文本
                const message = new TextDecoder().decode(payload);

                console.log('📨 收到 DataChannel 消息:', {
                    from: participant?.identity || participant?.sid,
                    kind,
                    topic,
                    message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
                    messageLength: message.length
                });

                // 处理文本消息
                handleChatMessage(
                    {
                        id: `${participant?.sid}-${Date.now()}`,
                        timestamp: Date.now(),
                        message: message
                    },
                    participant
                );
            } catch (error) {
                console.error('❌ 解码 DataChannel 消息失败:', error);
            }
        });

        // 注意：如果后端改用 publish_data，下面的事件监听可以移除
        // 保留是为了向后兼容（如果后端还支持 stream_text）
        room.on(RoomEvent.ChatMessage, handleChatMessage);
        room.registerTextStreamHandler('lk.chat', async (reader, participant) => {
            try {
                const info = reader.info;
                const payload = await reader.readAll();
                handleChatMessage(
                    {
                        id: info.id,
                        timestamp: info.timestamp,
                        message: payload
                    },
                    room.getParticipantByIdentity(participant?.identity)
                );

                if (!info.size) {
                    console.log('text stream finished');
                }
                console.log('final info including close extensions', reader.info);
            } catch (error) {
                const message = error?.message || '';
                if (message.includes('DataStreamError') || message.includes('unexpectedly disconnected')) {
                    console.warn('⚠️ 文本流中断（参与者断开）:', message);
                    return;
                }
                console.error('❌ 读取文本流失败:', error);
            }
        });
        async function handleChatMessage(msg, participant) {
            console.log('chatmessages: ', JSON.parse(JSON.stringify(state.chatMessages)), state.messageIndex);
            console.log('%c返回聊天数据：' + msg.message, 'color: red; font-size: 30px');
            // 过滤后端测试信息，避免进入聊天列表
            if (msg.message && msg.message.includes('发送首响音频成功')) {
                console.log('🧪 已过滤测试消息: 发送首响音频成功');
                return;
            }
            if (msg.message.includes('<state><audio_start>')) {
                console.log('%c返回聊天数据11111：' + formatSyncedTimestamp(), 'color: red; font-size: 30px');
            }

            // 处理模型初始化成功
            if (msg.message.includes('<state><model_init_success>')) {
                console.log('🎉 收到模型初始化成功信号', state.initConfig);
                state.modelInitialized = true;
                state.status = 'initializing'; // 🔧 修正：应该是 initializing 而不是 connecting

                // 🔥🔥🔥 新方案：收到 model_init_success 后才发布轨道
                // 核心思路：先采集（已完成） → 等信号（现在） → 再发布（马上做）

                // 操作1：发送 initConfig
                if (state.initConfig) {
                    console.log(
                        '%c📤 [新方案] 发送 initConfig（后端将返回 session_init）',
                        'color: #00ffff; font-weight: bold; font-size: 14px; background: #003366; padding: 4px 8px;'
                    );
                    console.log('📤 发送初始化配置:', JSON.stringify(state.initConfig));
                    sendText(JSON.stringify(state.initConfig));
                    state.initConfig = null;
                    console.log('✅ initConfig 已发送，等待后端返回 <state><session_init> 信号');
                } else {
                    console.log('ℹ️ 没有 initConfig 需要发送（可能已在之前发送）');
                }

                // 操作2：发布已采集的轨道（与操作1同时进行）
                if (state.room && state.localTracks && state.localTracks.length > 0) {
                    // 🔥 检查哪些轨道还未发布（避免重复发布）
                    const unpublishedTracks = state.localTracks.filter(track => {
                        const publications = Array.from(state.room.localParticipant.trackPublications.values());

                        // 🔥 修复：刚创建的轨道sid为undefined，需要更可靠的判断方式
                        // 1. 如果轨道有sid，检查是否已在publications中
                        if (track.sid) {
                            const isPublished = publications.some(pub => pub.track?.sid === track.sid);
                            return !isPublished;
                        }

                        // 2. 如果轨道没有sid（刚创建），检查是否有相同kind和mediaStreamTrack.id的已发布轨道
                        const mediaTrackId = track.mediaStreamTrack?.id;
                        if (mediaTrackId) {
                            const isPublished = publications.some(
                                pub => pub.track?.mediaStreamTrack?.id === mediaTrackId
                            );
                            return !isPublished;
                        }

                        // 3. 如果以上都不满足，认为未发布（更安全）
                        return true;
                    });

                    console.log(
                        `🔍 [发布检查] 本地轨道总数: ${state.localTracks.length}, 已发布: ${state.localTracks.length - unpublishedTracks.length}, 待发布: ${unpublishedTracks.length}`
                    );

                    if (unpublishedTracks.length === 0) {
                        console.log('ℹ️ 所有轨道已发布，无需重复发布');
                        return;
                    }

                    console.log(
                        `%c🚀 [新方案] 开始发布已采集的轨道（${unpublishedTracks.length}/${state.localTracks.length}）...`,
                        'color: #00ff00; font-weight: bold; font-size: 14px; background: #003300; padding: 4px 8px;'
                    );

                    // 🔥 关键诊断：检查待发布轨道的详情
                    console.log(
                        '%c🔍 [发布前诊断] 待发布轨道列表:',
                        'color: #ffff00; font-weight: bold; font-size: 13px;'
                    );
                    unpublishedTracks.forEach((track, index) => {
                        console.log(`待发布轨道 ${index + 1}:`, {
                            kind: track.kind,
                            sid: track.sid,
                            enabled: track.isEnabled,
                            mediaStreamTrack: {
                                id: track.mediaStreamTrack?.id,
                                readyState: track.mediaStreamTrack?.readyState,
                                label: track.mediaStreamTrack?.label
                            }
                        });
                    });

                    // 🔥 验证：如果是video模式但没有视频轨道，发出严重警告
                    const hasVideoTrack = unpublishedTracks.some(t => t.kind === 'video');
                    const hasAudioTrack = unpublishedTracks.some(t => t.kind === 'audio');

                    console.log(
                        `📊 待发布轨道统计: 音频=${hasAudioTrack ? '✅' : '❌'}, 视频=${hasVideoTrack ? '✅' : '❌'}`
                    );

                    if (state.mode === 'video' && !hasVideoTrack) {
                        console.error(
                            '%c❌❌❌ [严重错误] video模式但没有视频轨道要发布！',
                            'color: #ff0000; font-weight: bold; font-size: 16px; background: #ffff00; padding: 8px;'
                        );
                        console.error('state.localTracks内容:', state.localTracks);
                        console.error('unpublishedTracks内容:', unpublishedTracks);
                        console.error('请向上滚动查看视频轨道创建过程，看是否有错误');
                    }

                    // 根据设备性能获取编码配置
                    const performanceLevel = detectDevicePerformance();
                    let encodingConfig;

                    switch (performanceLevel) {
                        case 'low':
                            encodingConfig = {
                                maxBitrate: 1000000,
                                maxFramerate: 20,
                                minBitrate: 300000
                            };
                            console.log('📉 低配置编码: 1Mbps@20fps');
                            break;
                        case 'standard':
                            encodingConfig = {
                                maxBitrate: 1500000,
                                maxFramerate: 24,
                                minBitrate: 500000
                            };
                            console.log('📊 标准配置编码: 1.5Mbps@24fps');
                            break;
                        case 'high':
                        default:
                            encodingConfig = {
                                maxBitrate: 2500000,
                                maxFramerate: 30,
                                minBitrate: 800000
                            };
                            console.log('📈 高配置编码: 2.5Mbps@30fps');
                            break;
                    }

                    // 发布未发布的轨道
                    for (const track of unpublishedTracks) {
                        try {
                            if (track.kind === 'video') {
                                // 🔥 关键修复：发布视频前确保video元素已就绪
                                if (localVideoElement) {
                                    const currentReadyState = localVideoElement.readyState;
                                    console.log(`📹 [发布前检查] video元素readyState: ${currentReadyState}`);

                                    // readyState状态说明：
                                    // 0 = HAVE_NOTHING - 没有数据
                                    // 1 = HAVE_METADATA - 只有元数据
                                    // 2 = HAVE_CURRENT_DATA - 当前位置有数据
                                    // 3 = HAVE_FUTURE_DATA - 当前和未来位置都有数据
                                    // 4 = HAVE_ENOUGH_DATA - 有足够数据可播放

                                    if (currentReadyState < 2) {
                                        console.warn(
                                            `⚠️ video元素未就绪(readyState=${currentReadyState})，等待加载...`
                                        );

                                        // 等待video元素就绪，最多等待3秒
                                        await new Promise(resolve => {
                                            const startTime = Date.now();
                                            const checkReady = () => {
                                                if (localVideoElement.readyState >= 2) {
                                                    console.log(
                                                        `✅ video元素已就绪(readyState=${localVideoElement.readyState})，继续发布`
                                                    );
                                                    resolve();
                                                } else if (Date.now() - startTime > 3000) {
                                                    console.warn(
                                                        `⚠️ video元素等待超时(readyState=${localVideoElement.readyState})，强制继续发布`
                                                    );
                                                    resolve();
                                                } else {
                                                    setTimeout(checkReady, 100);
                                                }
                                            };
                                            checkReady();
                                        });
                                    } else {
                                        console.log(`✅ video元素已就绪(readyState=${currentReadyState})，可以发布`);
                                    }
                                }

                                await state.room.localParticipant.publishTrack(track, {
                                    videoEncoding: encodingConfig,
                                    degradationPreference: 'maintain-resolution'
                                });
                                console.log(
                                    `%c🎥 [视频轨道] 已发布，开始发送视频数据（${performanceLevel}性能模式）`,
                                    'color: #00ff00; font-weight: bold; font-size: 13px; background: #003300; padding: 2px 6px;'
                                );
                            } else if (track.kind === 'audio') {
                                await state.room.localParticipant.publishTrack(track);
                                console.log(
                                    '%c🎤 [音频轨道] 已发布，开始发送音频数据',
                                    'color: #00ff00; font-weight: bold; font-size: 13px; background: #003300; padding: 2px 6px;'
                                );
                            }
                        } catch (error) {
                            console.error(`❌ 发布${track.kind}轨道失败:`, error);
                        }
                    }

                    console.log(
                        `%c✅ [新方案] 已发布 ${unpublishedTracks.length} 个轨道，开始发送音视频数据到后端`,
                        'color: #00ff00; font-weight: bold; font-size: 14px; background: #003300; padding: 4px 8px;'
                    );
                } else {
                    console.log('ℹ️ 没有需要发布的轨道');
                }
                return;
            }

            // 处理模型初始化失败
            if (msg.message.includes('<state><model_init_failed>')) {
                console.error('❌ 模型初始化失败');
                state.modelInitialized = false;
                state.status = 'init_failed';
                return;
            }

            if (msg.message.includes('<state><session_init>') && state.firstInit) {
                // 模型完成初始化
                state.status = 'listening';
                state.generateEnd = false; // 重置生成结束状态
                state.generateEndTimestamp = 0; // 🔧 重置 generate_end 时间戳
                console.log('🔄 收到 session_init，状态切换为 listening');
                state.firstInit = false;
                localStorage.setItem('initStatus', 'done');
            } else if (msg.message.includes('<state><vad_end>')) {
                state.status = 'thinking';
                console.log(
                    `%c🤔 [${formatSyncedTimestamp()}] 收到 vad_end，状态切换为 thinking`,
                    'color: #ffaa00; font-weight: bold; font-size: 16px; background: #1a1a1a; padding: 4px 8px;'
                );

                // 重置 play_end 防护标记，允许新一轮对话的音频播放
                state.playEndSent = false;
                state.playEndTimestamp = 0;
                state.generateEnd = false; // 🔥 重置生成结束标记，避免旧标记干扰新轮次
                state.generateEndTimestamp = 0; // 🔧 重置 generate_end 时间戳
                console.log('🔄 收到 vad_end，重置 play_end 防护标记和 generateEnd 标记');

                // 如果之前被打断导致静音，现在解除静音，允许下一轮对话播放音频
                if (state.muteRemoteAudio) {
                    state.muteRemoteAudio = false;
                    console.log('🔊 收到 vad_end，解除远端音频静音，允许下一轮对话播放');

                    // 取消所有当前音频轨道的静音
                    for (const sid in state.remoteTracks) {
                        for (const track of state.remoteTracks[sid]) {
                            if (track.kind === 'audio') {
                                track.setMuted(false);
                                console.log(`🔊 取消静音音频轨道: ${track.sid}`);
                            }
                        }
                    }
                }
            } else if (msg.message.includes('<state><generate_start>')) {
                // 不在这里切换到 talking，等待 audio_start
                state.messageIndex++;
                state.chatMessages.push({
                    type: 'robot',
                    text: ''
                });

                // 🔧 限制 chatMessages 长度，防止内存泄漏
                if (state.chatMessages.length > MAX_CHAT_MESSAGES) {
                    const removed = state.chatMessages.splice(0, state.chatMessages.length - MAX_CHAT_MESSAGES);
                    console.log(
                        `🧹 自动清理旧的聊天消息: ${removed.length} 条，当前保留: ${state.chatMessages.length}`
                    );
                    // 更新 messageIndex
                    state.messageIndex = state.chatMessages.length - 1;
                }

                state.generateEnd = false; // 重置生成结束状态
                state.generateEndTimestamp = 0; // 🔧 重置 generate_end 时间戳
                state.currentRoundHasAudio = false; // 重置音频标记
                console.log(
                    `%c📝 [${formatSyncedTimestamp()}] 收到 generate_start，开始生成回答 (重置 generateEnd=false, currentRoundHasAudio=false)`,
                    'color: #00bfff; font-weight: bold; font-size: 16px; background: #1a1a1a; padding: 4px 8px;'
                );
                // 新开一轮，记录生成开始时间
                state.audioRounds.push({
                    round: state.audioRounds.length,
                    participantSid: undefined,
                    generateStartAt: performance.now(),
                    audioStartSignalAt: undefined,
                    firstPacketAt: undefined,
                    firstPlayAt: undefined,
                    deltas: {}
                });

                // 🔧 限制 audioRounds 长度，防止内存泄漏
                if (state.audioRounds.length > MAX_AUDIO_ROUNDS) {
                    const removed = state.audioRounds.shift();
                    console.log(
                        `🧹 自动清理最旧的音频轮次 (round ${removed.round})，当前保留: ${state.audioRounds.length}`
                    );
                }

                state.pendingRoundIndex = state.audioRounds.length - 1;
            } else if (msg.message.includes('<state><audio_start>')) {
                // 收到音频开始信号，提前将状态切为 talking，避免首帧说话时 UI 滞后
                state.currentRoundHasAudio = true; // 标记有音频
                const prevStatus = state.status || '空';
                if (['thinking', 'connecting', 'initializing', ''].includes(state.status)) {
                    state.status = 'talking';
                    console.log(`▶️ audio_start 提前切换状态 ${prevStatus} → talking`);
                } else {
                    console.log('🔊 收到 audio_start，标记本轮有音频，等待实际音频播放检测...');
                }
                if (state.pendingRoundIndex >= 0) {
                    const round = state.audioRounds[state.pendingRoundIndex];
                    if (!round.audioStartSignalAt) round.audioStartSignalAt = performance.now();
                }
            } else if (msg.message.includes('<state><generate_end>')) {
                // 单轮对话结束，标记生成结束
                state.generateEnd = true;
                state.generateEndTimestamp = performance.now(); // 🔧 记录 generate_end 接收时间
                console.log(
                    `%c✅✅✅ [${formatSyncedTimestamp()}] 🚨 收到 generate_end，标记生成结束 🚨`,
                    'color: #00ff00; font-weight: bold; font-size: 20px; background: #ff0000; padding: 10px; border: 3px solid #ffff00;'
                );
                console.log(
                    `%c━━━━━━━━━━━━━━━━━━━━━━ GENERATE_END 已收到 ━━━━━━━━━━━━━━━━━━━━━━`,
                    'color: #00ff00; font-weight: bold; font-size: 16px;'
                );

                // 🔥 打断保护：如果处于打断状态，忽略 generate_end 信号
                if (state.muteRemoteAudio) {
                    console.log(
                        `%c🚫 [${formatSyncedTimestamp()}] 收到 generate_end 但处于打断状态，忽略该信号（等待 vad_end）`,
                        'color: #ff6600; font-weight: bold; font-size: 16px; background: #1a1a1a; padding: 4px 8px;',
                        {
                            muteRemoteAudio: state.muteRemoteAudio,
                            currentStatus: state.status,
                            说明: '打断后的消息应该被丢弃，直到收到下一个 vad_end'
                        }
                    );
                    return; // 直接返回，不处理任何 generate_end 逻辑
                }

                // // 临时逻辑，由于视频通话模式下，模型没有返回音频，前端无法准确判断音频播放状态，所有手动将音频播放设置为结束
                // if (mode === 'video') {
                //     sendPlayEnd('视频模式，无音频播放');
                //     console.log('🔄 video通话模式下，手动将音频播放设置为结束');
                //     return; // 视频模式直接返回，不执行后续逻辑
                // }

                // 🔥 关键优化：检测空轮次（generate_start 后立即 generate_end，没有音频）
                console.log(
                    `%c🔍 [${formatSyncedTimestamp()}] 检查空轮次条件:`,
                    'color: #ffaa00; font-weight: bold; font-size: 14px;',
                    {
                        currentRoundHasAudio: state.currentRoundHasAudio,
                        status: state.status,
                        是否为空轮次: !state.currentRoundHasAudio && state.status === 'thinking'
                    }
                );
                if (!state.currentRoundHasAudio && state.status === 'thinking') {
                    console.warn(
                        `%c⚠️ [${formatSyncedTimestamp()}] 检测到空轮次（无音频），直接发送 play_end`,
                        'color: orange; font-weight: bold; font-size: 14px',
                        {
                            currentStatus: state.status,
                            hasAudio: state.currentRoundHasAudio,
                            generateEnd: state.generateEnd,
                            说明: '后端发送 generate_start 后立即发送 generate_end，没有音频播放'
                        }
                    );
                    state.status = 'listening';
                    sendPlayEnd('空轮次，无音频');
                    return; // 处理完空轮次，直接返回
                }

                // 🔥 优化：立即检查音频播放状态，无需等待
                const config = getSilenceConfig();
                const someoneTalking = Object.values(state.remoteAudioActive).some(v => v);
                const audioElementsPlaying = checkAudioElementsStatus();

                // 🔧 新增：检测是否有短音频正在播放
                const shortAudioInfo = getShortAudioInfo();

                console.log(`🔍 generate_end立即检查 (${state.mode}模式):`, {
                    someoneTalking,
                    audioElementsPlaying,
                    currentStatus: state.status,
                    hasAudio: state.currentRoundHasAudio,
                    remoteAudioActive: state.remoteAudioActive,
                    mode: state.mode,
                    bufferTime: config.generateEndBuffer + 'ms',
                    shortAudio: shortAudioInfo // 🔧 新增
                });

                if (!someoneTalking && state.status === 'talking') {
                    // 🚀 新逻辑：检查 DOM 播放状态，给予缓冲时间避免延迟音频包误判
                    if (!audioElementsPlaying) {
                        // ⚡ 后端已生成完毕 + 音频未播放，给予缓冲时间（快速响应）
                        console.log(
                            `%c⚡ [${formatSyncedTimestamp()}] generate_end 检测到音频未播放，给予${config.generateEndBuffer}ms缓冲 (${state.mode}模式)...`,
                            'color: #00ffff; font-weight: bold; font-size: 14px'
                        );

                        setTimeout(() => {
                            // 缓冲后再次检查
                            const finalCheck = checkAudioElementsStatus();
                            const finalSpeakingCheck = !Object.values(state.remoteAudioActive).some(v => v);

                            if (finalSpeakingCheck && !finalCheck && state.generateEnd && state.status === 'talking') {
                                state.status = 'listening';
                                sendPlayEnd(
                                    `generate_end：缓冲检测通过（${config.generateEndBuffer}ms, ${state.mode}模式）`
                                );
                                console.log(
                                    `%c✅ [${formatSyncedTimestamp()}] generate_end 缓冲检测通过，切换到 listening`,
                                    'color: #00ff00; font-weight: bold; font-size: 14px'
                                );
                            } else {
                                console.log(`🔄 [${formatSyncedTimestamp()}] generate_end 缓冲后检测到音频仍在播放`);
                            }
                        }, config.generateEndBuffer);
                        return;
                    }

                    // 🔧 新增：如果检测到短音频（<1.5秒），增加额外保护时间
                    if (shortAudioInfo.hasShort && shortAudioInfo.remainingTime > 0) {
                        const extraWaitTime = Math.max(shortAudioInfo.remainingTime, config.minAudioDuration);
                        console.log(
                            `%c⏰ [${formatSyncedTimestamp()}] 检测到短音频，增加保护时间: ${extraWaitTime.toFixed(0)}ms`,
                            'color: #ff9900; font-weight: bold; font-size: 14px',
                            {
                                音频时长: shortAudioInfo.duration?.toFixed(2) + 's',
                                剩余时间: shortAudioInfo.remainingTime?.toFixed(0) + 'ms',
                                保护时间: extraWaitTime.toFixed(0) + 'ms'
                            }
                        );

                        setTimeout(() => {
                            const stillNoSpeaking = !Object.values(state.remoteAudioActive).some(v => v);
                            const audioStillPlaying = checkAudioElementsStatus();

                            if (
                                stillNoSpeaking &&
                                !audioStillPlaying &&
                                state.generateEnd &&
                                state.status === 'talking'
                            ) {
                                state.status = 'listening';
                                sendPlayEnd(`generate_end：短音频播放完成（${extraWaitTime.toFixed(0)}ms后检测）`);
                                console.log(
                                    `%c✅ [${formatSyncedTimestamp()}] 短音频播放完成，切换到 listening`,
                                    'color: #00ff00; font-weight: bold; font-size: 14px'
                                );
                            } else if (audioStillPlaying) {
                                console.log(`🔄 [${formatSyncedTimestamp()}] 短音频保护后仍在播放，继续等待`);
                            }
                        }, extraWaitTime);
                        return;
                    }

                    // DOM 显示还在播放，给予短暂延迟后再次检查
                    console.log(
                        `⏱️ generate_end 检测到音频仍在播放，给予 ${config.safetyDelay}ms 后再次检查 (${state.mode}模式)...`
                    );

                    setTimeout(() => {
                        const stillNoSpeaking = !Object.values(state.remoteAudioActive).some(v => v);
                        const audioStillPlaying = checkAudioElementsStatus();

                        if (stillNoSpeaking && state.generateEnd && state.status === 'talking') {
                            if (!audioStillPlaying) {
                                // 延迟检查通过，发送 play_end
                                state.status = 'listening';
                                sendPlayEnd(
                                    `generate_end：音频已播完（${config.safetyDelay}ms后检测, ${state.mode}模式）`
                                );
                                console.log('🔄 generate_end延迟检查通过，切换到 listening', formatSyncedTimestamp());
                            } else {
                                // 仍在播放，给予额外最终检查
                                console.log(
                                    `🔄 generate_end 音频仍在播放，给予${config.generateEndBuffer}ms最终检查...`
                                );
                                setTimeout(() => {
                                    if (
                                        !Object.values(state.remoteAudioActive).some(v => v) &&
                                        state.generateEnd &&
                                        state.status === 'talking'
                                    ) {
                                        const finalAudioCheck = checkAudioElementsStatus();
                                        if (!finalAudioCheck) {
                                            state.status = 'listening';
                                            sendPlayEnd(`generate_end：最终检查通过 (${state.mode}模式)`);
                                            console.log('🔄 generate_end最终检查后切换到 listening');
                                        } else {
                                            // 🔧 修复：不要强制切换，而是继续等待静默检查机制处理
                                            console.log(
                                                `%c⚠️ generate_end 检测到音频仍在播放，交由静默检查机制处理`,
                                                'color: orange; font-weight: bold;'
                                            );
                                        }
                                    }
                                }, config.generateEndBuffer);
                            }
                        } else {
                            console.log('🔊 generate_end检查发现状态变化，取消切换');
                        }
                    }, config.safetyDelay);
                } else if (state.status === 'talking') {
                    console.log('🔊 generate_end时检测到音频仍在播放，等待静默检查触发');
                } else {
                    console.log(`⏸️ generate_end时状态非talking（当前: ${state.status}），无需处理`);
                }
            } else if (msg.message.includes('<state><audit_stop>')) {
                // 命中安审规则
                state.chatMessages[state.messageIndex].text = '换一个问题聊吧～';
                state.status = 'forbidden';
                console.log('🚫 收到 audit_stop，状态切换为 forbidden');
            } else if (msg.message.includes('<state><robot_exit>')) {
                // 机器人退出信号
                state.status = 'robot_exit';
                console.log('🚪 收到 robot_exit，机器人已退出，准备挂断通话');
            } else if (msg.message.includes('<state><play_end_success>')) {
                // 收到后端播放结束确认信号
                const timestamp = formatSyncedTimestamp();
                if (state.playEndSent) {
                    // 前端已发送 play_end，收到确认后切换状态
                    state.status = 'listening';
                    // 重置 play_end 防护标记，为下一轮对话做准备
                    state.playEndSent = false;
                    state.playEndTimestamp = 0;
                    console.log(
                        `%c✅ [${timestamp}] 收到 play_end_success，状态切换为 listening，已重置 playEndSent`,
                        'color: #00ff00; font-weight: bold; font-size: 16px; background: #1a1a1a; padding: 4px 8px;'
                    );
                } else {
                    // 前端未发送 play_end，后端却发送了 play_end_success，记录警告
                    console.warn(
                        `%c⚠️ [${timestamp}] 收到 play_end_success 但前端未发送 play_end，忽略此消息`,
                        'color: orange; font-weight: bold; font-size: 14px',
                        {
                            currentStatus: state.status,
                            playEndSent: state.playEndSent,
                            generateEnd: state.generateEnd,
                            说明: '可能是后端误发或时序问题，为防止状态混乱不做处理'
                        }
                    );
                }
            } else if (msg.message.includes('<state><session_break>')) {
                // 收到后端打断成功信号，执行前端打断操作
                const timestamp = formatSyncedTimestamp();
                console.log(`✅ [${timestamp}] 收到 <state><session_break> 信号，开始执行前端打断操作`);
                handleInterfaceBreak();
            } else if (!msg.message.includes('<state>') && !msg.message.includes('您发送的消息是') && msg.message) {
                // 普通聊天消息
                let str = msg.message;
                if (msg.message.includes('<time>') && msg.message.includes('</time>')) {
                    str = msg.message.split('</time>')[1];
                }
                state.chatMessages[state.messageIndex].text += str;
            }
        }

        try {
            const metadataStr = JSON.stringify({ mode, ...config });
            console.log('【LiveKit joinRoom】连接参数', metadataStr);

            // 🔍 【诊断日志】收集环境信息
            console.log(
                '%c🔍 [诊断] 开始收集环境信息...',
                'color: #00ffff; font-weight: bold; font-size: 14px; background: #003366; padding: 4px 8px;'
            );

            const diagnosticInfo = {
                // 时间戳
                timestamp: new Date().toISOString(),
                localTime: new Date().toLocaleString(),

                // 浏览器信息
                browser: {
                    userAgent: navigator.userAgent,
                    vendor: navigator.vendor,
                    language: navigator.language,
                    platform: navigator.platform,
                    cookieEnabled: navigator.cookieEnabled,
                    onLine: navigator.onLine
                },

                // 连接信息
                connection: navigator.connection
                    ? {
                          effectiveType: navigator.connection.effectiveType, // 4g, 3g, 2g, slow-2g
                          downlink: navigator.connection.downlink + ' Mbps', // 下行带宽
                          rtt: navigator.connection.rtt + ' ms', // 往返时间
                          saveData: navigator.connection.saveData
                      }
                    : '不支持 Network Information API',

                // LiveKit 连接配置
                livekit: {
                    url: url,
                    urlHost: new URL(url).host,
                    urlProtocol: new URL(url).protocol,
                    mode: mode,
                    maxRetries: connectOptions.maxRetries,
                    timeout: connectOptions.peerConnectionTimeout + 'ms'
                },

                // 性能信息
                performance: {
                    memory: performance.memory
                        ? {
                              usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
                              totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
                              jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB'
                          }
                        : '不支持 Memory API'
                }
            };

            console.log('📋 环境诊断信息:', diagnosticInfo);

            // 第一步：只 connect，不申请摄像头/麦克风权限
            console.log(
                '%c🔌 [开始连接] 调用 room.connect()...',
                'color: #00ffff; font-weight: bold; font-size: 14px; background: #003366; padding: 4px 8px;'
            );
            const connectStartTime = performance.now();

            // 🔍 【诊断日志】启动连接进度监控（每2秒输出一次进度，帮助判断是否卡住）
            let progressInterval = setInterval(() => {
                const elapsed = performance.now() - connectStartTime;
                console.log(
                    `%c⏳ [连接中] 已等待 ${(elapsed / 1000).toFixed(1)}秒... (当前状态: ${room.state})`,
                    elapsed > 10000
                        ? 'color: #ff0000; font-weight: bold;'
                        : elapsed > 5000
                          ? 'color: #ff8800; font-weight: bold;'
                          : 'color: #00aaff;'
                );

                if (elapsed > 15000) {
                    console.error(
                        '%c❌ [警告] 连接超过15秒仍未完成，可能出现问题！',
                        'color: #ff0000; font-weight: bold; font-size: 14px; background: #330000; padding: 4px 8px;'
                    );
                    console.error('建议操作:');
                    console.error('1. 检查网络连接是否正常');
                    console.error('2. 检查LiveKit服务器URL是否正确');
                    console.error('3. 检查防火墙/代理设置');
                    console.error('4. 尝试刷新页面重新连接');
                }
            }, 2000);

            try {
                await room.connect(url, token, {
                    ...connectOptions,
                    metadata: metadataStr
                });
            } finally {
                // 清除进度监控
                clearInterval(progressInterval);
            }

            const connectEndTime = performance.now();
            const connectDuration = connectEndTime - connectStartTime;

            // 🔥 修复时序问题：连接成功后立即设置 connected = true
            // 这样后端发送的 model_init_success 信号触发的 sendText() 才能正常发送
            state.connected = true;

            // 🔥 计时点1：房间连接完成
            timings.roomConnected = performance.now();

            // 🔍 【诊断日志】分析连接耗时
            let performanceLevel = '快速';
            let performanceColor = '#00ff00';
            if (connectDuration > 5000) {
                performanceLevel = '⚠️ 非常慢';
                performanceColor = '#ff0000';
            } else if (connectDuration > 2000) {
                performanceLevel = '⚠️ 较慢';
                performanceColor = '#ff8800';
            } else if (connectDuration > 1000) {
                performanceLevel = '正常';
                performanceColor = '#ffff00';
            }

            console.log(
                `%c✅ 1/5 [房间连接完成] 耗时: ${(timings.roomConnected - timings.start).toFixed(0)}ms (room.connect耗时: ${connectDuration.toFixed(0)}ms - ${performanceLevel})`,
                `color: ${performanceColor}; font-weight: bold; font-size: 14px; background: #003366; padding: 2px 6px;`
            );

            // 打印连接成功信息
            console.log('=== 连接成功状态 ===');
            console.log('房间名称:', room.name);
            console.log('连接状态:', room.state);
            console.log('本地参与者ID:', room.localParticipant.identity);
            console.log('本地参与者SID:', room.localParticipant.sid);
            console.log('远程参与者数量:', room.remoteParticipants.size);
            console.log('✅ state.connected 已设置为 true，可以发送消息');

            // 第二步：连接成功后才创建本地轨道
            const tracks = [];

            if (enableAV) {
                // 始终创建本地音频轨（显式启用音频约束，防止回声问题）
                const audioTrack = await createLocalAudioTrack({
                    echoCancellation: true, // 🔥 回声消除（防止模型音频被采集）
                    noiseSuppression: true, // 降噪（提升音质）
                    autoGainControl: true, // 自动增益控制（平衡音量）
                    sampleRate: 48000, // 高质量采样率（48kHz）
                    channelCount: 1 // 单声道（对话场景足够，降低带宽）
                });
                tracks.push(audioTrack);
                state.audioEnabled = true;

                // 🔥 计时点2：音频轨道创建完成
                timings.audioCreated = performance.now();
                console.log(
                    `%c🎤 2/5 [音频轨道创建完成] 耗时: ${(timings.audioCreated - timings.roomConnected).toFixed(0)}ms`,
                    'color: #ffff00; font-weight: bold; font-size: 14px; background: #333300; padding: 2px 6px;'
                );

                // 打印音频配置（用于调试）
                const audioSettings = audioTrack.mediaStreamTrack.getSettings();
                console.log('🎤 音频轨道配置:', {
                    echoCancellation: audioSettings.echoCancellation,
                    noiseSuppression: audioSettings.noiseSuppression,
                    autoGainControl: audioSettings.autoGainControl,
                    sampleRate: audioSettings.sampleRate + ' Hz',
                    channelCount: audioSettings.channelCount
                });

                // 如果是 video 模式，则再创建视频轨（不做镜像处理）
                if (mode === 'video') {
                    console.log('🎥 视频轨道创建: 使用原始画面，不做镜像处理');

                    try {
                        // 🔧 优化：综合考虑用户高清模式设置和设备性能
                        const hdMode = localStorage.getItem('hdMode') === 'true';
                        const performanceLevel = detectDevicePerformance();
                        let resolution, targetFrameRate, maxFrameRate;

                        // 优先级：用户高清模式设置 > 设备性能检测
                        if (hdMode) {
                            // 用户开启高清模式
                            if (performanceLevel === 'low') {
                                // 低配置设备：降级到540p以保证流畅度
                                resolution = VIDEO_RESOLUTION_CONFIG.standard;
                                targetFrameRate = 15;
                                maxFrameRate = 20;
                                console.log('📹 高清模式（低配设备降级）: 540p@15fps');
                            } else {
                                // 中高配置设备：使用720p高清
                                resolution = VIDEO_RESOLUTION_CONFIG.high;
                                targetFrameRate = performanceLevel === 'standard' ? 20 : 30;
                                maxFrameRate = performanceLevel === 'standard' ? 24 : 30;
                                console.log('📹 高清模式: 720p@' + targetFrameRate + 'fps');
                            }
                        } else {
                            // 用户关闭高清模式，使用标准或低质量
                            switch (performanceLevel) {
                                case 'low':
                                    // 低配置：480p@15fps
                                    resolution = VIDEO_RESOLUTION_CONFIG.lowPerformance;
                                    targetFrameRate = 15;
                                    maxFrameRate = 20;
                                    console.log('📹 标准模式（低配设备）: 480p@15fps');
                                    break;
                                case 'standard':
                                case 'high':
                                default:
                                    // 中高配置：540p
                                    resolution = VIDEO_RESOLUTION_CONFIG.standard;
                                    targetFrameRate = 20;
                                    maxFrameRate = 24;
                                    console.log('📹 标准模式: 540p@20fps');
                                    break;
                            }
                        }

                        validateResolution(resolution); // 验证是否满足算法要求

                        // 🔧 优化：使用 ideal 约束，避免 iOS 裁剪画面或选择错误的镜头
                        const videoTrack = await createLocalVideoTrackWithReadyCheck({
                            facingMode: { ideal: state.videoFacing }, // 使用 ideal，让 iOS 选择最佳镜头
                            width: { ideal: resolution.width, min: MIN_VIDEO_DIMENSION },
                            height: { ideal: resolution.height, min: MIN_VIDEO_DIMENSION },
                            aspectRatio: { ideal: 16 / 9 }, // 明确 16:9 比例
                            frameRate: { ideal: targetFrameRate, max: maxFrameRate }, // 根据设备性能动态调整
                            // 🔥 关键优化：添加 zoom 约束，防止使用长焦镜头
                            // zoom: 1.0 表示不缩放，避免浏览器选择长焦
                            ...(typeof MediaStreamTrack.prototype.getCapabilities !== 'undefined' && { zoom: 1.0 })
                        });
                        tracks.push(videoTrack);
                        state.videoEnabled = true;

                        // 🔥 计时点3：视频轨道创建完成
                        timings.videoCreated = performance.now();
                        console.log(
                            `%c🎥 3/5 [视频轨道创建完成] 耗时: ${(timings.videoCreated - timings.audioCreated).toFixed(0)}ms`,
                            'color: #ff00ff; font-weight: bold; font-size: 14px; background: #330033; padding: 2px 6px;'
                        );
                    } catch (videoError) {
                        console.error(
                            '%c❌❌❌ 视频轨道创建失败！',
                            'color: #ffffff; font-weight: bold; font-size: 18px; background: #ff0000; padding: 10px;'
                        );
                        console.error('❌ 错误对象:', videoError);
                        console.error('❌ 错误详情:', {
                            name: videoError.name,
                            message: videoError.message,
                            constraint: videoError.constraint,
                            stack: videoError.stack
                        });

                        // 🔥 关键：分析失败原因并给出具体提示
                        let errorMessage = '';
                        if (videoError.name === 'NotAllowedError') {
                            errorMessage = '摄像头权限被拒绝，请在浏览器设置中允许访问摄像头';
                            console.error('❌ 原因: 摄像头权限被拒绝');
                            console.error('💡 解决方法: 请在浏览器地址栏点击锁图标，允许访问摄像头');
                        } else if (videoError.name === 'NotFoundError') {
                            errorMessage = '未找到摄像头设备';
                            console.error('❌ 原因: 未找到摄像头设备');
                            console.error('💡 解决方法: 请确保设备有可用的摄像头');
                        } else if (videoError.name === 'NotReadableError') {
                            errorMessage = '摄像头无法访问，可能被其他应用占用';
                            console.error('❌ 原因: 摄像头被其他应用占用或硬件错误');
                            console.error('💡 解决方法: 请关闭其他正在使用摄像头的应用（如微信、QQ等）');
                        } else if (videoError.name === 'OverconstrainedError') {
                            errorMessage = '摄像头不支持请求的配置';
                            console.error('❌ 原因: 摄像头不支持请求的分辨率/帧率');
                            console.error('💡 解决方法: 尝试降低画质设置');
                        } else {
                            errorMessage = '视频轨道创建失败: ' + videoError.message;
                            console.error('❌ 原因: 未知错误');
                            console.error('💡 建议: 请检查设备和浏览器设置，或尝试刷新页面');
                        }

                        ElMessage({
                            type: 'error',
                            message: errorMessage,
                            duration: 8000,
                            showClose: true
                        });

                        // ⚠️ 继续执行（只使用音频模式）
                        console.warn(
                            '%c⚠️ 将以纯音频模式继续连接（后端将收不到视频流）',
                            'color: #ff8800; font-weight: bold; font-size: 14px; background: #332200; padding: 6px;'
                        );
                        state.videoEnabled = false;
                    }
                }
            } else {
                state.audioEnabled = false;
                state.videoEnabled = false;
            }

            // 🔥🔥🔥 新方案：先采集，不发布（更优雅的方式）
            // 核心原理：createLocalTracks = 打开设备，publishTrack = 发送
            // 只采集不发布，后端完全收不到数据，0网络带宽

            // 保存轨道到 state（用于本地预览和后续发布）
            state.localTracks = tracks;

            // 🔥 计时点4：轨道创建完成（未发布）
            timings.tracksCreated = performance.now();
            console.log(
                `%c📹 3.5/5 [轨道创建完成，未发布] 耗时: ${(timings.tracksCreated - (timings.videoCreated || timings.audioCreated)).toFixed(0)}ms`,
                'color: #00ffff; font-weight: bold; font-size: 14px; background: #003366; padding: 2px 6px;'
            );

            // 打印轨道信息
            console.log('=== 轨道创建成功（仅本地采集，未发送） ===');
            console.log('本地轨道数量:', tracks.length);
            console.log('音频轨道:', tracks.find(t => t.kind === 'audio') ? '已创建（未发布）' : '未创建');
            console.log('视频轨道:', tracks.find(t => t.kind === 'video') ? '已创建（未发布）' : '未创建');

            // 🔥 关键诊断：详细打印轨道信息
            console.log('%c🔍 [轨道诊断] 详细信息:', 'color: #ffff00; font-weight: bold; font-size: 14px;');
            tracks.forEach((track, index) => {
                console.log(`轨道 ${index + 1}:`, {
                    kind: track.kind,
                    enabled: track.isEnabled,
                    muted: track.isMuted,
                    sid: track.sid,
                    mediaStreamTrack: {
                        id: track.mediaStreamTrack?.id,
                        readyState: track.mediaStreamTrack?.readyState,
                        enabled: track.mediaStreamTrack?.enabled,
                        label: track.mediaStreamTrack?.label,
                        settings: track.mediaStreamTrack?.getSettings()
                    }
                });
            });

            // 🔥 验证：检查是否缺少视频轨道
            if (mode === 'video' && !tracks.find(t => t.kind === 'video')) {
                console.error(
                    '%c❌❌❌ [严重错误] video模式但tracks中没有视频轨道！',
                    'color: #ff0000; font-weight: bold; font-size: 16px; background: #ffff00; padding: 4px 8px;'
                );
                console.error('请检查上方是否有"视频轨道创建失败"的错误信息');
                console.error('当前tracks:', tracks);
            }

            // 🔥🔥🔥 关键说明：
            // - 轨道已创建并在本地采集，但未调用 publishTrack
            // - 后端完全收不到数据，0网络带宽
            // - 等待后端发送 <state><model_init_success> 信号
            // - 收到 model_init_success 后，先发送 initConfig，再发布轨道

            // 🔥 修复时序竞争：检查模型是否已经初始化完成
            if (state.modelInitialized) {
                console.log(
                    '%c🎉 模型已初始化，立即发布轨道！',
                    'color: #00ff00; font-weight: bold; font-size: 14px; background: #003300; padding: 4px 8px;'
                );

                // 立即发布轨道
                const performanceLevel = detectDevicePerformance();
                let encodingConfig;

                switch (performanceLevel) {
                    case 'low':
                        encodingConfig = {
                            maxBitrate: 1000000,
                            maxFramerate: 20,
                            minBitrate: 300000
                        };
                        console.log('📉 低配置编码: 1Mbps@20fps');
                        break;
                    case 'standard':
                        encodingConfig = {
                            maxBitrate: 1500000,
                            maxFramerate: 24,
                            minBitrate: 500000
                        };
                        console.log('📊 标准配置编码: 1.5Mbps@24fps');
                        break;
                    case 'high':
                    default:
                        encodingConfig = {
                            maxBitrate: 2500000,
                            maxFramerate: 30,
                            minBitrate: 800000
                        };
                        console.log('📈 高配置编码: 2.5Mbps@30fps');
                        break;
                }

                for (const track of tracks) {
                    try {
                        if (track.kind === 'video') {
                            await state.room.localParticipant.publishTrack(track, {
                                videoEncoding: encodingConfig,
                                degradationPreference: 'maintain-resolution'
                            });
                            console.log(
                                `%c🎥 [视频轨道] 已发布，开始发送视频数据（${performanceLevel}性能模式）`,
                                'color: #00ff00; font-weight: bold; font-size: 13px; background: #003300; padding: 2px 6px;'
                            );
                        } else if (track.kind === 'audio') {
                            await state.room.localParticipant.publishTrack(track);
                            console.log(
                                '%c🎤 [音频轨道] 已发布，开始发送音频数据',
                                'color: #00ff00; font-weight: bold; font-size: 13px; background: #003300; padding: 2px 6px;'
                            );
                        }
                    } catch (error) {
                        console.error(`❌ 发布${track.kind}轨道失败:`, error);
                    }
                }

                console.log(
                    `%c✅ 已发布 ${tracks.length} 个轨道，开始发送音视频数据到后端`,
                    'color: #00ff00; font-weight: bold; font-size: 14px; background: #003300; padding: 4px 8px;'
                );
            } else {
                console.log(
                    '%c⏳ 轨道已创建但未发布，等待后端 model_init_success 信号后再发布...',
                    'color: #ffaa00; font-weight: bold; font-size: 14px; background: #332200; padding: 4px 8px;'
                );
                console.log(
                    `📊 当前状态: modelInitialized=${state.modelInitialized}, initConfig=${!!state.initConfig}, 网络带宽占用: 0`
                );
            }

            // 🔥 自动诊断摄像头（视频模式下）
            if (mode === 'video' && tracks.find(t => t.kind === 'video')) {
                console.log('\n');
                console.log('='.repeat(60));
                console.log('📱 [自动诊断] 开始检测摄像头...');
                console.log('='.repeat(60));

                // 延迟 500ms 确保轨道完全就绪
                setTimeout(async () => {
                    try {
                        // 1. 列出所有摄像头
                        console.log('\n📋 步骤 1/3: 列出所有可用摄像头');
                        const allCameras = await listAllCameras();

                        // 2. 检查当前使用的镜头
                        console.log('\n📋 步骤 2/3: 检查当前使用的镜头');
                        const currentCamera = await checkCurrentCamera();

                        // 3. 自动判断并给出建议
                        console.log('\n📋 步骤 3/3: 自动分析结果');
                        console.log('='.repeat(60));

                        if (currentCamera && currentCamera['🎥 当前摄像头']) {
                            const cameraType = currentCamera['🎥 当前摄像头'].镜头类型;

                            if (
                                cameraType.includes('⚠️') ||
                                cameraType.includes('🔍') ||
                                cameraType.includes('🔬') ||
                                cameraType.includes('📷')
                            ) {
                                console.warn('\n⚠️⚠️⚠️ 检测到问题！⚠️⚠️⚠️');
                                console.warn('当前使用了不推荐的镜头:', cameraType);
                                console.warn('\n💡 解决方案:');
                                console.warn('请将以下信息截图发给技术支持，我们会帮您切换镜头：');
                                console.warn('');
                                console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                console.warn('📱 设备信息:');
                                console.warn('   当前镜头:', cameraType);
                                console.warn(
                                    '   设备型号:',
                                    navigator.userAgent.includes('iPhone')
                                        ? 'iPhone'
                                        : navigator.userAgent.includes('Android')
                                          ? 'Android'
                                          : '未知'
                                );
                                console.warn('   浏览器:', navigator.userAgent.substring(0, 100));
                                console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                console.warn('');

                                // 自动尝试修复（如果在开发环境）
                                const isDevMode =
                                    window.location.hostname === 'localhost' ||
                                    window.location.hostname.includes('127.0.0.1') ||
                                    window.location.hostname.includes('test');

                                if (isDevMode) {
                                    console.warn('🔧 检测到开发环境，尝试自动修复...');
                                    try {
                                        const isAndroid = navigator.userAgent.includes('Android');
                                        const result = await forceLensSelection(isAndroid ? 'main' : 'wide');
                                        if (result.success) {
                                            console.log('✅ 自动修复成功！已切换到推荐镜头');
                                            console.log('请刷新页面重新测试');
                                        }
                                    } catch (fixError) {
                                        console.error('❌ 自动修复失败:', fixError);
                                    }
                                }
                            } else if (cameraType.includes('✅')) {
                                console.log('\n✅✅✅ 诊断通过！✅✅✅');
                                console.log('当前使用的是推荐镜头:', cameraType);
                                console.log('视频质量应该是正常的 👍');
                            } else {
                                console.log('\n⚪ 诊断结果: 未知镜头类型');
                                console.log('如果视频画面有问题，请将诊断信息截图发给技术支持');
                            }
                        }

                        console.log('\n' + '='.repeat(60));
                        console.log('📱 [自动诊断] 完成！');
                        console.log('='.repeat(60));
                        console.log('');
                    } catch (diagError) {
                        console.error('❌ 自动诊断失败:', diagError);
                    }
                }, 500);
            }

            // 启动3分钟无机器人检测定时器
            startNoRobotTimer(room);

            // 🔧 启动视频健康监控（仅在视频模式下）
            if (mode === 'video' && tracks.find(t => t.kind === 'video')) {
                console.log('🏥 启动视频健康监控...');
                startVideoHealthMonitoring();
            }

            // 🔧 启动内存监控（防止内存泄漏）
            console.log('💾 启动内存监控...');
            startMemoryMonitoring();

            // 对已有远端参与者订阅说话事件
            room.remoteParticipants.forEach(subscribeParticipant);
            room.on(RoomEvent.ParticipantConnected, participant => {
                subscribeParticipant(participant);
                // 有远端参与者加入，清除无机器人定时器
                if (noRobotTimer) {
                    console.log('✅ 检测到远端参与者加入，清除无机器人定时器');
                    clearTimeout(noRobotTimer);
                    noRobotTimer = null;
                }
            });

            // 🔥 计时点5：joinRoom 完成
            timings.completed = performance.now();
            const totalTime = timings.completed - timings.start;

            console.log('\n\n');
            console.log(
                '%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'color: #00ff00; font-weight: bold;'
            );
            console.log(
                '%c⏱️  LiveKit 房间加入耗时统计  ⏱️',
                'color: #ffffff; font-weight: bold; font-size: 18px; background: linear-gradient(90deg, #ff0080, #ff8c00, #40e0d0); padding: 10px 20px; border-radius: 5px;'
            );
            console.log(
                '%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'color: #00ff00; font-weight: bold;'
            );

            // 🔍 【诊断日志】分析各阶段耗时并给出建议
            const roomConnectTime = timings.roomConnected - timings.start;
            const audioCreateTime = timings.audioCreated ? timings.audioCreated - timings.roomConnected : 0;
            const videoCreateTime = timings.videoCreated ? timings.videoCreated - timings.audioCreated : 0;
            const publishTime = timings.tracksPublished - (timings.videoCreated || timings.audioCreated);
            const listenerTime = timings.completed - timings.tracksPublished;

            console.log(
                `%c📊 总耗时: ${totalTime.toFixed(0)}ms`,
                'color: #ffff00; font-weight: bold; font-size: 20px; background: #ff0000; padding: 8px 16px; margin: 10px 0;'
            );

            console.log('%c─────────────────────────────────────────────────────────', 'color: #666666;');

            // 1️⃣ 连接房间
            const roomConnectColor =
                roomConnectTime > 5000
                    ? '#ff0000'
                    : roomConnectTime > 2000
                      ? '#ff8800'
                      : roomConnectTime > 1000
                        ? '#ffff00'
                        : '#00ff00';
            console.log(
                `%c1️⃣  连接房间:        ${roomConnectTime.toFixed(0)}ms ${roomConnectTime > 2000 ? '⚠️' : roomConnectTime > 1000 ? '⚡' : '✅'}`,
                `color: ${roomConnectColor}; font-weight: bold; font-size: 14px;`
            );

            // 2️⃣ 创建音频轨道
            const audioCreateColor = audioCreateTime > 1000 ? '#ff8800' : audioCreateTime > 500 ? '#ffff00' : '#00ff00';
            console.log(
                `%c2️⃣  创建音频轨道:    ${timings.audioCreated ? audioCreateTime.toFixed(0) + 'ms' + (audioCreateTime > 1000 ? ' ⚠️' : audioCreateTime > 500 ? ' ⚡' : ' ✅') : '跳过'}`,
                `color: ${audioCreateColor}; font-weight: bold; font-size: 14px;`
            );

            // 3️⃣ 创建视频轨道
            const videoCreateColor =
                videoCreateTime > 2000 ? '#ff8800' : videoCreateTime > 1000 ? '#ffff00' : '#00ff00';
            console.log(
                `%c3️⃣  创建视频轨道:    ${timings.videoCreated ? videoCreateTime.toFixed(0) + 'ms' + (videoCreateTime > 2000 ? ' ⚠️' : videoCreateTime > 1000 ? ' ⚡' : ' ✅') : '跳过'}`,
                `color: ${videoCreateColor}; font-weight: bold; font-size: 14px;`
            );

            // 4️⃣ 发布轨道
            const publishColor = publishTime > 3000 ? '#ff8800' : publishTime > 1500 ? '#ffff00' : '#00ff00';
            console.log(
                `%c4️⃣  发布轨道:        ${publishTime.toFixed(0)}ms ${publishTime > 3000 ? '⚠️' : publishTime > 1500 ? '⚡' : '✅'}`,
                `color: ${publishColor}; font-weight: bold; font-size: 14px;`
            );

            // 5️⃣ 初始化监听器
            console.log(
                `%c5️⃣  初始化监听器:    ${listenerTime.toFixed(0)}ms`,
                'color: #ff8c00; font-weight: bold; font-size: 14px;'
            );

            console.log('%c─────────────────────────────────────────────────────────', 'color: #666666;');

            // 🔍 【诊断建议】根据耗时给出优化建议
            if (roomConnectTime > 5000 || audioCreateTime > 1000 || videoCreateTime > 2000 || publishTime > 3000) {
                console.log(
                    '%c⚠️ 检测到性能问题，以下是优化建议:',
                    'color: #ff8800; font-weight: bold; font-size: 15px; background: #332200; padding: 4px 8px;'
                );

                if (roomConnectTime > 5000) {
                    console.warn(
                        `%c🔴 连接房间耗时过长 (${roomConnectTime.toFixed(0)}ms)`,
                        'color: #ff0000; font-weight: bold;'
                    );
                    console.warn('   可能原因:');
                    console.warn('   1. 网络延迟高 - 检查网络连接质量');
                    console.warn('   2. DNS解析慢 - 尝试更换DNS服务器 (如8.8.8.8)');
                    console.warn('   3. 防火墙/代理拦截 - 检查企业网络设置');
                    console.warn('   4. LiveKit服务器响应慢 - 联系后端检查服务器状态');
                    console.warn('   5. 需要TURN中继 - 查看上方ICE连接详情');
                } else if (roomConnectTime > 2000) {
                    console.warn(
                        `%c🟠 连接房间较慢 (${roomConnectTime.toFixed(0)}ms)`,
                        'color: #ff8800; font-weight: bold;'
                    );
                    console.warn('   建议检查网络环境和LiveKit服务器状态');
                } else if (roomConnectTime > 1000) {
                    console.log(`%c🟡 连接房间耗时正常 (${roomConnectTime.toFixed(0)}ms)`, 'color: #ffff00;');
                }

                if (audioCreateTime > 1000) {
                    console.warn(
                        `%c🟠 音频轨道创建较慢 (${audioCreateTime.toFixed(0)}ms)`,
                        'color: #ff8800; font-weight: bold;'
                    );
                    console.warn('   可能原因:');
                    console.warn('   1. 麦克风权限请求等待用户确认');
                    console.warn('   2. 系统音频设备初始化慢');
                    console.warn('   3. 音频驱动问题');
                }

                if (videoCreateTime > 2000) {
                    console.warn(
                        `%c🟠 视频轨道创建较慢 (${videoCreateTime.toFixed(0)}ms)`,
                        'color: #ff8800; font-weight: bold;'
                    );
                    console.warn('   可能原因:');
                    console.warn('   1. 摄像头权限请求等待用户确认');
                    console.warn('   2. 摄像头初始化慢（硬件性能问题）');
                    console.warn('   3. 视频分辨率/帧率设置过高');
                    console.warn('   4. 多个应用占用摄像头');
                }

                if (publishTime > 3000) {
                    console.warn(
                        `%c🟠 轨道发布较慢 (${publishTime.toFixed(0)}ms)`,
                        'color: #ff8800; font-weight: bold;'
                    );
                    console.warn('   可能原因:');
                    console.warn('   1. 上传带宽不足');
                    console.warn('   2. 等待视频首帧超时');
                    console.warn('   3. ICE协商时间长');
                }

                console.log('%c─────────────────────────────────────────────────────────', 'color: #666666;');
            } else {
                console.log(
                    '%c✅ 所有阶段耗时正常，性能良好！',
                    'color: #00ff00; font-weight: bold; font-size: 14px; background: #003300; padding: 4px 8px;'
                );
                console.log('%c─────────────────────────────────────────────────────────', 'color: #666666;');
            }

            console.log(
                `%c✅ 完成时间: ${new Date().toLocaleTimeString()}.${Date.now() % 1000}`,
                'color: #00ff00; font-weight: bold; font-size: 14px;'
            );
            console.log(
                '%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'color: #00ff00; font-weight: bold;'
            );

            // 🔍 【性能基准对比】与正常值对比
            console.log('\n');
            console.log(
                '%c📊 性能基准对比 (当前 vs 正常值)',
                'color: #ffffff; font-weight: bold; font-size: 15px; background: #0066cc; padding: 4px 8px;'
            );
            console.log('%c─────────────────────────────────────────────────────────', 'color: #666666;');

            // 定义正常值基准（基于你自己的测试数据）
            const benchmark = {
                total: 3000, // 总耗时: 3000ms
                roomConnect: 400, // 连接房间: 300-500ms
                audioCreate: 200, // 创建音频: ~200ms
                videoCreate: 500, // 创建视频: ~500ms
                publish: 2000 // 发布轨道: ~2000ms
            };

            // 计算偏差比例
            const totalRatio = (totalTime / benchmark.total).toFixed(1);
            const roomRatio = (roomConnectTime / benchmark.roomConnect).toFixed(1);
            const audioRatio = audioCreateTime > 0 ? (audioCreateTime / benchmark.audioCreate).toFixed(1) : 'N/A';
            const videoRatio = videoCreateTime > 0 ? (videoCreateTime / benchmark.videoCreate).toFixed(1) : 'N/A';
            const publishRatio = (publishTime / benchmark.publish).toFixed(1);

            console.log(
                `📊 总耗时:       ${totalTime.toFixed(0).padStart(6)}ms (正常: ${benchmark.total}ms)    ${totalRatio > 2 ? '🔴' : totalRatio > 1.5 ? '🟠' : '🟢'} ${totalRatio}x`
            );
            console.log(
                `🔗 连接房间:     ${roomConnectTime.toFixed(0).padStart(6)}ms (正常: ${benchmark.roomConnect}ms)     ${roomRatio > 10 ? '🔴' : roomRatio > 3 ? '🟠' : '🟢'} ${roomRatio}x`
            );
            if (audioCreateTime > 0) {
                console.log(
                    `🎤 创建音频:     ${audioCreateTime.toFixed(0).padStart(6)}ms (正常: ${benchmark.audioCreate}ms)     ${audioRatio > 3 ? '🟠' : '🟢'} ${audioRatio}x`
                );
            }
            if (videoCreateTime > 0) {
                console.log(
                    `🎥 创建视频:     ${videoCreateTime.toFixed(0).padStart(6)}ms (正常: ${benchmark.videoCreate}ms)     ${videoRatio > 3 ? '🟠' : '🟢'} ${videoRatio}x`
                );
            }
            console.log(
                `📡 发布轨道:     ${publishTime.toFixed(0).padStart(6)}ms (正常: ${benchmark.publish}ms)    ${publishRatio > 2 ? '🟠' : '🟢'} ${publishRatio}x`
            );

            console.log('%c─────────────────────────────────────────────────────────', 'color: #666666;');

            // 综合评价
            if (totalRatio > 5) {
                console.error(
                    `%c🔴 性能严重异常！当前耗时是正常值的 ${totalRatio}倍`,
                    'color: #ff0000; font-weight: bold; font-size: 14px; background: #330000; padding: 4px 8px;'
                );
            } else if (totalRatio > 2) {
                console.warn(
                    `%c🟠 性能较差，当前耗时是正常值的 ${totalRatio}倍`,
                    'color: #ff8800; font-weight: bold; font-size: 14px;'
                );
            } else if (totalRatio > 1.5) {
                console.log(`%c🟡 性能略慢，当前耗时是正常值的 ${totalRatio}倍`, 'color: #ffff00; font-weight: bold;');
            } else {
                console.log(`%c🟢 性能良好，当前耗时是正常值的 ${totalRatio}倍`, 'color: #00ff00; font-weight: bold;');
            }

            console.log(
                '%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'color: #00ff00; font-weight: bold;'
            );

            // 🔍 【诊断报告】生成完整的诊断报告（可复制给开发者）
            const diagnosticReport = {
                时间戳: new Date().toISOString(),
                本地时间: new Date().toLocaleString(),
                '═══ 性能统计 ═══': '',
                总耗时: totalTime.toFixed(0) + 'ms',
                连接房间: roomConnectTime.toFixed(0) + 'ms',
                创建音频轨道: audioCreateTime > 0 ? audioCreateTime.toFixed(0) + 'ms' : '跳过',
                创建视频轨道: videoCreateTime > 0 ? videoCreateTime.toFixed(0) + 'ms' : '跳过',
                发布轨道: publishTime.toFixed(0) + 'ms',
                初始化监听器: listenerTime.toFixed(0) + 'ms',
                '═══ 性能对比 ═══': '',
                总耗时倍数: totalRatio + 'x',
                连接房间倍数: roomRatio + 'x',
                '═══ 浏览器信息 ═══': '',
                用户代理: navigator.userAgent,
                浏览器厂商: navigator.vendor,
                平台: navigator.platform,
                语言: navigator.language,
                在线状态: navigator.onLine ? '在线' : '离线',
                '═══ 网络信息 ═══': '',
                网络类型: navigator.connection?.effectiveType || '不支持',
                下行带宽: navigator.connection?.downlink ? navigator.connection.downlink + ' Mbps' : '不支持',
                往返延迟: navigator.connection?.rtt ? navigator.connection.rtt + ' ms' : '不支持',
                省流模式: navigator.connection?.saveData ? '开启' : '关闭',
                '═══ LiveKit配置 ═══': '',
                服务器URL: url,
                服务器域名: new URL(url).host,
                协议: new URL(url).protocol,
                模式: mode,
                最大重试次数: connectOptions.maxRetries,
                超时时间: connectOptions.peerConnectionTimeout + 'ms',
                '═══ 房间状态 ═══': '',
                房间名称: room.name,
                连接状态: room.state,
                本地参与者ID: room.localParticipant?.identity || '未知',
                远程参与者数量: room.remoteParticipants?.size || 0,
                '═══ 内存信息 ═══': '',
                已用堆内存: performance.memory
                    ? (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB'
                    : '不支持',
                堆内存限制: performance.memory
                    ? (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB'
                    : '不支持'
            };

            console.log('\n');
            console.log(
                '%c📋 完整诊断报告 (可复制给开发者)',
                'color: #ffffff; font-weight: bold; font-size: 15px; background: #006600; padding: 4px 8px;'
            );
            console.log(
                '%c提示: 右键点击下方对象 → "Store as global variable" → 然后输入 copy(temp1) 复制',
                'color: #00ff00;'
            );
            console.log(diagnosticReport);

            // 同时生成一个可读的文本版本
            const reportText = Object.entries(diagnosticReport)
                .map(([key, value]) => {
                    if (key.startsWith('═══')) {
                        return `\n${key}`;
                    }
                    return `${key}: ${value}`;
                })
                .join('\n');

            console.log('\n%c📄 文本版本 (可直接复制):', 'color: #00ff00; font-weight: bold;');
            console.log(reportText);

            console.log(
                '%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'color: #00ff00; font-weight: bold;'
            );
            console.log('\n\n');

            // 🔍 将诊断报告保存到 state 中，方便外部访问
            state.diagnosticReport = diagnosticReport;
        } catch (err) {
            timings.completed = performance.now();
            console.log('\n\n');
            console.log(
                '%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'color: #ff0000; font-weight: bold;'
            );
            console.log(
                '%c❌ LiveKit joinRoom 失败',
                'color: #ffffff; font-weight: bold; font-size: 18px; background: #ff0000; padding: 10px 20px;'
            );
            console.error('【错误详情】', err);
            console.log(
                `%c⏱️ 失败耗时: ${(timings.completed - timings.start).toFixed(0)}ms`,
                'color: #ff6666; font-weight: bold; font-size: 16px;'
            );
            console.log(
                '%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'color: #ff0000; font-weight: bold;'
            );
            console.log('\n\n');
            state.error = err;
            state.room = null;
            state.connected = false;
        }
    }

    /**
     * 设置初始化配置（等待模型初始化成功后再发送）
     * @deprecated 已废弃，请直接在 joinRoom 时传入 initConfig 参数
     */
    function setInitConfig(config) {
        console.warn('⚠️ setInitConfig 已废弃，请在 joinRoom 时直接传入 initConfig 参数');
        state.initConfig = config;
        state.status = 'initializing';
    }

    function sendText(text, flag = false) {
        // debugger;
        if (!state.room || !state.connected) {
            console.error('❌ [sendText 失败] 房间未连接或连接失败', {
                hasRoom: !!state.room,
                connected: state.connected,
                roomState: state.room?.state,
                localParticipant: state.room?.localParticipant?.identity
            });
            return;
        }

        // 检查是否是打断指令
        if (typeof text === 'object' && text.interface === 'break') {
            const timestamp = formatSyncedTimestamp();
            console.log(`🚫 [${timestamp}] 发送打断指令到后端，等待 <state><session_break> 信号...`);
            console.log(`📊 [${timestamp}] 当前状态:`, state.status);
            console.log(`📊 [${timestamp}] 远端轨道数量:`, Object.keys(state.remoteTracks).length);
            console.log(`📊 [${timestamp}] 远端说话状态:`, state.remoteAudioActive);

            try {
                const jsonStr = JSON.stringify(text);
                const payload = new TextEncoder().encode(jsonStr);

                console.log(`📤 [发送方式对比测试] 打断指令:`, {
                    原始数据: text,
                    JSON字符串: jsonStr,
                    payload大小: payload.length + ' bytes'
                });

                // 🔥 关键修复：获取远端参与者列表
                const remoteParticipants = Array.from(state.room.remoteParticipants.values());
                console.log(
                    `📊 当前远端参与者:`,
                    remoteParticipants.map(p => ({
                        identity: p.identity,
                        sid: p.sid
                    }))
                );

                // 方式1：使用 publishData 发送到所有远端参与者
                console.log(`📤 [方式1] 尝试 publishData (RELIABLE)...`);
                state.room.localParticipant.publishData(payload, {
                    reliable: true,
                    topic: 'lk.chat'
                    // destination: remoteParticipants // 可选：指定接收方
                });
                console.log(`✅ [方式1] publishData 已调用`);

                // 方式2：使用 sendText（向后兼容测试）
                // console.log(`📤 [方式2] 尝试 sendText (topic: lk.chat)...`);
                // state.room.localParticipant.sendText(jsonStr, { topic: 'lk.chat' });
                // console.log(`✅ [方式2] sendText 已调用`);

                // console.log(`🎯 两种方式都已发送，请检查后端收到哪种`);
            } catch (error) {
                console.error(`❌ 发送打断指令失败:`, error);
                console.error(`❌ 错误详情:`, error.message, error.stack);
            }
            return;
        }

        if (flag) {
            state.messageIndex++;
            state.chatMessages.push({ type: 'user', text: JSON.parse(text).text });

            // 🔧 限制 chatMessages 长度，防止内存泄漏
            if (state.chatMessages.length > MAX_CHAT_MESSAGES) {
                const removed = state.chatMessages.splice(0, state.chatMessages.length - MAX_CHAT_MESSAGES);
                console.log(`🧹 自动清理旧的聊天消息: ${removed.length} 条，当前保留: ${state.chatMessages.length}`);
                // 更新 messageIndex
                state.messageIndex = state.chatMessages.length - 1;
            }
        }

        const displayText = text.length > 100 ? text.substring(0, 100) + '...' : text;
        console.log(`📤 [sendText] 准备发送文本消息:`, displayText);

        try {
            const payload = new TextEncoder().encode(text);

            console.log(`📤 [发送详情]:`, {
                文本长度: text.length + ' chars',
                payload大小: payload.length + ' bytes',
                房间状态: state.room.state,
                本地参与者: state.room.localParticipant.identity,
                远端参与者数: state.room.remoteParticipants.size
            });

            // 🔥 同时尝试两种方式，看后端收到哪个
            console.log(`📤 [方式1] publishData...`);
            state.room.localParticipant.publishData(payload, {
                reliable: true,
                topic: 'lk.chat'
            });
            console.log(`✅ [方式1] publishData 已发送`);

            // console.log(`📤 [方式2] sendText...`);
            // state.room.localParticipant.sendText(text, { topic: 'lk.chat' });
            // console.log(`✅ [方式2] sendText 已发送`);

            // console.log(`🎯 两种方式都已发送，请检查后端收到哪种`);
        } catch (error) {
            console.error(`❌ 发送文本消息失败:`, error);
            console.error(`❌ 错误堆栈:`, error.stack);
        }
    }

    function sendAndLeave(text) {
        state.messageIndex = -1;
        state.chatMessages = [];

        state.generateEnd = false; // 重置生成结束状态
        state.generateEndTimestamp = 0; // 🔧 重置 generate_end 时间戳

        // 1. 发送消息
        try {
            console.log(`📤 [sendAndLeave] 发送退出消息:`, text);

            // 方式1：使用 publishData (推荐，与后端保持一致)
            const payload = new TextEncoder().encode(text);

            console.log(`📤 [sendAndLeave publishData] 发送详情:`, {
                文本: text,
                payload大小: payload.length + ' bytes',
                kind: 'RELIABLE',
                房间状态: state.room?.state,
                连接状态: state.connected
            });

            state.room.localParticipant.publishData(payload, {
                reliable: true,
                topic: 'lk.chat'
            });
            console.log(`✅ [sendAndLeave] 退出消息发送成功`);
        } catch (error) {
            console.error(`❌ [sendAndLeave] 发送退出消息失败:`, error);
        }

        // 方式2：使用 sendText (向后兼容，如果后端还支持)
        // state.room.localParticipant.sendText(text, { topic: 'lk.chat' });

        // 2. 立即停止远端音频播放
        for (const sid in state.remoteTracks) {
            for (const track of state.remoteTracks[sid]) {
                try {
                    track.detach(); // 从 DOM 分离
                    track.stop(); // 停止播放
                } catch (err) {
                    console.error(`停止远端轨道失败: ${err}`);
                }
            }
        }

        // 3. 本地音频也停止
        for (const track of state.localTracks) {
            try {
                track.detach(); // 从 DOM 分离
                track.stop(); // 停止麦克风采集
            } catch (err) {
                console.error(`停止本地轨道失败: ${err}`);
            }
        }

        // 4. 清除所有静默定时器
        silenceTimers.forEach(clearTimeout);
        silenceTimers.clear();
        audioEndConfirmCount.clear(); // 清空确认计数

        // 5. 设置延迟退出
        setTimeout(() => {
            leaveRoom();
        }, 300);
    }

    function handleInterfaceBreak() {
        const timestamp = formatSyncedTimestamp();
        console.log(`🔄 [${timestamp}] 开始处理打断操作...`);

        // 立即切换状态为 listening
        state.status = 'listening';
        state.generateEnd = true;

        // 设置静音标记，阻止后续音频播放，直到收到下一个 vad_end
        state.muteRemoteAudio = true;
        console.log(`🔇 [${timestamp}] 设置静音标记，阻止播放直到收到下一个 vad_end`);

        // 清空所有远端说话状态
        console.log(`🔇 [${timestamp}] 清空所有远端说话状态:`, state.remoteAudioActive);
        state.remoteAudioActive = {};

        // 静音所有当前音频轨道（不停止，只静音）
        for (const sid in state.remoteTracks) {
            for (const track of state.remoteTracks[sid]) {
                try {
                    if (track.kind === 'audio') {
                        // 静音音频轨道而不是停止
                        track.setMuted(true);
                        console.log(`🔇 [${timestamp}] 静音音频轨道: ${track.sid}`);

                        // 暂停对应的 audio 元素
                        const elements = track.attachedElements;
                        if (elements && elements.size > 0) {
                            elements.forEach(el => {
                                if (el.tagName === 'AUDIO') {
                                    el.pause();
                                    el.currentTime = 0;
                                    console.log(`🔇 [${timestamp}] 暂停并重置 audio 元素`);
                                }
                            });
                        }
                    }
                } catch (err) {
                    console.error(`🔇 [${timestamp}] 静音远端轨道失败: ${err}`);
                }
            }
        }

        // 清除所有静默定时器
        silenceTimers.forEach(clearTimeout);
        silenceTimers.clear();
        audioEndConfirmCount.clear(); // 清空确认计数

        console.log(`✅ [${timestamp}] 打断操作完成，状态已切换为 listening，远端音频已静音`);
    }

    /**
     * 发送 DataChannel 数据（消息）
     * @param {any} data 可以是对象或字符串，内部会 JSON.stringify
     * @param {boolean} reliable 是否采用可靠模式
     */
    function sendData(data, reliable = true) {
        if (!state.room) return;
        const payload = new TextEncoder().encode(JSON.stringify(data));
        state.room.localParticipant.publishData(payload, {
            reliable,
            topic: 'lk.chat'
        });
    }

    /**
     * 切换摄像头（前置 ↔ 后置）
     * 使用 replaceTrack（后端订阅保持不变）
     */
    async function switchCamera() {
        if (isSwitchingCamera) {
            console.warn('⚠️ 摄像头正在切换中，请稍后再试');
            ElMessage({
                type: 'warning',
                message: '摄像头正在切换中，请稍后再试',
                duration: 2000
            });
            return;
        }

        if (!state.connected || !state.room) {
            console.warn('⚠️ 房间未连接，无法切换摄像头');
            return;
        }

        const currentVideoTrack = state.localTracks.find(t => t.kind === 'video');
        if (!currentVideoTrack) {
            console.warn('⚠️ 未找到视频轨道');
            return;
        }

        isSwitchingCamera = true;
        const startTime = performance.now();
        const newFacing = state.videoFacing === 'user' ? 'environment' : 'user';

        console.log('🎥 开始切换摄像头（replaceTrack/restartTrack 方案）...');
        console.log('📊 切换前状态:', {
            videoFacing: state.videoFacing,
            trackSid: currentVideoTrack.sid,
            trackName: currentVideoTrack.name,
            devicesInitialized: cachedVideoDevices.initialized
        });

        const oldMediaTrack = currentVideoTrack.mediaStreamTrack;

        await initVideoDevices();

        try {
            const createStartTime = performance.now();
            const resolution = VIDEO_RESOLUTION_CONFIG.high; // 1280x720（算法要求 720p）
            validateResolution(resolution);

            const targetDeviceId = newFacing === 'user' ? cachedVideoDevices.front : cachedVideoDevices.back;
            const useDeviceId = targetDeviceId && cachedVideoDevices.initialized;

            // 🔧 优化：使用 ideal 而不是精确约束，避免 iOS 裁剪画面
            const captureOptions = {
                width: { ideal: resolution.width, min: MIN_VIDEO_DIMENSION },
                height: { ideal: resolution.height, min: MIN_VIDEO_DIMENSION },
                aspectRatio: { ideal: 16 / 9 }, // 明确指定 16:9 比例
                frameRate: { ideal: 15, max: 30 }, // 使用 ideal 帧率
                // 🔥 添加 zoom 约束，防止使用长焦镜头
                ...(typeof MediaStreamTrack.prototype.getCapabilities !== 'undefined' && { zoom: 1.0 })
            };

            if (useDeviceId) {
                captureOptions.deviceId = { exact: targetDeviceId };
                console.log('✅ 使用 deviceId 策略（避免浏览器风控）');
            } else {
                // 🔧 优化：使用 ideal facingMode，让 iOS 选择最佳的后置摄像头（通常是广角主摄）
                captureOptions.facingMode = { ideal: newFacing };
                console.log('⚠️ 降级到 facingMode 策略（ideal 模式，让设备选择最佳镜头）');
            }

            let newLocalTrack = null;
            let usedRestartTrack = false;
            let replaceSucceeded = false;

            if (typeof currentVideoTrack.restartTrack === 'function') {
                // 🔧 优化：使用与创建时相同的约束格式（720p）
                const restartOptions = {
                    width: { ideal: resolution.width, min: MIN_VIDEO_DIMENSION },
                    height: { ideal: resolution.height, min: MIN_VIDEO_DIMENSION },
                    aspectRatio: { ideal: 16 / 9 },
                    frameRate: { ideal: 15, max: 30 }
                };

                if (useDeviceId) {
                    restartOptions.deviceId = { exact: targetDeviceId };
                } else {
                    restartOptions.facingMode = { ideal: newFacing };
                }

                console.log('🔄 [步骤2] restartTrack 重启轨道（ideal 约束模式）...');
                await currentVideoTrack.restartTrack(restartOptions);
                usedRestartTrack = true;

                // 输出 restartTrack 后的摄像头详情
                const restartedSettings = currentVideoTrack.mediaStreamTrack.getSettings();
                console.log(
                    `%c📐 [摄像头切换] restartTrack 后的详情`,
                    'color: #ff00ff; font-weight: bold; font-size: 14px',
                    {
                        '📱 设备信息': {
                            deviceId: restartedSettings.deviceId,
                            label: restartedSettings.label || '(设备标签未提供)'
                        },
                        '🎥 实际分辨率': `${restartedSettings.width}x${restartedSettings.height}`,
                        '📷 摄像头方向': restartedSettings.facingMode || '未知',
                        '💡 镜头类型': restartedSettings.label
                            ? restartedSettings.label.includes('ultra') || restartedSettings.label.includes('wide')
                                ? '✅ 超广角'
                                : restartedSettings.label.includes('tele') || restartedSettings.label.includes('zoom')
                                  ? '⚠️ 长焦（放大）'
                                  : '✅ 主摄广角'
                            : '(未提供标签)'
                    }
                );
            } else {
                newLocalTrack = await Promise.race([
                    createLocalVideoTrack(captureOptions),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('获取摄像头超时（5秒）')), 5000))
                ]);

                console.log(`📹 新轨道创建耗时: ${(performance.now() - createStartTime).toFixed(0)}ms`);

                const actualSettings = newLocalTrack.mediaStreamTrack.getSettings();
                console.log(`%c📐 [摄像头切换] 新摄像头详情`, 'color: #00ffff; font-weight: bold; font-size: 14px', {
                    '📱 设备信息': {
                        deviceId: actualSettings.deviceId,
                        label: actualSettings.label || '(设备标签未提供)',
                        groupId: actualSettings.groupId
                    },
                    '🎥 采集参数': {
                        请求分辨率: `${resolution.width}x${resolution.height}`,
                        实际分辨率: `${actualSettings.width}x${actualSettings.height}`,
                        帧率: actualSettings.frameRate + ' fps',
                        宽高比: (actualSettings.width / actualSettings.height).toFixed(2)
                    },
                    '📷 摄像头方向': {
                        请求: newFacing,
                        实际: actualSettings.facingMode || '未知'
                    },
                    '💡 镜头类型': actualSettings.label
                        ? actualSettings.label.includes('ultra') || actualSettings.label.includes('wide')
                            ? '✅ 超广角（视野更广）'
                            : actualSettings.label.includes('tele') || actualSettings.label.includes('zoom')
                              ? '⚠️ 长焦（视野更窄，放大）'
                              : '✅ 主摄广角（标准视野）'
                        : '请在 iOS 设置中允许浏览器访问摄像头标签'
                });

                console.log('🔄 [步骤2] replaceTrack 替换轨道...');
                await currentVideoTrack.replaceTrack(newLocalTrack.mediaStreamTrack);

                const expectedTrackId = newLocalTrack.mediaStreamTrack.id;
                if (currentVideoTrack.mediaStreamTrack?.id !== expectedTrackId) {
                    console.warn('⚠️ replaceTrack 后轨道ID不一致，尝试重试一次...');
                    const retryTrack = await Promise.race([
                        createLocalVideoTrack(captureOptions),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('获取摄像头超时（5秒）')), 5000))
                    ]);
                    await currentVideoTrack.replaceTrack(retryTrack.mediaStreamTrack);
                    if (currentVideoTrack.mediaStreamTrack?.id !== retryTrack.mediaStreamTrack.id) {
                        retryTrack.stop();
                        throw new Error('replaceTrack 失败，轨道未更新');
                    }
                    newLocalTrack = retryTrack;
                }
                replaceSucceeded = true;
            }

            // 确保音频轨道仍然在发布状态（部分设备切换时可能丢失音频发布）
            const participant = state.room.localParticipant;
            const hasAudioPublication =
                participant.audioTrackPublications &&
                Array.from(participant.audioTrackPublications.values()).some(pub => pub?.track?.kind === 'audio');
            if (!hasAudioPublication) {
                const audioTrack = state.localTracks.find(t => t.kind === 'audio');
                if (audioTrack) {
                    try {
                        console.warn('⚠️ 检测到音频未发布，尝试重新发布音频轨道...');

                        // 🔥🔥🔥 新方案：根据模型状态决定是否发布
                        if (state.modelInitialized) {
                            // 模型已初始化，立即发布
                            await participant.publishTrack(audioTrack);
                            console.log(
                                '%c✅ [重新发布音频-新方案] 模型已初始化，音频轨道已发布并发送',
                                'color: #00ff00; font-weight: bold; font-size: 13px; background: #003300; padding: 2px 6px;'
                            );
                        } else {
                            // 模型未初始化，不发布（等待 model_init_success 信号统一发布）
                            console.log(
                                '%c⏳ [重新发布音频-新方案] 模型未初始化，不发布轨道（等待 model_init_success）',
                                'color: #ffaa00; font-weight: bold; font-size: 13px; background: #332200; padding: 2px 6px;'
                            );
                        }
                    } catch (publishAudioError) {
                        console.error('❌ 重新发布音频轨道失败:', publishAudioError);
                    }
                }
            }

            const refreshLocalVideo = async track => {
                if (!localVideoElement || !track) return;
                try {
                    // 强制重置，避免首轮切换黑屏
                    localVideoElement.srcObject = null;
                    localVideoElement.removeAttribute('src');
                    if (typeof localVideoElement.load === 'function') {
                        localVideoElement.load();
                    }
                    localVideoElement.srcObject = new MediaStream([track]);

                    const tryPlay = () => {
                        const playPromise = localVideoElement.play();
                        if (playPromise && typeof playPromise.catch === 'function') {
                            playPromise.catch(() => {});
                        }
                    };

                    localVideoElement.onloadedmetadata = () => {
                        tryPlay();
                    };
                    localVideoElement.oncanplay = () => {
                        tryPlay();
                    };

                    // 不等待 play()，避免首轮切换时 promise 悬挂导致卡死
                    tryPlay();
                } catch {}
            };

            const previewTrack = usedRestartTrack
                ? currentVideoTrack.mediaStreamTrack
                : newLocalTrack?.mediaStreamTrack;
            await refreshLocalVideo(previewTrack);

            // 兜底：短延时检查画面是否真正就绪，否则强制重新 attach
            setTimeout(() => {
                if (!localVideoElement) return;
                if (!localVideoElement.videoWidth || !localVideoElement.videoHeight) {
                    try {
                        currentVideoTrack.attach(localVideoElement);
                        const playPromise = localVideoElement.play();
                        if (playPromise && typeof playPromise.catch === 'function') {
                            playPromise.catch(() => {});
                        }
                    } catch {}
                }
            }, 300);

            // 延迟停止旧轨道，避免竞态（restartTrack 会自行处理旧轨道）
            if (!usedRestartTrack && replaceSucceeded) {
                setTimeout(() => {
                    try {
                        if (oldMediaTrack && oldMediaTrack.readyState !== 'ended') {
                            oldMediaTrack.stop();
                            console.log('✅ 旧 MediaStreamTrack 已停止（延迟）');
                        }
                    } catch (stopError) {
                        console.warn('⚠️ 停止旧轨道时出现警告（可忽略）:', stopError.message);
                    }
                }, 300);
            }

            state.videoFacing = newFacing;
            state.videoEnabled = true;

            console.log(`✅ 摄像头切换完成（replaceTrack），总耗时: ${(performance.now() - startTime).toFixed(0)}ms`);

            // 🔥 切换后自动诊断新镜头
            setTimeout(async () => {
                try {
                    console.log('\n' + '='.repeat(60));
                    console.log('📱 [切换后诊断] 检查新镜头...');
                    console.log('='.repeat(60));

                    const currentCamera = await checkCurrentCamera();

                    if (currentCamera && currentCamera['🎥 当前摄像头']) {
                        const cameraType = currentCamera['🎥 当前摄像头'].镜头类型;

                        if (cameraType.includes('⚠️')) {
                            console.warn('\n⚠️ 切换后仍使用了不推荐的镜头:', cameraType);
                            console.warn('请将此信息截图发给技术支持');
                        } else if (cameraType.includes('✅')) {
                            console.log('\n✅ 切换成功！当前使用推荐镜头:', cameraType);
                        }
                    }

                    console.log('='.repeat(60));
                    console.log('');
                } catch (err) {
                    console.error('切换后诊断失败:', err);
                }
            }, 500);
        } catch (error) {
            console.error('❌ 切换摄像头失败:', error);

            let errorMessage = '切换摄像头失败';
            if (error.message?.includes('超时')) {
                errorMessage = '摄像头响应超时，请稍后再试';
            } else if (error.message?.includes('NotFoundError') || error.message?.includes('设备')) {
                errorMessage = `未找到${newFacing === 'user' ? '前置' : '后置'}摄像头`;
            } else if (error.message?.includes('NotAllowedError') || error.message?.includes('权限')) {
                errorMessage = '摄像头权限被拒绝，请检查浏览器设置';
            } else if (error.message?.includes('NotReadableError') || error.message?.includes('占用')) {
                errorMessage = '摄像头被其他应用占用，请关闭其他应用后重试';
            }

            ElMessage({
                type: 'error',
                message: errorMessage,
                duration: 3000
            });

            // 回滚：恢复旧轨道
            try {
                if (oldMediaTrack) {
                    await currentVideoTrack.replaceTrack(oldMediaTrack);
                    if (localVideoElement) {
                        localVideoElement.srcObject = new MediaStream([oldMediaTrack]);
                        const playPromise = localVideoElement.play();
                        if (playPromise && typeof playPromise.catch === 'function') {
                            playPromise.catch(() => {});
                        }
                    }
                    console.log('✅ 已回滚到旧轨道');
                }
            } catch (rollbackError) {
                console.error('❌ 回滚失败:', rollbackError);
                ElMessage({
                    type: 'error',
                    message: '摄像头切换失败且无法恢复，请刷新页面',
                    duration: 5000
                });
            }
        } finally {
            setTimeout(() => {
                isSwitchingCamera = false;
                console.log('🔓 摄像头切换锁已释放（延迟500ms，保护浏览器硬件）');
            }, 500);
        }
    }

    /**
     * 切换麦克风 静音/取消静音
     */
    async function toggleMic() {
        const mic = state.localTracks.find(t => t.kind === 'audio');
        if (!mic) return;
        await state.room.localParticipant.setMicrophoneEnabled(!state.audioEnabled);
        state.audioEnabled = !state.audioEnabled;
        mic.enable(state.audioEnabled);
    }

    /**
     * 切换摄像头 开启/关闭（不重建轨道，只 enable/disable）
     */
    function toggleCam() {
        const cam = state.localTracks.find(t => t.kind === 'video');
        if (!cam) return;
        state.videoEnabled = !state.videoEnabled;
        cam.enable(state.videoEnabled);
    }

    /**
     * 离开房间并释放资源
     */
    async function leaveRoom() {
        if (!state.room) return;
        // 0. 清除所有静默定时器
        silenceTimers.forEach(clearTimeout);
        silenceTimers.clear();
        audioEndConfirmCount.clear(); // 清空确认计数

        // 清除无机器人检测定时器
        if (noRobotTimer) {
            clearTimeout(noRobotTimer);
            noRobotTimer = null;
        }

        // 1. 停止并 detach 本地轨道（增强清理）
        state.localTracks.forEach(t => {
            try {
                // 先 detach 从 DOM 分离
                t.detach();

                // 停止 LiveKit Track
                t.stop();

                // 确保底层 MediaStreamTrack 也停止
                if (t.mediaStreamTrack && t.mediaStreamTrack.readyState !== 'ended') {
                    t.mediaStreamTrack.stop();
                }
            } catch (error) {
                console.warn('⚠️ 停止本地轨道时出错:', error);
            }
        });

        // 2. 清理远端 <audio> 元素（只 detach track，不 stop())
        Object.values(state.remoteTracks)
            .flat()
            .forEach(t => {
                try {
                    t.detach();
                } catch {}
            });
        if (onCleanup) onCleanup();

        // 3. 卸载所有事件，断开连接
        try {
            state.room.removeAllListeners();
            state.room.disconnect();
        } catch {}
        state.localTracks = [];
        state.localAudioActive = false;
        state.connected = false;
        state.videoFacing = getDefaultFacingMode(); // 根据设备类型重置摄像头方向
        // clear remote tracks
        state.remoteTracks = {};
        state.remoteAudioActive = {};
        state.messages = [];
        state.room = null;
        // 清理组件层 <audio> 元素
        if (onCleanup) onCleanup(Object.keys(state.remoteAudioActive));
        state.status = '';

        // 🔧 停止内存监控
        stopMemoryMonitoring();

        // 🔧 彻底清理所有累积数据，防止内存泄漏
        cleanupOnSessionEnd();
    }

    /**
     * 测试辅助函数：获取当前视频流分辨率
     */
    function getVideoResolution() {
        const videoTrack = state.localTracks.find(t => t.kind === 'video');
        if (!videoTrack?.mediaStreamTrack) {
            console.warn('⚠️ 未找到视频轨道');
            return null;
        }

        const settings = videoTrack.mediaStreamTrack.getSettings();
        const meetsRequirement = settings.width >= MIN_VIDEO_DIMENSION && settings.height >= MIN_VIDEO_DIMENSION;

        const result = {
            实际分辨率: { width: settings.width, height: settings.height },
            帧率: settings.frameRate,
            摄像头方向: settings.facingMode,
            设备ID: settings.deviceId,
            算法要求: `${MIN_VIDEO_DIMENSION}x${MIN_VIDEO_DIMENSION}`,
            是否满足要求: meetsRequirement ? '✅ 满足' : '❌ 不满足'
        };

        console.log('📹 当前视频流分辨率:', result);
        return result;
    }

    /**
     * 调试辅助函数：全面检查视频状态（用于定位切换后不显示的问题）
     */
    function debugVideoState() {
        console.log('🔍 ===== 视频状态诊断 =====');

        // 1. 检查 LiveKit Track
        const videoTrack = state.localTracks.find(t => t.kind === 'video');
        console.log(
            '1️⃣ LiveKit Track:',
            videoTrack
                ? {
                      trackSid: videoTrack.sid,
                      enabled: videoTrack.isEnabled,
                      mediaStreamTrack: {
                          id: videoTrack.mediaStreamTrack.id,
                          readyState: videoTrack.mediaStreamTrack.readyState,
                          enabled: videoTrack.mediaStreamTrack.enabled,
                          muted: videoTrack.mediaStreamTrack.muted,
                          settings: videoTrack.mediaStreamTrack.getSettings()
                      },
                      attachedElements: videoTrack.attachedElements?.size || 0
                  }
                : '❌ 未找到'
        );

        // 2. 检查 DOM 中的 video 元素
        const allVideos = document.querySelectorAll('video');
        console.log(`2️⃣ DOM 中的 video 元素数量: ${allVideos.length}`);
        allVideos.forEach((v, idx) => {
            const style = window.getComputedStyle(v);
            console.log(`   Video ${idx}:`, {
                muted: v.muted,
                autoplay: v.autoplay,
                paused: v.paused,
                readyState: v.readyState,
                videoWidth: v.videoWidth,
                videoHeight: v.videoHeight,
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                hasSrcObject: !!v.srcObject,
                srcObjectTracks:
                    v.srcObject?.getVideoTracks().map(t => ({
                        id: t.id,
                        readyState: t.readyState,
                        enabled: t.enabled,
                        label: t.label
                    })) || [],
                hasDataLivekit: v.hasAttribute('data-livekit-audio')
            });
        });

        // 3. 检查状态变量
        console.log('3️⃣ 状态变量:', {
            videoFacing: state.videoFacing,
            videoEnabled: state.videoEnabled,
            connected: state.connected,
            isSwitching: isSwitchingCamera
        });

        // 4. 手动修复建议
        if (videoTrack && allVideos.length > 0) {
            console.log('💡 手动修复命令：');
            console.log('const video = document.querySelectorAll("video")[0];');
            console.log('video.srcObject = new MediaStream([state.localTracks[0].mediaStreamTrack]);');
            console.log('await video.play();');
        }

        console.log('🔍 ===== 诊断完成 =====');
    }

    /**
     * 测试辅助函数：检查当前使用的摄像头详情（用于调试 iOS 多镜头问题）
     */
    async function checkCurrentCamera() {
        const videoTrack = state.localTracks.find(t => t.kind === 'video');

        if (!videoTrack) {
            console.warn('❌ 未找到视频轨道');
            return null;
        }

        const settings = videoTrack.mediaStreamTrack.getSettings();
        const constraints = videoTrack.mediaStreamTrack.getConstraints();

        // 🔍 增强检测：即使没有 label，也能通过其他特征识别镜头
        let cameraType = '未知';
        let cameraTypeEmoji = '❓';
        let inferenceMethod = '';

        // 方法1：通过 label 识别（最准确，兼容 iOS 和 Android）
        if (settings.label) {
            const label = settings.label.toLowerCase();
            inferenceMethod = 'label 识别';

            // 前置摄像头
            if (label.includes('front') || label.includes('user') || label.includes('facing front')) {
                cameraType = '前置摄像头 (Front)';
                cameraTypeEmoji = '🤳';
            }
            // 🔥 优先识别 camera2 X 格式（Android Camera2 API）
            else {
                const camera2Match = label.match(/camera2?\s+(\d+)/);
                if (camera2Match && label.includes('back')) {
                    const cameraId = parseInt(camera2Match[1]);

                    if (cameraId === 0) {
                        cameraType = 'Android 主摄 (camera2 0)';
                        cameraTypeEmoji = '✅';
                        inferenceMethod = 'camera2 API 识别 (0=主摄)';
                    } else if (cameraId === 2) {
                        cameraType = 'Android 辅助镜头 (camera2 2)';
                        cameraTypeEmoji = '📐';
                        inferenceMethod = 'camera2 API 识别 (2=辅助镜头)';
                    } else if (cameraId === 3 || cameraId === 4) {
                        cameraType = `⚠️ Android 特殊镜头 (camera2 ${cameraId})`;
                        cameraTypeEmoji = '🔍';
                        inferenceMethod = `camera2 API 识别 (${cameraId}=可能是长焦/微距)`;
                    } else {
                        cameraType = `Android 其他镜头 (camera2 ${cameraId})`;
                        cameraTypeEmoji = '❓';
                        inferenceMethod = `camera2 API 识别`;
                    }
                }
                // Android 主摄
                else if (label.includes('main') || label.includes('primary')) {
                    cameraType = 'Android 主摄 (Main/Primary)';
                    cameraTypeEmoji = '✅';
                }
                // iOS 主摄广角
                else if (label.includes('wide') && !label.includes('ultra')) {
                    cameraType = 'iOS 主摄广角 (Wide)';
                    cameraTypeEmoji = '✅';
                }
                // 超广角
                else if (label.includes('ultra') || (label.includes('wide') && label.includes('angle'))) {
                    cameraType = '超广角 (Ultra Wide)';
                    cameraTypeEmoji = '📐';
                }
                // 长焦（需要排除）
                else if (label.includes('tele') || label.includes('zoom')) {
                    cameraType = '⚠️ 长焦 (Telephoto/Zoom)';
                    cameraTypeEmoji = '🔍';
                }
                // Android 微距（需要排除）
                else if (label.includes('macro')) {
                    cameraType = '⚠️ 微距镜头 (Macro)';
                    cameraTypeEmoji = '🔬';
                }
                // Android 景深（需要排除）
                else if (label.includes('depth')) {
                    cameraType = '⚠️ 景深镜头 (Depth)';
                    cameraTypeEmoji = '📷';
                }
                // Android 默认后置（camera 0）
                else if (label.includes('camera 0') || label.includes('back camera')) {
                    cameraType = 'Android 后置摄像头 (Camera 0)';
                    cameraTypeEmoji = '✅';
                }
                // 普通后置
                else if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                    cameraType = '后置摄像头 (Back/Rear)';
                    cameraTypeEmoji = '📷';
                }
            }
        }
        // 方法2：通过分辨率和视野推断（iOS 没有 label 时的备用方案）
        else if (settings.facingMode === 'environment' || state.videoFacing === 'environment') {
            inferenceMethod = '分辨率推断';
            const actualPixels = settings.width * settings.height;
            const aspectRatio = settings.width / settings.height;

            // iPhone 后置镜头特征分析
            // - 主摄广角：通常 12MP (4032x3024) 或缩放版本
            // - 长焦：通常分辨率相同但 FOV 更窄（难以通过分辨率区分）
            // - 超广角：通常 12MP (4032x3024)

            // 🔥 关键判断：检查是否有明显的裁剪或放大
            const requestedPixels =
                (constraints.width?.ideal || constraints.width) * (constraints.height?.ideal || constraints.height);
            const pixelRatio = actualPixels / requestedPixels;

            if (pixelRatio < 0.8) {
                // 实际像素数远低于请求，可能被裁剪（长焦特征）
                cameraType = '⚠️ 可能是长焦 (推断)';
                cameraTypeEmoji = '🔍⚠️';
                inferenceMethod += ' - 检测到像素裁剪';
            } else if (aspectRatio < 1.6 || aspectRatio > 1.9) {
                // 宽高比异常，可能是超广角
                cameraType = '可能是超广角 (推断)';
                cameraTypeEmoji = '📐';
                inferenceMethod += ' - 异常宽高比';
            } else {
                // 正常范围，推测为主摄
                cameraType = '可能是主摄广角 (推断)';
                cameraTypeEmoji = '✅';
                inferenceMethod += ' - 正常范围';
            }
        } else {
            cameraType = '前置摄像头';
            cameraTypeEmoji = '🤳';
            inferenceMethod = '方向判断';
        }

        // 尝试获取所有设备信息（用于更详细的分析）
        let allDevices = [];
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            allDevices = devices
                .filter(d => d.kind === 'videoinput')
                .map(d => ({
                    deviceId: d.deviceId,
                    label: d.label,
                    groupId: d.groupId,
                    当前使用: d.deviceId === settings.deviceId ? '✅' : ''
                }));
        } catch (err) {
            console.warn('无法枚举设备:', err);
        }

        const result = {
            '🎥 当前摄像头': {
                deviceId: settings.deviceId.substring(0, 20) + '...',
                label: settings.label || '(iOS 未提供，需要在系统设置中授权)',
                镜头类型: `${cameraTypeEmoji} ${cameraType}`,
                推断方法: inferenceMethod
            },
            '📐 分辨率信息': {
                实际分辨率: `${settings.width}x${settings.height}`,
                总像素: `${((settings.width * settings.height) / 1000000).toFixed(2)}MP`,
                宽高比: (settings.width / settings.height).toFixed(2),
                帧率: settings.frameRate + ' fps'
            },
            '📷 方向设置': {
                facingMode: settings.facingMode || '未指定',
                当前朝向: state.videoFacing,
                请求方向: constraints.facingMode?.ideal || constraints.facingMode
            },
            '⚙️ 约束条件': constraints,
            '💡 诊断建议': cameraType.includes('长焦')
                ? '⚠️ 检测到可能使用长焦镜头，这会导致画面放大！\n' +
                  '   解决方案：运行 forceLensSelection("wide") 强制切换到主摄。'
                : cameraType.includes('微距')
                  ? '⚠️ 检测到微距镜头，这是用于近距离拍摄的！\n' +
                    '   解决方案：运行 forceLensSelection("main") 切换到主摄。'
                  : cameraType.includes('景深')
                    ? '⚠️ 检测到景深镜头，这不适合视频通话！\n' +
                      '   解决方案：运行 forceLensSelection("main") 切换到主摄。'
                    : cameraType.includes('主摄') || cameraType.includes('Camera 0')
                      ? '✅ 正在使用主摄，这是最佳选择。'
                      : cameraType.includes('超广角')
                        ? '📐 超广角镜头视野很宽，如果感觉画面太广，这是正常的。'
                        : '❓ 无法确定镜头类型。\n' +
                          '   建议：运行 listAllCameras() 查看所有可用摄像头。\n' +
                          '   iOS: 在设置 → Safari → 摄像头 中允许访问标签。\n' +
                          '   Android: 通常会自动提供标签信息。'
        };

        console.log('%c📸 [当前摄像头检查]', 'color: #00ff00; font-weight: bold; font-size: 16px');
        console.table(result['🎥 当前摄像头']);
        console.table(result['📐 分辨率信息']);
        console.table(result['📷 方向设置']);

        if (allDevices.length > 0) {
            console.log('%c📱 所有可用摄像头:', 'color: #00ffff; font-weight: bold;');
            console.table(allDevices);
        }

        console.log('完整设置:', settings);
        console.log('约束条件:', constraints);
        console.log(result['💡 诊断建议']);

        // 额外提示：如何获取设备信息
        if (!settings.label) {
            console.log('%c💡 如何获取摄像头标签:', 'color: #ffaa00; font-weight: bold; font-size: 14px');
            console.log('iOS: 设置 → Safari → 高级 → 网站数据，或 隐私 → 相机 → Safari');
            console.log('Android: 通常会自动提供，如未提供请检查浏览器权限');
        }

        // 输出诊断工具提示
        console.log('%c🛠️ 诊断工具:', 'color: #00ffff; font-weight: bold; font-size: 14px');
        console.log('listAllCameras() - 列出所有可用摄像头');
        console.log('forceLensSelection("main") - 强制使用主摄');
        console.log('forceLensSelection("wide") - 强制使用广角');

        return result;
    }

    /**
     * 测试辅助函数：清除摄像头缓存（用于重新检测摄像头）
     */
    function clearCameraCache() {
        cachedVideoDevices = {
            front: null,
            back: null,
            initialized: false
        };
        console.log('✅ 摄像头缓存已清除，下次切换时会重新检测');
        console.log('💡 请切换摄像头测试新的选择策略');
        return { success: true, message: '缓存已清除' };
    }

    /**
     * 测试辅助函数：强制使用特定镜头（解决长焦问题）
     * @param {'wide'|'ultrawide'|'main'} lensType 镜头类型
     * 使用方法：在控制台运行 forceLensSelection('wide') 或 forceLensSelection('main')
     * ✅ 兼容 iOS 和 Android 设备
     */
    async function forceLensSelection(lensType = 'wide') {
        console.log(`🎯 尝试强制选择 ${lensType} 镜头...`);

        if (!state.connected || !state.room) {
            console.warn('⚠️ 房间未连接');
            return { success: false, error: '房间未连接' };
        }

        const currentVideoTrack = state.localTracks.find(t => t.kind === 'video');
        if (!currentVideoTrack) {
            console.warn('⚠️ 未找到视频轨道');
            return { success: false, error: '未找到视频轨道' };
        }

        try {
            // 获取所有可用摄像头
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            console.log(
                '📱 可用摄像头:',
                videoDevices.map(d => ({
                    deviceId: d.deviceId.substring(0, 20) + '...',
                    label: d.label
                }))
            );

            // 根据 label 选择镜头（兼容 iOS 和 Android）
            let targetDevice = null;

            if (lensType === 'wide' || lensType === 'main') {
                // 选择主摄广角（排除 ultra、tele、macro、depth）
                targetDevice = videoDevices.find(d => {
                    const label = d.label.toLowerCase();

                    // 必须是后置摄像头
                    const isBackCamera =
                        label.includes('back') ||
                        label.includes('rear') ||
                        label.includes('environment') ||
                        label.includes('facing back'); // Android 标准格式

                    if (!isBackCamera) return false;

                    // 排除特殊镜头
                    const isSpecialLens =
                        label.includes('ultra') ||
                        label.includes('tele') ||
                        label.includes('zoom') ||
                        label.includes('macro') || // Android 微距
                        label.includes('depth'); // Android 景深

                    if (isSpecialLens) return false;

                    // 🔥 优先选择 camera2 0（Android 主摄标准）
                    const camera2Match = label.match(/camera2?\s+(\d+)/);
                    if (camera2Match) {
                        const cameraId = parseInt(camera2Match[1]);
                        if (cameraId === 0) {
                            return true; // camera2 0 是主摄，最高优先级
                        }
                    }

                    // 优先选择明确标注为主摄的
                    const isMainCamera =
                        label.includes('main') ||
                        label.includes('primary') ||
                        label.includes('wide') ||
                        label.includes('camera 0'); // 旧格式 camera 0

                    return isMainCamera || isBackCamera; // 有 main/primary 标注最优，否则普通后置也可以
                });

                // 如果没找到，尝试更宽松的匹配（只排除特殊镜头）
                if (!targetDevice) {
                    console.log('🔄 使用宽松匹配策略...');
                    targetDevice = videoDevices.find(d => {
                        const label = d.label.toLowerCase();
                        const isBackCamera =
                            label.includes('back') || label.includes('rear') || label.includes('environment');
                        const isSpecialLens =
                            label.includes('tele') ||
                            label.includes('zoom') ||
                            label.includes('macro') ||
                            label.includes('depth');

                        // 即使在宽松模式，也优先选择 camera2 0
                        const camera2Match = label.match(/camera2?\s+(\d+)/);
                        if (camera2Match && parseInt(camera2Match[1]) === 0) {
                            return true;
                        }

                        return isBackCamera && !isSpecialLens;
                    });
                }
            } else if (lensType === 'ultrawide') {
                // 选择超广角
                targetDevice = videoDevices.find(d => {
                    const label = d.label.toLowerCase();
                    return (
                        (label.includes('ultra') && label.includes('wide')) ||
                        label.includes('ultrawide') ||
                        label.includes('超广角')
                    );
                });
            }

            if (!targetDevice) {
                console.warn('⚠️ 未找到匹配的镜头，尝试使用第一个后置摄像头');
                targetDevice = videoDevices.find(d => {
                    const label = d.label.toLowerCase();
                    return (
                        label.includes('back') ||
                        label.includes('rear') ||
                        label.includes('environment') ||
                        label.includes('camera 0')
                    );
                });
            }

            if (!targetDevice) {
                throw new Error('未找到合适的后置摄像头');
            }

            console.log('✅ 选择镜头:', targetDevice.label);

            // 创建新轨道（根据高清模式配置）
            const resolution = getVideoResolution();
            const newTrack = await createLocalVideoTrack({
                deviceId: { exact: targetDevice.deviceId },
                width: { ideal: resolution.width, min: MIN_VIDEO_DIMENSION },
                height: { ideal: resolution.height, min: MIN_VIDEO_DIMENSION },
                aspectRatio: { ideal: 16 / 9 },
                frameRate: { ideal: 15, max: 30 }
            });

            // 替换轨道
            await currentVideoTrack.replaceTrack(newTrack.mediaStreamTrack);

            // 刷新本地视频
            if (localVideoElement) {
                localVideoElement.srcObject = new MediaStream([newTrack.mediaStreamTrack]);
                await localVideoElement.play();
            }

            // 输出新镜头信息
            const settings = newTrack.mediaStreamTrack.getSettings();
            console.log('✅ 镜头切换成功!', {
                deviceId: settings.deviceId.substring(0, 20) + '...',
                label: settings.label,
                分辨率: `${settings.width}x${settings.height}`,
                帧率: settings.frameRate + ' fps'
            });

            return {
                success: true,
                message: '镜头切换成功',
                settings
            };
        } catch (error) {
            console.error('❌ 强制选择镜头失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 测试辅助函数：手动对比视野（帮助判断镜头类型）
     * 使用方法：在控制台运行，然后对比相机 App 的视野
     */
    function compareFieldOfView() {
        console.log('%c📏 视野对比测试', 'color: #ff00ff; font-weight: bold; font-size: 16px');
        console.log('');
        console.log('🎯 测试步骤：');
        console.log('1. 保持当前页面的后置摄像头画面');
        console.log('2. 找一个固定参照物（如门框、窗户边缘）');
        console.log('3. 记住画面中能看到的范围');
        console.log('4. 打开 iOS 相机 App，切换到后置摄像头');
        console.log('5. 对比两者的视野范围：');
        console.log('');
        console.log('📊 判断标准：');
        console.log('   ✅ 视野一致 → 使用的是主摄广角（正常）');
        console.log('   📐 Web 更宽 → Web 使用超广角，相机 App 用主摄');
        console.log('   🔍 Web 更窄/放大 → ⚠️ Web 使用长焦镜头（问题所在！）');
        console.log('');
        console.log('💡 提示：');
        console.log('   - 相机 App 默认使用 1x (主摄)');
        console.log('   - 如果 Web 画面明显放大，说明用了长焦');
        console.log('   - iPhone 13 Pro Max: 0.5x=超广角, 1x=主摄, 3x=长焦');
        console.log('');

        // 显示当前分辨率信息
        const videoTrack = state.localTracks.find(t => t.kind === 'video');
        if (videoTrack) {
            const settings = videoTrack.mediaStreamTrack.getSettings();
            console.log('当前摄像头参数:');
            console.table({
                分辨率: `${settings.width}x${settings.height}`,
                帧率: settings.frameRate + ' fps',
                deviceId前8位: settings.deviceId.substring(0, 8)
            });
        }

        return {
            message: '请按照上述步骤进行视野对比测试',
            tip: '如果发现 Web 画面明显放大/缩小，说明使用了错误的镜头'
        };
    }

    /**
     * 测试辅助函数：列出所有可用摄像头（用于诊断设备）
     * ✅ 兼容 iOS 和 Android 设备
     */
    async function listAllCameras() {
        console.log(
            '%c📱 [摄像头列表] 开始检测所有可用摄像头...',
            'color: #00ff00; font-weight: bold; font-size: 16px'
        );

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            if (videoDevices.length === 0) {
                console.warn('❌ 未找到任何摄像头设备');
                return { success: false, cameras: [] };
            }

            console.log(`✅ 找到 ${videoDevices.length} 个摄像头`);

            const cameraList = videoDevices.map((device, index) => {
                const label = device.label.toLowerCase();

                // 判断摄像头类型
                let type = '未知';
                let emoji = '❓';
                let warning = '';

                // 前置摄像头
                if (
                    label.includes('front') ||
                    label.includes('user') ||
                    label.includes('facing front') ||
                    label.includes('camera 1') ||
                    label.includes('camera2 1')
                ) {
                    type = '前置摄像头';
                    emoji = '🤳';
                }
                // 🔥 优先识别 camera2 X 格式（Android Camera2 API）
                else {
                    const camera2Match = label.match(/camera2?\s+(\d+)/);
                    if (camera2Match && label.includes('back')) {
                        const cameraId = parseInt(camera2Match[1]);

                        if (cameraId === 0) {
                            type = 'Android 主摄 (camera2 0)';
                            emoji = '✅';
                        } else if (cameraId === 2) {
                            type = 'Android 辅助镜头 (camera2 2)';
                            emoji = '📐';
                            warning = '(可能是超广角或其他镜头)';
                        } else if (cameraId === 3 || cameraId === 4) {
                            type = `⚠️ Android 特殊镜头 (camera2 ${cameraId})`;
                            emoji = '🔍';
                            warning = '(可能是长焦/微距，会导致画面异常)';
                        } else {
                            type = `Android 其他镜头 (camera2 ${cameraId})`;
                            emoji = '⚪';
                        }
                    }
                    // 主摄
                    else if (label.includes('main') || label.includes('primary') || label.includes('camera 0')) {
                        type = 'Android 主摄';
                        emoji = '✅';
                    }
                    // iOS 主摄广角
                    else if (label.includes('wide') && !label.includes('ultra')) {
                        type = 'iOS 主摄广角';
                        emoji = '✅';
                    }
                    // 超广角
                    else if (label.includes('ultra')) {
                        type = '超广角';
                        emoji = '📐';
                    }
                    // 长焦（需要排除）
                    else if (label.includes('tele') || label.includes('zoom')) {
                        type = '⚠️ 长焦镜头';
                        emoji = '🔍';
                        warning = '(会导致画面放大，应避免使用)';
                    }
                    // 微距（Android，需要排除）
                    else if (label.includes('macro')) {
                        type = '⚠️ 微距镜头';
                        emoji = '🔬';
                        warning = '(近距离拍摄，不适合视频通话)';
                    }
                    // 景深（Android，需要排除）
                    else if (label.includes('depth')) {
                        type = '⚠️ 景深镜头';
                        emoji = '📷';
                        warning = '(用于背景虚化，不适合视频通话)';
                    }
                    // 普通后置
                    else if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                        type = '后置摄像头';
                        emoji = '📷';
                    }
                }

                return {
                    序号: index,
                    设备ID: device.deviceId.substring(0, 30) + '...',
                    标签: device.label || '(未提供标签)',
                    类型: `${emoji} ${type}`,
                    警告: warning,
                    推荐: emoji === '✅' ? '✅ 推荐使用' : emoji.includes('⚠️') ? '❌ 不推荐' : '⚪ 可用'
                };
            });

            console.table(cameraList);

            // 输出推荐信息
            const recommended = cameraList.filter(c => c.推荐.includes('✅'));
            const notRecommended = cameraList.filter(c => c.推荐.includes('❌'));

            if (recommended.length > 0) {
                console.log('%c✅ 推荐使用:', 'color: #00ff00; font-weight: bold;');
                console.table(recommended);
            }

            if (notRecommended.length > 0) {
                console.log('%c⚠️ 不推荐使用:', 'color: #ff0000; font-weight: bold;');
                console.table(notRecommended);
            }

            // 输出当前使用的摄像头
            const currentVideoTrack = state.localTracks.find(t => t.kind === 'video');
            if (currentVideoTrack) {
                const currentSettings = currentVideoTrack.mediaStreamTrack.getSettings();
                const currentCamera = cameraList.find(c =>
                    c.设备ID.includes(currentSettings.deviceId.substring(0, 20))
                );

                if (currentCamera) {
                    console.log('%c📍 当前使用:', 'color: #00ffff; font-weight: bold;');
                    console.table([currentCamera]);
                }
            }

            return {
                success: true,
                cameras: cameraList,
                totalCount: videoDevices.length,
                recommendedCount: recommended.length,
                notRecommendedCount: notRecommended.length
            };
        } catch (error) {
            console.error('❌ 列出摄像头失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 测试辅助函数：检测回声问题和音频配置
     * 使用方法：在控制台运行 detectEchoIssue()
     */
    function detectEchoIssue() {
        console.log('%c🔍 [音频配置检查] 开始检测...', 'color: #00ff00; font-weight: bold; font-size: 16px');

        const audioTrack = state.localTracks.find(t => t.kind === 'audio');
        if (!audioTrack) {
            console.warn('❌ 未找到音频轨道，请先加入房间');
            return {
                success: false,
                error: '未找到音频轨道'
            };
        }

        const mediaStreamTrack = audioTrack.mediaStreamTrack;
        const settings = mediaStreamTrack.getSettings();
        const capabilities =
            typeof mediaStreamTrack.getCapabilities === 'function' ? mediaStreamTrack.getCapabilities() : null;

        const result = {
            '🎤 回声消除 (Echo Cancellation)': {
                当前状态: settings.echoCancellation ? '✅ 已启用' : '❌ 未启用',
                浏览器支持: capabilities?.echoCancellation ? '✅ 支持' : '❓ 未知',
                警告: settings.echoCancellation ? '' : '⚠️ 可能有回声！'
            },
            '🔇 降噪 (Noise Suppression)': {
                当前状态: settings.noiseSuppression ? '✅ 已启用' : '❌ 未启用',
                浏览器支持: capabilities?.noiseSuppression ? '✅ 支持' : '❓ 未知'
            },
            '📊 自动增益 (Auto Gain Control)': {
                当前状态: settings.autoGainControl ? '✅ 已启用' : '❌ 未启用',
                浏览器支持: capabilities?.autoGainControl ? '✅ 支持' : '❓ 未知'
            },
            '📈 采样率 (Sample Rate)': {
                当前值: (settings.sampleRate || '未知') + ' Hz',
                推荐值: '48000 Hz',
                状态: settings.sampleRate >= 48000 ? '✅ 高质量' : '⚠️ 可提升'
            },
            '🔊 声道数 (Channel Count)': {
                当前值: settings.channelCount || '未知',
                推荐值: '1 (单声道)',
                状态: settings.channelCount === 1 ? '✅ 适合对话' : '⚪ 立体声'
            }
        };

        console.table(result);

        // 打印详细的原始数据
        console.log('%c📋 完整配置:', 'color: #00ffff; font-weight: bold;');
        console.log('Settings:', settings);
        if (capabilities) {
            console.log('Capabilities:', capabilities);
        }

        // 检查并给出建议
        const warnings = [];
        const recommendations = [];

        if (!settings.echoCancellation) {
            warnings.push('⚠️ 回声消除未启用！这可能导致模型音频被采集，形成回声');
            recommendations.push('修改 createLocalAudioTrack() 调用，显式传入 { echoCancellation: true }');
        } else {
            console.log('%c✅ 回声消除已启用，可以防止模型音频被采集', 'color: #00ff00; font-weight: bold;');
        }

        if (!settings.noiseSuppression) {
            warnings.push('⚠️ 降噪未启用，背景噪音可能影响体验');
            recommendations.push('建议启用 noiseSuppression: true');
        }

        if (settings.sampleRate < 48000) {
            warnings.push('⚠️ 采样率较低，音质可能不够清晰');
            recommendations.push('建议使用 sampleRate: 48000');
        }

        if (warnings.length > 0) {
            console.log('%c⚠️ 发现问题:', 'color: #ff9500; font-weight: bold; font-size: 14px');
            warnings.forEach(w => console.warn(w));
            console.log('%c💡 建议:', 'color: #00ffff; font-weight: bold;');
            recommendations.forEach(r => console.log('  • ' + r));
        } else {
            console.log('%c✅ 音频配置良好！', 'color: #00ff00; font-weight: bold; font-size: 16px');
        }

        console.log('\n%c📚 延伸阅读:', 'color: #9d00ff; font-weight: bold;');
        console.log('• 回声消除原理: https://webrtc.org/getting-started/audio-processing');
        console.log('• MediaStreamTrack API: https://developer.mozilla.org/docs/Web/API/MediaStreamTrack');

        return {
            success: true,
            settings,
            capabilities,
            hasEchoCancellation: settings.echoCancellation,
            warnings,
            recommendations
        };
    }

    /**
     * 🔍 导出诊断报告（用于调试和问题排查）
     * 在控制台输入 window.exportLiveKitDiagnostic() 即可获取完整诊断信息
     */
    function exportDiagnosticReport() {
        if (!state.diagnosticReport) {
            console.warn('⚠️ 诊断报告尚未生成，请先调用 joinRoom() 连接房间');
            return null;
        }

        console.log(
            '%c📋 LiveKit 诊断报告',
            'color: #ffffff; font-weight: bold; font-size: 16px; background: #0066cc; padding: 8px 16px;'
        );
        console.log(state.diagnosticReport);

        // 生成文本版本
        const reportText = Object.entries(state.diagnosticReport)
            .map(([key, value]) => {
                if (key.startsWith('═══')) {
                    return `\n${key}`;
                }
                return `${key}: ${value}`;
            })
            .join('\n');

        console.log('\n%c📄 文本版本:', 'color: #00ff00; font-weight: bold;');
        console.log(reportText);

        console.log('\n%c💡 提示:', 'color: #ffaa00; font-weight: bold;');
        console.log('1. 右键点击上方对象 → "Store as global variable" → 输入 copy(temp1) 复制');
        console.log('2. 或者选中文本版本直接复制');

        return state.diagnosticReport;
    }

    // 🔍 暴露到全局，方便在控制台调用
    if (typeof window !== 'undefined') {
        window.exportLiveKitDiagnostic = exportDiagnosticReport;
        console.log(
            '%c💡 [诊断工具] 可在控制台输入 window.exportLiveKitDiagnostic() 导出完整诊断报告',
            'color: #00aaff; font-size: 12px; background: #001a33; padding: 2px 6px;'
        );
    }

    return {
        state,
        joinRoom,
        sendData,
        switchCamera,
        toggleMic,
        toggleCam,
        leaveRoom,
        sendText,
        sendAndLeave,
        setInitConfig,
        markAudioActualPlay,
        getJitterBufferStatus,
        getPlayEndGuardStatus,
        getVideoResolution,
        debugVideoState,
        checkCurrentCamera, // 检查当前摄像头
        compareFieldOfView, // 视野对比测试
        clearCameraCache, // 清除摄像头缓存
        forceLensSelection, // 强制选择镜头（兼容 iOS 和 Android）
        listAllCameras, // 列出所有摄像头（兼容 iOS 和 Android）
        detectEchoIssue, // 🔥 检测回声问题和音频配置
        exportDiagnosticReport, // 🔍 导出诊断报告（用于问题排查）
        // 测试辅助函数
        testSendMessage,
        testBothSendMethods
    };
}
