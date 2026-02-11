class RobustAudioPlayer {
    constructor() {
        this.audioContext = null;
        this.initAudioContext();

        this.audioQueue = [];
        this.decodingQueue = [];

        this.isPlaying = false;
        this.isDecoding = false;
        this.endedSignalReceived = false;
        this.nextStartTime = 0;
        this.currentSource = null;
        this.resetCount = 0;

        this.onPlayStartCallback = null;
        this.onChunkEndCallback = null;
        this.onAllCompleteCallback = null;
    }

    onPlayStart(callback) {
        this.onPlayStartCallback = callback;
    }

    onChunkEnd(callback) {
        this.onChunkEndCallback = callback;
    }

    onAllComplete(callback) {
        this.onAllCompleteCallback = callback;
    }

    async addAudio(base64Chunk) {
        if (this.endedSignalReceived && !this.isPlaying) {
            this.resetState();
        }

        const cleanChunk = this.cleanChunk(base64Chunk);
        this.decodingQueue.push(cleanChunk);
        await this.processDecodingQueue();

        if (!this.isPlaying) {
            this.playNextChunk();
        }
    }

    endSignal(callback) {
        if (callback) this.onAllCompleteCallback = callback;
        this.endedSignalReceived = true;
        this.checkCompletion();
    }

    stop() {
        this.resetState(true);
    }

    initAudioContext() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AC();
            this.nextStartTime = this.audioContext.currentTime;
        } catch (error) {
            console.error('初始化音频上下文失败:', error);
            throw error;
        }
    }

    async processDecodingQueue() {
        if (this.isDecoding || this.decodingQueue.length === 0) return;

        this.isDecoding = true;
        const currentResetCount = this.resetCount;

        try {
            while (this.decodingQueue.length > 0) {
                const chunk = this.decodingQueue.shift();
                const buffer = await this.decodeChunk(chunk);

                if (currentResetCount !== this.resetCount) return;

                this.audioQueue.push(buffer);

                if (this.onPlayStartCallback && !this.isPlaying) {
                    this.onPlayStartCallback();
                }
            }
        } catch (error) {
            console.error('解码失败:', error);
        } finally {
            this.isDecoding = false;
        }
    }

    playNextChunk() {
        if (this.audioQueue.length === 0 || this.isPlaying) {
            this.checkCompletion();
            return;
        }

        const audioBuffer = this.audioQueue.shift();
        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = audioBuffer;
        this.currentSource.connect(this.audioContext.destination);

        this.currentSource.onended = () => {
            this.handleChunkEnd(audioBuffer.duration);
        };

        const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);

        try {
            this.currentSource.start(startTime);
            this.isPlaying = true;
            this.nextStartTime = startTime + audioBuffer.duration;
        } catch (error) {
            console.error('播放失败:', error);
            this.isPlaying = false;
            this.checkCompletion();
        }
    }

    handleChunkEnd(duration) {
        this.isPlaying = false;
        this.currentSource = null;

        if (this.onChunkEndCallback) {
            this.onChunkEndCallback({
                duration: duration,
                remaining: this.audioQueue.length
            });
        }

        if (this.audioQueue.length > 0) {
            this.playNextChunk();
        } else {
            this.checkCompletion();
        }
    }

    checkCompletion() {
        console.log(
            '检查播放完成状态',
            this.endedSignalReceived,
            this.isPlaying,
            this.decodingQueue.length,
            this.audioQueue.length
        );
        if (
            this.endedSignalReceived &&
            !this.isPlaying &&
            !this.isDecoding &&
            this.decodingQueue.length === 0 &&
            this.audioQueue.length === 0
        ) {
            this.handleAllComplete();
        }
    }

    handleAllComplete() {
        if (this.onAllCompleteCallback) {
            const callback = this.onAllCompleteCallback;
            this.onAllCompleteCallback = null;
            callback();
        }
        this.resetState(false);
    }

    resetState(cleanEndedSignal = true) {
        this.resetCount++;
        this.audioQueue = [];
        this.decodingQueue = [];
        this.isPlaying = false;
        this.isDecoding = false;
        if (cleanEndedSignal) this.endedSignalReceived = false;
        this.nextStartTime = this.audioContext ? this.audioContext.currentTime : 0;

        if (this.currentSource) {
            try {
                this.currentSource.onended = null;
                this.currentSource.stop();
            } catch (error) {
                console.error('停止当前音频播放失败:', error);
            } finally {
                this.currentSource = null;
            }
        }
    }

    cleanChunk(chunk) {
        return chunk.replace(/^audio\/\w+;base64,/, '');
    }

    async decodeChunk(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new Promise((resolve, reject) => {
            this.audioContext.decodeAudioData(bytes.buffer, resolve, reject);
        });
    }
}

export default RobustAudioPlayer;
