/**
 * 将多个 Base64 音频段（WAV 或 FLAC）合并成一个连续的音频并返回可播放的 URL.
 *
 * @param {string[]} base64List - 一组不带 data: 前缀的 Base64 音频数据。
 * @param {'wav'|'flac'} [format='wav'] - 输入数据格式，内部只支持输出 wav。
 * @returns {Promise<string>} 返回一个 Promise，resolve 为可直接赋给 <audio> 的 src 字符串。
 */
export async function mergeBase64AudioSegments(base64List, format = 'wav') {
    // 1. 创建 AudioContext（兼容前缀）
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();

    // 2. 依次将每段 Base64 解码并 decode 为 AudioBuffer
    const buffers = await Promise.all(
        base64List.map(async b64 => {
            const binary = atob(b64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            return await audioCtx.decodeAudioData(bytes.buffer);
        })
    );

    // 3. 计算拼接后总长、采样率、声道数
    const sampleRate = buffers[0].sampleRate;
    const channelCount = Math.max(...buffers.map(b => b.numberOfChannels));
    const totalLen = buffers.reduce((sum, b) => sum + b.length, 0);

    // 4. 在 AudioContext 中创建目标 AudioBuffer
    const outBuf = audioCtx.createBuffer(channelCount, totalLen, sampleRate);

    // 5. 按顺序拷贝每段数据到 outBuf
    let offset = 0;
    for (const buf of buffers) {
        for (let ch = 0; ch < channelCount; ch++) {
            const dst = outBuf.getChannelData(ch);
            const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
            dst.set(src, offset);
        }
        offset += buf.length;
    }

    // 6. 把合并后的 AudioBuffer 编码成 WAV ArrayBuffer
    const wavArray = encodeWAV(outBuf);

    // 7. 生成 Blob 并创建 Object URL
    const blob = new Blob([wavArray], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}

/**
 * 将 AudioBuffer 编码为 16-bit PCM WAV ArrayBuffer
 */
function encodeWAV(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;

    // 交错通道
    const samples = interleave(buffer);
    const dataSize = samples.length * bytesPerSample;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);
    let o = 0;

    const writeStr = s => {
        for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i));
    };

    // RIFF header
    writeStr('RIFF');
    view.setUint32(o, 36 + dataSize, true);
    o += 4;
    writeStr('WAVE');

    // fmt chunk
    writeStr('fmt ');
    view.setUint32(o, 16, true);
    o += 4; // Subchunk1Size
    view.setUint16(o, 1, true);
    o += 2; // AudioFormat = PCM
    view.setUint16(o, numChannels, true);
    o += 2;
    view.setUint32(o, sampleRate, true);
    o += 4;
    view.setUint32(o, sampleRate * blockAlign, true);
    o += 4;
    view.setUint16(o, blockAlign, true);
    o += 2;
    view.setUint16(o, bitsPerSample, true);
    o += 2;

    // data chunk
    writeStr('data');
    view.setUint32(o, dataSize, true);
    o += 4;

    // PCM samples
    for (let i = 0; i < samples.length; i++, o += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return buf;
}

/**
 * 交错多声道数据
 */
function interleave(buffer) {
    const nc = buffer.numberOfChannels;
    const len = buffer.length;
    const out = new Float32Array(len * nc);
    for (let i = 0; i < len; i++) {
        for (let ch = 0; ch < nc; ch++) {
            out[i * nc + ch] = buffer.getChannelData(ch)[i];
        }
    }
    return out;
}
