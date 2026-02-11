const SAMPLE_RATE = 48000;
const INITIAL_PREBUFFER_THRESHOLD = SAMPLE_RATE * 0.2; // 200ms
const INITIAL_PREBUFFER_DELAY_MS = 200;
const STREAM_CHUNK_SIZE = SAMPLE_RATE * 0.5;
const MERGE_DELAY_MS = 150;
const FADE_SAMPLES = 128;
const MAX_CACHE_SIZE = 100;

let audioCtx, node;
let pushChain = Promise.resolve();

let prebufferQ = [],
    prebuffered = 0;
let initialTimer = null;
let streamQueue = [],
    queuedSamples = 0;
let mergeTimer = null;

let initialized = false;
let hasStarted = false;
let ended = false;
let onStart, onEnd, onStop;
const pcmCache = new Map();

export default function useAudioStream() {
    async function init({ onStart: startCb, onEnd: endCb, onStop: stopCb }) {
        if (initialized) return;
        onStart = startCb;
        onEnd = endCb;
        onStop = stopCb;

        audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        await audioCtx.audioWorklet.addModule('/audio/AudioStreamProcessor.js');
        node = new AudioWorkletNode(audioCtx, 'audio-stream-player');
        node.connect(audioCtx.destination);

        node.port.onmessage = ({ data }) => {
            if (data.type === 'ended') {
                if (!ended) {
                    ended = true;
                    resetInternal();
                    onEnd?.();
                }
            }
        };

        await audioCtx.resume().catch(() => {});
        initialized = true;
    }

    async function push(base64) {
        pushChain = pushChain.then(async () => {
            const pcm = await decodePCM(base64);
            if (!pcm?.length) return;

            if (!hasStarted) {
                prebufferQ.push(pcm);
                prebuffered += pcm.length;

                if (prebufferQ.length === 1) {
                    initialTimer = setTimeout(flushInitial, INITIAL_PREBUFFER_DELAY_MS);
                }

                if (prebuffered >= INITIAL_PREBUFFER_THRESHOLD) {
                    clearTimeout(initialTimer);
                    flushInitial();
                }
            } else {
                streamQueue.push(pcm);
                queuedSamples += pcm.length;
                if (queuedSamples >= STREAM_CHUNK_SIZE) flushQueue();
                else if (!mergeTimer) mergeTimer = setTimeout(flushQueue, MERGE_DELAY_MS);
            }

            await audioCtx.resume().catch(() => {});
        });
        return pushChain;
    }

    function flushInitial() {
        if (initialTimer) clearTimeout(initialTimer);
        initialTimer = null;
        if (!prebufferQ.length) return;

        const merged = mergeBuffers(prebufferQ);
        node.port.postMessage({ type: 'add', audioData: merged });
        prebufferQ = [];
        prebuffered = 0;
        hasStarted = true;
        onStart?.();
    }

    function markEnd() {
        flushQueue();
        node.port.postMessage({ type: 'finish' });
        ended = false; // reset flag for next session
    }

    async function stop(reason = '') {
        node.port.postMessage({ type: 'stop' });
        node.port.postMessage({ type: 'clear' });
        if (audioCtx) await audioCtx.suspend().catch(() => {});
        resetInternal();
        onStop?.(reason);
    }

    return { init, push, markEnd, stop };
}

function flushQueue() {
    if (mergeTimer) clearTimeout(mergeTimer);
    mergeTimer = null;
    if (!streamQueue.length) return;

    const merged = mergeBuffers(streamQueue);
    node.port.postMessage({ type: 'add', audioData: merged });
    streamQueue = [];
    queuedSamples = 0;
}

function mergeBuffers(buffers) {
    if (buffers.length === 1) {
        return applyFilterAndFade(buffers[0], true);
    }

    const totalLen = buffers.reduce((sum, b) => sum + b.length, 0) - FADE_SAMPLES * (buffers.length - 1);
    const out = new Float32Array(totalLen);
    let offset = 0;

    for (let i = 0; i < buffers.length; i++) {
        const current = applyFilterAndFade(buffers[i], i === 0);

        if (i === 0) {
            out.set(current, offset);
            offset += current.length;
        } else {
            const prevStart = offset - FADE_SAMPLES;
            for (let j = 0; j < FADE_SAMPLES; j++) {
                const t = j / (FADE_SAMPLES - 1);
                out[prevStart + j] = out[prevStart + j] * (1 - t) + current[j] * t;
            }
            out.set(current.subarray(FADE_SAMPLES), offset);
            offset += current.length - FADE_SAMPLES;
        }
    }

    return out;
}

function applyFilterAndFade(input, isFirst = false) {
    const buf = input.slice();
    const alpha = 0.995;
    let prevOut = 0;
    for (let i = 0; i < buf.length; i++) {
        const filtered = buf[i] - prevOut + alpha * prevOut;
        prevOut = filtered;
        buf[i] = filtered;
    }

    if (isFirst) {
        for (let i = 0; i < FADE_SAMPLES; i++) {
            buf[i] *= i / (FADE_SAMPLES - 1);
        }
    }

    for (let i = 0; i < FADE_SAMPLES; i++) {
        const idx = buf.length - 1 - i;
        buf[idx] *= i / (FADE_SAMPLES - 1);
    }

    return buf;
}

async function decodePCM(base64) {
    if (pcmCache.has(base64)) return pcmCache.get(base64);
    try {
        const binary = atob(base64);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        const decoded = await audioCtx.decodeAudioData(arr.buffer);
        const pcm = decoded.getChannelData(0).slice();
        if (pcmCache.size >= MAX_CACHE_SIZE) pcmCache.delete(pcmCache.keys().next().value);
        pcmCache.set(base64, pcm);
        return pcm;
    } catch {
        return null;
    }
}

function resetInternal() {
    prebufferQ = [];
    prebuffered = 0;
    if (initialTimer) clearTimeout(initialTimer);
    initialTimer = null;
    streamQueue = [];
    queuedSamples = 0;
    if (mergeTimer) clearTimeout(mergeTimer);
    mergeTimer = null;
    hasStarted = false;
    ended = false;
    pushChain = Promise.resolve();
}
