class AutoPlayAudioStream {
    constructor() {
        // 音频上下文和节点
        this.audioContext = null;
        this.gainNode = null;
        this.currentSource = null;

        // 播放状态
        this.isPlaying = false;
        this.isPaused = false;
        this.bufferQueue = [];
        this.isAutoPlayEnabled = false;

        // 流结束状态
        this.isStreamEnded = false;
        this.pendingEnd = false;

        // 交叉淡入淡出时间(秒)
        this.fadeTime = 0.01;

        // 事件监听器
        this.eventListeners = {
            'playback-started': [],
            'playback-ended': [],
            'playback-error': [],
            'stream-ended': [],
            'stream-reset': [] // 新增流重置事件
        };

        // 初始化音频上下文
        this._initAudioContext();
    }

    // 初始化音频上下文
    _initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = 0; // 初始静音
        } catch (error) {
            this._emit('playback-error', {
                type: 'init-error',
                message: 'Audio context initialization failed',
                error
            });
        }
    }

    // 重置流状态（用于新一轮播放）
    resetStream() {
        this.isStreamEnded = false;
        this.pendingEnd = false;
        this._emit('stream-reset', {
            timestamp: this.audioContext?.currentTime || Date.now()
        });
    }

    // 标记流结束
    markStreamEnd() {
        if (this.isStreamEnded) return;

        this.pendingEnd = true;
        this._checkStreamCompletion();
    }

    // 检查流是否真正完成
    _checkStreamCompletion() {
        if (this.pendingEnd && !this.currentSource && this.bufferQueue.length === 0) {
            this.isStreamEnded = true;
            this.pendingEnd = false;
            this._emit('stream-ended', {
                timestamp: this.audioContext?.currentTime || Date.now()
            });
        }
    }

    // 添加音频到队列
    async addAudio(base64Data, metadata = {}) {
        if (!this.audioContext) {
            this._emit('playback-error', {
                type: 'context-error',
                message: 'Audio context not initialized'
            });
            return;
        }

        // 如果收到新音频且流已结束，自动重置状态
        if (this.isStreamEnded) {
            this.resetStream();
        }

        try {
            const audioData = base64Data.split(';base64,').pop();
            const arrayBuffer = this._base64ToArrayBuffer(audioData);
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.bufferQueue.push({ audioBuffer, metadata });

            if (this.isAutoPlayEnabled && !this.isPlaying && !this.isPaused) {
                this._playFromQueue();
            }
        } catch (error) {
            this._emit('playback-error', {
                type: 'decode-error',
                message: 'Audio processing failed',
                error,
                metadata
            });
        }
    }

    // 核心播放逻辑
    _playFromQueue() {
        if (this.audioContext.state !== 'running') {
            this.audioContext
                .resume()
                .then(() => {
                    this._playFromQueue();
                })
                .catch(error => {
                    this._emit('playback-error', {
                        type: 'context-error',
                        message: 'Failed to resume audio context',
                        error
                    });
                });
            return;
        }

        if (this.bufferQueue.length === 0 || this.isPaused) {
            this.isPlaying = false;
            this._checkStreamCompletion();
            return;
        }

        this.isPlaying = true;
        const { audioBuffer, metadata } = this.bufferQueue.shift();
        const now = this.audioContext.currentTime;

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode);

        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(1, now + this.fadeTime);

        this._emit('playback-started', {
            timestamp: now,
            duration: audioBuffer.duration,
            metadata
        });

        source.start(now);

        if (this.currentSource) {
            this.currentSource.stop(now + audioBuffer.duration - this.fadeTime);
        }

        source.onended = () => {
            this.currentSource = null;
            this._emit('playback-ended', {
                timestamp: this.audioContext.currentTime,
                duration: audioBuffer.duration,
                metadata
            });
            this._playFromQueue();
        };

        this.currentSource = source;
    }

    // 其他辅助方法...
    _base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    enableAutoPlay() {
        this.isAutoPlayEnabled = true;
        if (this.bufferQueue.length > 0 && !this.isPlaying) {
            this._playFromQueue();
        }
    }

    stop() {
        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource = null;
        }
        this.bufferQueue = [];
        this.isPlaying = false;
        this.isPaused = false;
        this.isStreamEnded = false;
        this.pendingEnd = false;
        this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
        this.gainNode.gain.value = 0;
    }

    destroy() {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close();
        }
        Object.keys(this.eventListeners).forEach(event => {
            this.eventListeners[event] = [];
        });
    }

    on(eventName, callback) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].push(callback);
        }
        return this;
    }

    _emit(eventName, ...args) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in ${eventName} handler:`, error);
                }
            });
        }
    }
}
export default AutoPlayAudioStream;
