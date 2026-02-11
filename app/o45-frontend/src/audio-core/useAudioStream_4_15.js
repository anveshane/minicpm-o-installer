const MERGE_DELAY = 200;
const START_DELAY_MS = window.location.href.includes('delay') ? 3000 : 0; // 测试环境根据实际情况选择是否延迟
console.log('START_DELAY_MS', START_DELAY_MS);

let audioCtx;
let node;
let pushChain = Promise.resolve();
let accumulatedSamples = 0;

let mergeQueue = [];
let mergeTimer = null;
let playing = false;
let initialized = false;
let hasStarted = false;
let playbackDelayTimer = null;

let onStartCallback;
let onEndCallback;
let onStopCallback;

// 根据采样率和体验调整的累计样本阈值（例如 2048 个样本）
const MIN_BUFFER_SIZE = 2048;

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
                accumulatedSamples = 0;
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
            const pcm = await decodeBase64Wav(base64);
            if (pcm.length === 0) return;

            mergeQueue.push(pcm);
            accumulatedSamples += pcm.length;

            // 首次启动时启动延时播放
            if (!hasStarted && !playbackDelayTimer) {
                playbackDelayTimer = setTimeout(() => {
                    const merged = mergeBuffers(mergeQueue);
                    mergeQueue = [];
                    accumulatedSamples = 0;
                    node.port.postMessage({ type: 'add', audioData: Array.from(merged) });
                    playing = true;
                    hasStarted = true;
                    onStartCallback?.();
                }, START_DELAY_MS);
            }

            // 后续数据播放：当累计样本足够时立即合并推送，否则依然使用定时器合并
            if (hasStarted && accumulatedSamples >= MIN_BUFFER_SIZE) {
                if (mergeTimer) {
                    clearTimeout(mergeTimer);
                    mergeTimer = null;
                }
                const merged = mergeBuffers(mergeQueue);
                mergeQueue = [];
                accumulatedSamples = 0;
                node.port.postMessage({ type: 'add', audioData: Array.from(merged) });
            } else if (hasStarted && !mergeTimer) {
                mergeTimer = setTimeout(() => {
                    const merged = mergeBuffers(mergeQueue);
                    mergeQueue = [];
                    mergeTimer = null;
                    accumulatedSamples = 0;
                    node.port.postMessage({ type: 'add', audioData: Array.from(merged) });
                }, MERGE_DELAY);
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
        accumulatedSamples = 0;
    }

    function stop(reason = '') {
        node?.port.postMessage({ type: 'stop' });
        node?.port.postMessage({ type: 'clear' });
        playing = false;
        hasStarted = false;
        accumulatedSamples = 0;
        mergeQueue = [];
        clearTimeout(mergeTimer);
        clearTimeout(playbackDelayTimer);
        playbackDelayTimer = null;
        onStopCallback?.(reason);
    }

    return { init, push, markEnd, stop };
}

// ---------- 辅助工具函数 ----------

async function decodeBase64Wav(base64) {
    const binary = atob(base64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        buf[i] = binary.charCodeAt(i);
    }

    const decoded = await audioCtx.decodeAudioData(buf.buffer);
    // 这里只取单声道数据，可根据需要扩展处理多声道
    return decoded.getChannelData(0).slice();
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
