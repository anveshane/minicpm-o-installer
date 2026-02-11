const MIN_BUFFER_SIZE = 2048; // 达到该样本数后触发常规合并推送
const MERGE_DELAY = 200; // 定时合并延时
const PREBUFFER_THRESHOLD = 48000 * 0.8; // 预缓冲阈值 ≈800ms（假设采样率48000Hz）
const MAX_CACHE_SIZE = 100; // PCM 缓存最大条数
const INITIAL_FADE_IN_SAMPLES = 4096; // 初始淡入采样数（可根据需要调整）

let audioCtx;
let node;
let pushChain = Promise.resolve();
let accumulatedSamples = 0;
let mergeQueue = [];
let mergeTimer = null;
let playing = false;
let initialized = false;
let hasStarted = false; // 标识当前一轮播放是否已启动
let awaitingStart = false; // 标识当前是否处于预缓冲等待阶段

let onStartCallback;
let onEndCallback;
let onStopCallback;

const pcmCache = new Map(); // 缓存解码后的 PCM 数据，防止重复解码

export default function useAudioStream() {
    async function init({ onStart, onEnd, onStop }) {
        if (initialized) return;

        onStartCallback = onStart;
        onEndCallback = onEnd;
        onStopCallback = onStop;

        audioCtx = new AudioContext();
        // AudioWorklet 模块保持不变
        await audioCtx.audioWorklet.addModule('/audio/AudioStreamProcessor.js');

        node = new AudioWorkletNode(audioCtx, 'audio-stream-player');
        node.connect(audioCtx.destination);

        node.port.onmessage = ({ data }) => {
            if (data.type === 'ended') {
                playing = false;
                hasStarted = false;
                awaitingStart = false;
                accumulatedSamples = 0;
                mergeQueue = [];
                pushChain = Promise.resolve();
                onEndCallback?.();
            }
        };

        if (audioCtx.state === 'suspended') {
            try {
                await audioCtx.resume();
            } catch (e) {
                console.warn('[useAudioStream] resume failed at init', e);
            }
        }

        initialized = true;
    }

    async function push(base64) {
        pushChain = pushChain.then(async () => {
            // 解码 FLAC 数据，使用浏览器内置 decodeAudioData（要求浏览器支持 FLAC）
            const pcm = await getCachedDecodedPCM(base64);
            if (!pcm || pcm.length === 0) return;

            if (!hasStarted) {
                // 预缓冲阶段：未启动播放时，直接累积数据
                mergeQueue.push(pcm);
                accumulatedSamples += pcm.length;
                if (!awaitingStart) {
                    awaitingStart = true;
                }
                // 当累计样本达到预缓冲阈值后启动播放
                if (awaitingStart && accumulatedSamples >= PREBUFFER_THRESHOLD) {
                    let merged = mergeBuffers(mergeQueue);
                    // 对合并后的缓冲数据应用初始淡入，降低起始突变产生的杂音
                    merged = applyFadeIn(merged, INITIAL_FADE_IN_SAMPLES);
                    mergeQueue = [];
                    accumulatedSamples = 0;
                    node.port.postMessage({ type: 'add', audioData: Array.from(merged) });
                    playing = true;
                    hasStarted = true;
                    awaitingStart = false;
                    onStartCallback?.();
                }
            } else {
                // 播放中：新数据与待合并数据同步处理
                pushNewData(pcm);
                if (accumulatedSamples >= MIN_BUFFER_SIZE) {
                    if (mergeTimer) {
                        clearTimeout(mergeTimer);
                        mergeTimer = null;
                    }
                    const merged = mergeBuffers(mergeQueue);
                    mergeQueue = [];
                    accumulatedSamples = 0;
                    node.port.postMessage({ type: 'add', audioData: Array.from(merged) });
                } else if (!mergeTimer) {
                    mergeTimer = setTimeout(() => {
                        const merged = mergeBuffers(mergeQueue);
                        mergeQueue = [];
                        mergeTimer = null;
                        accumulatedSamples = 0;
                        node.port.postMessage({ type: 'add', audioData: Array.from(merged) });
                    }, MERGE_DELAY);
                }
            }

            if (audioCtx.state === 'suspended') {
                try {
                    await audioCtx.resume();
                } catch (e) {
                    console.warn('[useAudioStream] resume failed during push', e);
                }
            }
        });

        return pushChain;
    }

    function markEnd() {
        node?.port.postMessage({ type: 'finish' });
        playing = false;
        hasStarted = false;
        awaitingStart = false;
        accumulatedSamples = 0;
        mergeQueue = [];
        pushChain = Promise.resolve();
    }

    function stop(reason = '') {
        node?.port.postMessage({ type: 'stop' });
        node?.port.postMessage({ type: 'clear' });
        playing = false;
        hasStarted = false;
        awaitingStart = false;
        accumulatedSamples = 0;
        mergeQueue = [];
        clearTimeout(mergeTimer);
        mergeTimer = null;
        pushChain = Promise.resolve();
        onStopCallback?.(reason);
    }

    return { init, push, markEnd, stop };
}

// ---- 工具函数 ----

// 对合并后的 PCM 数据施加淡入处理：前 fadeSamples 采样值从 0 线性过渡到 1
function applyFadeIn(buffer, fadeSamples) {
    const result = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        const factor = i < fadeSamples ? i / fadeSamples : 1;
        result[i] = buffer[i] * factor;
    }
    return result;
}

// 限制缓存上限，采用 FIFO 策略
function setPCMCache(key, value) {
    if (pcmCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = pcmCache.keys().next().value;
        pcmCache.delete(oldestKey);
    }
    pcmCache.set(key, value);
}

async function getCachedDecodedPCM(base64) {
    if (pcmCache.has(base64)) {
        return pcmCache.get(base64);
    }

    try {
        // 对于 FLAC 数据，不需要剥离头部，直接解码
        const binary = atob(base64);
        const buf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buf[i] = binary.charCodeAt(i);
        }
        const decodedBuffer = await audioCtx.decodeAudioData(buf.buffer);
        // 假设返回单声道 PCM 数据；多声道情况请根据需要修改
        const pcm = decodedBuffer.getChannelData(0).slice();
        setPCMCache(base64, pcm);
        return pcm;
    } catch (err) {
        console.error('[PCM Decode Error]', err);
        return null;
    }
}

function mergeBuffers(buffers) {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
        result.set(buf, offset);
        offset += buf.length;
    }
    return result;
}

/**
 * 对新到的 PCM 数据与 mergeQueue 中最后一段进行交叉淡化合并。
 * 如果两段数据足够长，则交叉融合256个采样（交叉区长度可调整），平滑过渡；
 * 如果数据太短，则直接追加。
 */
function pushNewData(newPcm) {
    const crossfadeSamples = 128; // 交叉淡化采样数，建议 128，根据需要调整
    if (mergeQueue.length > 0) {
        let lastChunk = mergeQueue[mergeQueue.length - 1];
        if (lastChunk.length >= crossfadeSamples && newPcm.length >= crossfadeSamples) {
            const mergedLength = lastChunk.length - crossfadeSamples + newPcm.length;
            const mergedChunk = new Float32Array(mergedLength);
            mergedChunk.set(lastChunk.subarray(0, lastChunk.length - crossfadeSamples), 0);
            for (let i = 0; i < crossfadeSamples; i++) {
                const fadeOutFactor = 1 - i / crossfadeSamples;
                const fadeInFactor = i / crossfadeSamples;
                mergedChunk[lastChunk.length - crossfadeSamples + i] =
                    lastChunk[lastChunk.length - crossfadeSamples + i] * fadeOutFactor + newPcm[i] * fadeInFactor;
            }
            mergedChunk.set(newPcm.subarray(crossfadeSamples), lastChunk.length);
            mergeQueue[mergeQueue.length - 1] = mergedChunk;
        } else {
            mergeQueue.push(newPcm);
        }
    } else {
        mergeQueue.push(newPcm);
    }
    accumulatedSamples = mergeQueue.reduce((sum, buf) => sum + buf.length, 0);
}
