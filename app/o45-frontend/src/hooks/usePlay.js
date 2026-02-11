class AutoPlayAudioStream {
    constructor() {
        // 音频上下文和相关节点
        this.audioContext = null;
        this.gainNode = null;
        this.currentSource = null;

        // 播放状态控制
        this.isPlaying = false;
        this.isPaused = false;
        this.bufferQueue = [];
        this.isAutoPlayEnabled = false;

        // 流状态控制
        this.isStreamEnded = false;
        this.pendingEnd = false;

        // 音频淡入淡出设置
        this.fadeTime = 0.05; // 50ms淡入淡出
        this.fadeStartTime = 0.02; // 提前20ms开始淡出

        // 顺序控制
        this.nextSequence = 0; // 音频块序列号
        this.lastPlayedSequence = -1; // 最后播放的序列号
        this.pendingPlay = null; // 等待中的播放任务

        // 事件监听器
        this.eventListeners = {
            'playback-started': [],
            'playback-ended': [],
            'playback-error': [],
            'stream-ended': [],
            'stream-reset': [],
            'buffer-low': []
        };

        // 初始化音频上下文
        this._initAudioContext();
    }

    /**
     * 初始化音频上下文
     */
    _initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive'
            });
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0;
            this.gainNode.connect(this.audioContext.destination);

            if (this.gainNode.gain.setTargetAtTime) {
                this.gainNode.gain.setTargetAtTime(1, 0, 0.01);
            }
        } catch (error) {
            this._emit('playback-error', {
                type: 'init-error',
                message: '音频上下文初始化失败',
                error
            });
        }
    }

    /**
     * 重置流状态
     */
    resetStream() {
        this.isStreamEnded = false;
        this.pendingEnd = false;
        this.nextSequence = 0;
        this.lastPlayedSequence = -1;
        this._emit('stream-reset', {
            timestamp: this.audioContext?.currentTime || Date.now()
        });
    }

    /**
     * 标记流结束
     */
    markStreamEnd() {
        if (this.isStreamEnded) return;
        this.pendingEnd = true;
        this._checkStreamCompletion();
    }

    /**
     * 检查流是否完成
     */
    _checkStreamCompletion() {
        if (this.pendingEnd && !this.currentSource && this.bufferQueue.length === 0) {
            this.isStreamEnded = true;
            this.pendingEnd = false;
            this._emit('stream-ended', {
                timestamp: this.audioContext?.currentTime || Date.now()
            });
        }
    }

    /**
     * 添加音频到播放队列
     * @param {string} base64Data - base64编码的音频数据
     * @param {object} metadata - 关联的元数据
     */
    async addAudio(base64Data, metadata = {}) {
        if (!this.audioContext) {
            this._emit('playback-error', {
                type: 'context-error',
                message: '音频上下文未初始化'
            });
            return;
        }

        if (this.isStreamEnded) {
            this.resetStream();
        }

        try {
            const audioData = base64Data.split(';base64,').pop();
            const arrayBuffer = this._base64ToArrayBuffer(audioData);

            // 为音频块分配序列号
            const sequence = this.nextSequence++;
            const enhancedMetadata = { ...metadata, _sequence: sequence };

            // 创建解码Promise并加入队列
            const decodeTask = this.audioContext.decodeAudioData(arrayBuffer.slice(0)).then(audioBuffer => ({
                audioBuffer,
                metadata: enhancedMetadata,
                sequence
            }));

            this.bufferQueue.push(decodeTask);

            // 缓冲区不足警告
            if (this.bufferQueue.length < 2) {
                this._emit('buffer-low', {
                    timestamp: this.audioContext.currentTime,
                    remainingBuffers: this.bufferQueue.length
                });
            }

            // 自动播放逻辑
            if (this.isAutoPlayEnabled && !this.isPlaying && !this.isPaused) {
                this._playFromQueue();
            }
        } catch (error) {
            this._emit('playback-error', {
                type: 'decode-error',
                message: '音频处理失败',
                error,
                metadata
            });
        }
    }

    /**
     * 核心播放逻辑
     */
    async _playFromQueue() {
        if (this.pendingPlay) return; // 已有播放任务进行中
        if (!this.audioContext) return;

        // 处理音频上下文挂起状态
        if (this.audioContext.state !== 'running') {
            try {
                await this.audioContext.resume();
            } catch (error) {
                this._emit('playback-error', {
                    type: 'context-error',
                    message: '恢复音频上下文失败',
                    error
                });
                return;
            }
        }

        // 检查停止条件
        if (this.bufferQueue.length === 0 || this.isPaused) {
            this.isPlaying = false;
            this._checkStreamCompletion();
            return;
        }

        this.pendingPlay = true;
        const now = this.audioContext.currentTime;

        try {
            // 获取并等待最早的解码任务
            const nextAudio = await this.bufferQueue[0];
            this.bufferQueue.shift();

            // 序列连续性检查
            if (this.lastPlayedSequence !== -1 && nextAudio.sequence !== this.lastPlayedSequence + 1) {
                console.warn(`序列不连续: 预期 ${this.lastPlayedSequence + 1}, 得到 ${nextAudio.sequence}`);
            }
            this.lastPlayedSequence = nextAudio.sequence;

            const { audioBuffer, metadata } = nextAudio;
            this.isPlaying = true;

            // 创建音频源
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.gainNode);

            // 设置淡入效果
            this.gainNode.gain.setValueAtTime(0, now);
            this.gainNode.gain.linearRampToValueAtTime(1, now + this.fadeTime);

            // 触发播放开始事件
            this._emit('playback-started', {
                timestamp: now,
                duration: audioBuffer.duration,
                metadata
            });

            // 开始播放
            source.start(now);

            // 处理当前正在播放的音频源
            if (this.currentSource) {
                const fadeOutTime = now + audioBuffer.duration - this.fadeStartTime;
                this.currentSource.stop(fadeOutTime + this.fadeTime);
                this.gainNode.gain.setValueAtTime(1, fadeOutTime);
                this.gainNode.gain.linearRampToValueAtTime(0, fadeOutTime + this.fadeTime);
            }

            // 设置播放结束处理
            source.onended = () => {
                this.currentSource = null;
                this._emit('playback-ended', {
                    timestamp: this.audioContext.currentTime,
                    duration: audioBuffer.duration,
                    metadata
                });

                // 继续播放队列
                if (this.bufferQueue.length > 0) {
                    this._playFromQueue();
                } else {
                    this.isPlaying = false;
                    this._checkStreamCompletion();
                }
            };

            this.currentSource = source;
        } catch (error) {
            this._emit('playback-error', {
                type: 'playback-error',
                message: '播放音频失败',
                error
            });
            this.isPlaying = false;
        } finally {
            this.pendingPlay = false;
        }
    }

    /**
     * base64转ArrayBuffer
     */
    _base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * 启用自动播放
     */
    enableAutoPlay() {
        this.isAutoPlayEnabled = true;
        if (this.bufferQueue.length > 0 && !this.isPlaying && !this.isPaused) {
            this._playFromQueue();
        }
    }

    /**
     * 停止播放
     */
    stop() {
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + this.fadeTime);

        if (this.currentSource) {
            this.currentSource.stop(now + this.fadeTime);
            this.currentSource = null;
        }

        this.bufferQueue = [];
        this.nextSequence = 0;
        this.lastPlayedSequence = -1;

        setTimeout(() => {
            this.isPlaying = false;
            this.isPaused = false;
            this.isStreamEnded = false;
            this.pendingEnd = false;
        }, this.fadeTime * 1000);
    }

    /**
     * 销毁音频流
     */
    destroy() {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close().catch(error => {
                console.error('关闭音频上下文时出错:', error);
            });
        }
        Object.keys(this.eventListeners).forEach(event => {
            this.eventListeners[event] = [];
        });
    }

    /**
     * 添加事件监听器
     */
    on(eventName, callback) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].push(callback);
        }
        return this;
    }

    /**
     * 触发事件
     */
    _emit(eventName, ...args) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`处理 ${eventName} 事件时出错:`, error);
                }
            });
        }
    }
}

export default AutoPlayAudioStream;
