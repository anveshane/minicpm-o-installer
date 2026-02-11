let audioCtx = null;
let node = null;
let lastTail = null;
let onStartCallback = null;
let onEndCallback = null;

const FADE_SAMPLES = 128;
const processorUrl = '/audio/AudioStreamProcessor.js';

export default function useAudioStream() {
    let initialized = false;
    let playing = false;

    async function init({ onStart, onEnd }) {
        if (initialized) return;

        onStartCallback = onStart;
        onEndCallback = onEnd;

        audioCtx = new AudioContext();
        await audioCtx.audioWorklet.addModule(processorUrl);
        node = new AudioWorkletNode(audioCtx, 'audio-stream-player');
        node.connect(audioCtx.destination);

        node.port.onmessage = event => {
            console.log('eeee: ', event);
            if (event.data.type === 'ended' || event.data.type === 'finished') {
                playing = false;
                onEndCallback?.();
            }
        };

        initialized = true;
    }

    async function push(base64) {
        const pcm = await decodeBase64Wav(base64);
        const trimmed = trimSilence(pcm);
        if (trimmed.length === 0) return;

        let processed = trimmed.slice();
        if (lastTail && processed.length >= FADE_SAMPLES) {
            for (let i = 0; i < FADE_SAMPLES; i++) {
                const fadeIn = i / FADE_SAMPLES;
                const fadeOut = 1 - fadeIn;
                processed[i] = lastTail[i] * fadeOut + processed[i] * fadeIn;
            }
        }

        if (processed.length >= FADE_SAMPLES) {
            lastTail = processed.slice(processed.length - FADE_SAMPLES);
        } else {
            lastTail = processed.slice();
        }

        node.port.postMessage({ type: 'add', audioData: Array.from(processed) });

        if (!playing) {
            playing = true;
            onStartCallback?.();
        }

        if (audioCtx.state !== 'running') {
            await audioCtx.resume();
        }
    }

    function markEnd() {
        node?.port.postMessage({ type: 'finish' });
    }

    function stop() {
        console.log('stop');
        node?.port.postMessage({ type: 'stop' });
        playing = false;
    }

    return {
        init,
        push,
        markEnd,
        stop
    };
}

// --- 工具函数 ---

async function decodeBase64Wav(base64) {
    const binary = atob(base64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        buf[i] = binary.charCodeAt(i);
    }

    if (!audioCtx) throw new Error('audioCtx 未初始化');
    let audioBuf = await audioCtx.decodeAudioData(buf.buffer);

    if (audioBuf.sampleRate !== audioCtx.sampleRate) {
        const offlineCtx = new OfflineAudioContext(
            audioBuf.numberOfChannels,
            audioBuf.duration * audioCtx.sampleRate,
            audioCtx.sampleRate
        );
        const src = offlineCtx.createBufferSource();
        src.buffer = audioBuf;
        src.connect(offlineCtx.destination);
        src.start();
        audioBuf = await offlineCtx.startRendering();
    }

    return audioBuf.getChannelData(0).slice();
}

function trimSilence(pcm, threshold = 0.001, minSilenceSamples = 160) {
    let start = 0;
    let end = pcm.length;

    for (let i = 0; i < pcm.length - minSilenceSamples; i++) {
        let silent = true;
        for (let j = 0; j < minSilenceSamples; j++) {
            if (Math.abs(pcm[i + j]) > threshold) {
                silent = false;
                break;
            }
        }
        if (!silent) {
            start = i;
            break;
        }
    }

    for (let i = pcm.length - minSilenceSamples; i > 0; i--) {
        let silent = true;
        for (let j = 0; j < minSilenceSamples; j++) {
            if (Math.abs(pcm[i - j]) > threshold) {
                silent = false;
                break;
            }
        }
        if (!silent) {
            end = i;
            break;
        }
    }

    return pcm.slice(start, end);
}
