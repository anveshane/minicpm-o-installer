class AutoPlayAudioStream {
    constructor(bufferSize = 3) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioQueue = [];
        this.preBufferQueue = [];
        this.bufferSize = bufferSize;
        this.isPlaying = false;
        this.nextStartTime = this.audioContext.currentTime;
        this.endedSignalReceived = false;
        this.onEndCallback = null;
    }

    async addAudio(base64Chunk) {
        if (base64Chunk.includes('data:audio/wav;base64,')) {
            // Remove the prefix if it exists
            base64Chunk = base64Chunk.replace('data:audio/wav;base64,', '');
        }
        const binaryString = atob(base64Chunk);
        const byteArray = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            byteArray[i] = binaryString.charCodeAt(i);
        }

        try {
            // Decode audio data (async)
            const audioBuffer = await this.audioContext.decodeAudioData(byteArray.buffer);
            this.preBufferQueue.push(audioBuffer);

            // Move pre-buffer to the main queue if we have enough chunks
            if (this.preBufferQueue.length >= this.bufferSize) {
                this.audioQueue.push(...this.preBufferQueue);
                this.preBufferQueue = [];
            }

            // Start playing if not already playing and we have enough chunks
            if (!this.isPlaying) {
                this.playNextChunk();
            }
        } catch (e) {
            console.error('Error decoding audio ', e);
        }
    }

    playNextChunk() {
        if (this.audioQueue.length === 0) {
            if (this.endedSignalReceived) {
                this.isPlaying = false;
                if (this.onEndCallback) this.onEndCallback();
            }
            return;
        }

        const audioBuffer = this.audioQueue.shift();
        const bufferSource = this.audioContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(this.audioContext.destination);

        bufferSource.onended = () => {
            this.isPlaying = false;
            // Allow the next chunk to be processed
            if (this.audioQueue.length > 0 || this.preBufferQueue.length > 0) {
                this.audioQueue.push(...this.preBufferQueue);
                this.preBufferQueue = [];
                this.playNextChunk();
            } else if (this.endedSignalReceived) {
                if (this.onEndCallback) this.onEndCallback();
            }
        };

        // Adjust the start time to maintain continuous playback
        const currentTime = this.audioContext.currentTime;
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime;
        }
        bufferSource.start(this.nextStartTime);

        // Schedule the next start time based on the duration of the current buffer
        this.nextStartTime += audioBuffer.duration;
        this.isPlaying = true;
    }

    stopAudio() {
        if (this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioQueue = [];
            this.preBufferQueue = [];
            this.isPlaying = false;
            this.nextStartTime = this.audioContext.currentTime;
            this.endedSignalReceived = false;
        }
    }

    endSignal(callback) {
        this.endedSignalReceived = true;
        this.onEndCallback = callback;
        // If queue is empty and not playing, immediately call the callback
        if (this.audioQueue.length === 0 && this.preBufferQueue.length === 0 && !this.isPlaying) {
            this.onEndCallback();
        }
    }
}

export default AutoPlayAudioStream;
