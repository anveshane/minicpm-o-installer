const MIN_BUFFER_SIZE = 2048;
const MERGE_DELAY = 200;
const PREBUFFER_THRESHOLD = 48000 * 0.8; // ≈800ms（假设采样率48000Hz）
const MAX_CACHE_SIZE = 100;
const INITIAL_FADE_IN_SAMPLES = 4096; // 初始淡入采样数，可根据需要调整

let audioCtx;
let node;
let pushChain = Promise.resolve();
let accumulatedSamples = 0;
let mergeQueue = [];
let mergeTimer = null;
let playing = false;
let initialized = false;
let hasStarted = false;
let awaitingStart = false;

let onStartCallback;
let onEndCallback;
let onStopCallback;

const pcmCache = new Map();

export default function useAudioStream() {
    async function init({ onStart, onEnd, onStop }) {
        if (initialized) return;

        onStartCallback = onStart;
        onEndCallback = onEnd;
        onStopCallback = onStop;

        audioCtx = new AudioContext();
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
            const pcm = await getCachedDecodedPCM(base64);
            if (!pcm || pcm.length === 0) return;

            if (!hasStarted) {
                // 在预缓冲阶段，直接累积数据
                mergeQueue.push(pcm);
                accumulatedSamples += pcm.length;
                if (!awaitingStart) {
                    awaitingStart = true;
                }
                // 当累积到足够样本后启动播放
                if (awaitingStart && accumulatedSamples >= PREBUFFER_THRESHOLD) {
                    let merged = mergeBuffers(mergeQueue);
                    // 对合并后的音频施加初始淡入，降低播放起点突变
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
                // 播放中：对新数据与未播放数据采用同步合并
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

// --------- 工具函数 ---------

// 对合并后的 PCM 数据进行初始淡入处理，前 fadeSamples 个采样由0线性过渡到1
function applyFadeIn(buffer, fadeSamples) {
    const result = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        const factor = i < fadeSamples ? i / fadeSamples : 1;
        result[i] = buffer[i] * factor;
    }
    return result;
}

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
        const binary = atob(base64);
        const buf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buf[i] = binary.charCodeAt(i);
        }

        const decodedBuffer = await audioCtx.decodeAudioData(buf.buffer);
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
 * 将新到的 PCM 数据与 mergeQueue 中最后一段（如果存在且播放中）进行交叉淡化合并，
 * 从而使缓冲数据平滑无突变。
 */
function pushNewData(newPcm) {
    const crossfadeSamples = 128; // 可调整参数
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
