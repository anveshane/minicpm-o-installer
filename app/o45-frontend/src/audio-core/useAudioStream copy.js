import { ref } from 'vue';

const MERGE_DELAY = 200;
const MIN_PREBUFFER_MS = 800;

let audioCtx;
let node;
let pushChain = Promise.resolve();
let accumulatedSamples = 0;
let minBufferSamples = 0;

let mergeQueue = [];
let mergeTimer = null;
let playing = false;
let initialized = false;

let onStartCallback;
let onEndCallback;
let onStopCallback;

export default function useAudioStream() {
    async function init({ onStart, onEnd, onStop }) {
        if (initialized) return;
        onStartCallback = onStart;
        onEndCallback = onEnd;
        onStopCallback = onStop;

        audioCtx = new AudioContext();
        minBufferSamples = audioCtx.sampleRate * (MIN_PREBUFFER_MS / 1000);
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

        initialized = true;
    }

    async function push(base64) {
        pushChain = pushChain.then(async () => {
            const pcm = await decodeBase64Wav(base64);
            if (pcm.length === 0) return;

            mergeQueue.push(pcm);
            accumulatedSamples += pcm.length;

            // 首次播放前立即发送
            if (!playing && accumulatedSamples >= minBufferSamples && mergeQueue.length > 0) {
                const merged = mergeBuffers(mergeQueue);
                mergeQueue = [];
                node.port.postMessage({ type: 'add', audioData: Array.from(merged) });
            }

            if (!playing && accumulatedSamples >= minBufferSamples + audioCtx.sampleRate * 0.1) {
                playing = true;
                onStartCallback?.();
            }

            if (!mergeTimer) {
                mergeTimer = setTimeout(() => {
                    const merged = mergeBuffers(mergeQueue);
                    mergeQueue = [];
                    mergeTimer = null;
                    node.port.postMessage({ type: 'add', audioData: Array.from(merged) });
                }, MERGE_DELAY);
            }

            if (audioCtx.state !== 'running') {
                await audioCtx.resume();
                await new Promise(r => setTimeout(r, 10));
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
        accumulatedSamples = 0;
        mergeQueue = [];
        clearTimeout(mergeTimer);
        onStopCallback?.(reason);
    }

    return { init, push, markEnd, stop };
}

// --------- 简化后的工具函数 ---------

async function decodeBase64Wav(base64) {
    const binary = atob(base64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);

    const decoded = await audioCtx.decodeAudioData(buf.buffer);
    return decoded.getChannelData(0).slice(); // 单声道
}

function mergeBuffers(buffers) {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;

    for (let i = 0; i < buffers.length; i++) {
        result.set(buffers[i], offset);
        offset += buffers[i].length;
    }

    return result;
}
