class AudioStreamPlayer extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 48000 * 30;
        this.buffer = new Float32Array(this.bufferSize);
        this.readIndex = 0;
        this.writeIndex = 0;
        this.started = false;
        this.stopped = false;
        this.finished = false;
        this.silentStartupFrames = 128;

        this.port.onmessage = ({ data }) => {
            if (data.type === 'add') {
                this._write(new Float32Array(data.audioData));
            } else if (data.type === 'stop') {
                this.stopped = true;
            } else if (data.type === 'clear') {
                this.readIndex = this.writeIndex = 0;
                this.started = false;
                this.stopped = false;
                this.finished = false;
                this.silentStartupFrames = 128;
            } else if (data.type === 'finish') {
                this.finished = true;
            }
        };
    }

    _write(data) {
        for (let i = 0; i < data.length; i++) {
            this.buffer[this.writeIndex] = data[i];
            this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
            if (this.writeIndex === this.readIndex) {
                this.readIndex = (this.readIndex + 128) % this.bufferSize;
            }
        }
    }

    process(_, outputs) {
        const output = outputs[0][0];
        const frames = output.length;
        const available =
            this.writeIndex >= this.readIndex
                ? this.writeIndex - this.readIndex
                : this.bufferSize - this.readIndex + this.writeIndex;

        if (this.stopped) {
            output.fill(0);
            return true;
        }

        if (!this.started) {
            output.fill(0);
            if (--this.silentStartupFrames <= 0) this.started = true;
            return true;
        }

        if (available >= frames) {
            for (let i = 0; i < frames; i++) {
                output[i] = this.buffer[this.readIndex];
                this.readIndex = (this.readIndex + 1) % this.bufferSize;
            }
        } else {
            for (let i = 0; i < frames; i++) {
                const idx = (this.readIndex + i) % this.bufferSize;
                output[i] = i < available ? this.buffer[idx] : 0;
            }
            this.readIndex = this.writeIndex;
        }

        if (this.finished && available === 0) {
            this.port.postMessage({ type: 'ended' });
            this.finished = false;
        }

        return true;
    }
}

registerProcessor('audio-stream-player', AudioStreamPlayer);
