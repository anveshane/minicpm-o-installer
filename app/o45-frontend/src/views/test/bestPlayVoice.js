class AudioPlayer {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioQueue = []; // 存储所有音频数据
        this.isPlaying = false;
        this.currentSource = null;
        this.endCallback = null; // 默认回调为空
        this.manualEndSignal = false; // 手动触发结束信号
        this.playbackProgress = 0; // 播放进度
        this.gainNode = this.audioContext.createGain(); // 复用一个GainNode
        this.gainNode.connect(this.audioContext.destination); // 一次性连接音频输出
        this.isDecoding = false; // 防止解码过多音频
        this.lastUpdateTime = 0; // 上次更新时间，用于进度优化
        this.updateInterval = 100; // 播放进度更新间隔，减少频率优化
        this.isLastAudioPlaying = false; // 标记是否是最后一片音频
        this.currentAudioIndex = 0; // 记录当前播放到的音频切片索引
        this.currentAudioRound = []; // 当前播放轮次的音频切片队列
        this.isWaitingForEnd = false; // 标记是否等待最后音频播放完
        this.isAudioCompleted = false; // 当前音频是否播放完成的标识
    }

    // 设置结束回调
    setEndCallback(callback) {
        this.endCallback = callback;
    }

    // 设置播放进度回调
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    // 添加音频切片
    async addAudioSlice(base64Audio) {
        if (this.isDecoding) return; // 防止重复解码
        this.isDecoding = true;

        // 等待音频解码完成后，才继续
        const audioBuffer = await this.decodeBase64Audio(base64Audio);
        this.currentAudioRound.push(audioBuffer); // 添加到当前轮次的队列

        this.isDecoding = false;

        // 只有在当前音频播放完之前，才会开始播放新的音频
        if (!this.isPlaying) {
            this.playAudio(); // 开始播放音频
        }
    }

    // 解码base64格式音频
    async decodeBase64Audio(base64Audio) {
        const audioData = atob(base64Audio);
        const audioArrayBuffer = new ArrayBuffer(audioData.length);
        const audioDataView = new DataView(audioArrayBuffer);

        for (let i = 0; i < audioData.length; i++) {
            audioDataView.setUint8(i, audioData.charCodeAt(i));
        }

        return new Promise((resolve, reject) => {
            this.audioContext.decodeAudioData(audioArrayBuffer, resolve, reject);
        });
    }

    // 播放音频
    playAudio() {
        if (this.currentAudioRound.length === 0) return; // 如果当前轮次没有音频，直接返回

        this.isPlaying = true;
        this.currentAudioIndex = 0; // 重置当前音频索引

        // 重置标志位
        this.manualEndSignal = false;
        this.isWaitingForEnd = false;
        this.isAudioCompleted = false;

        this.playNextAudio();
    }

    // 播放下一片音频
    playNextAudio() {
        if (this.currentAudioIndex >= this.currentAudioRound.length) {
            // 如果当前轮次的音频播放完毕
            this.isPlaying = false;
            if (this.manualEndSignal && this.isWaitingForEnd) {
                // 如果手动触发结束回调，且当前已经播放完所有音频
                this.executeEndCallback();
            }

            // 清空当前轮次的音频队列，为下一轮播放做准备
            this.currentAudioRound = [];
            return;
        }

        const bufferSourceNode = this.audioContext.createBufferSource();
        bufferSourceNode.buffer = this.currentAudioRound[this.currentAudioIndex];

        bufferSourceNode.connect(this.gainNode); // 使用复用的GainNode

        // 增加音频的缓冲和控制时间，避免音频切换时的接缝
        bufferSourceNode.start(0);

        // 淡入淡出处理，避免音频接缝
        this.handleFadeInOut(bufferSourceNode);

        // 如果是最后一片音频，标记
        if (this.currentAudioIndex === this.currentAudioRound.length - 1) {
            this.isLastAudioPlaying = true;
            this.isWaitingForEnd = true; // 等待最后的音频播放完毕后再触发结束回调
        }

        // 播放完毕后，递归播放队列中的下一个音频
        bufferSourceNode.onended = () => {
            this.currentAudioIndex++;

            if (this.currentAudioIndex < this.currentAudioRound.length) {
                this.playNextAudio(); // 播放下一片音频
            } else {
                this.isPlaying = false;
                this.isAudioCompleted = true; // 标记当前音频播放完成

                // 处理结束回调
                if (this.manualEndSignal && this.isLastAudioPlaying && this.isAudioCompleted) {
                    this.executeEndCallback();
                }

                // 清空当前轮次的音频队列，为下一轮播放做准备
                this.currentAudioRound = [];
            }
        };

        // 启动播放进度追踪
        this.startProgressTracking();
    }

    // 淡入淡出效果处理
    handleFadeInOut(bufferSourceNode) {
        const fadeDuration = 0.2; // 控制淡入淡出的时长（增大时间避免尾音遗漏）

        this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime); // 先设置为 0 音量
        this.gainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + fadeDuration); // 逐渐增加音量
    }

    // 执行结束回调
    executeEndCallback() {
        if (this.endCallback) {
            this.endCallback();
        }
    }

    // 停止播放
    stopAudio(flag) {
        // 直接停止播放音频
        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource = null;
        }
        this.isPlaying = false;
        this.stopProgressTracking(); // 停止更新进度

        // 清空当前音频队列，准备播放新的音频
        this.currentAudioRound = [];
        this.currentAudioIndex = 0;
        if (flag === 1) {
            this.executeEndCallback();
        }
    }

    // 手动触发结束信号
    manualEndCallback() {
        this.manualEndSignal = true;
        if (this.isPlaying) {
            // 如果当前正在播放，标记为等待最后的音频播放完
            this.isWaitingForEnd = true;
        } else {
            // 如果没有正在播放，直接执行结束回调
            this.executeEndCallback();
        }
    }

    // 启动播放进度追踪
    startProgressTracking() {
        const updateProgress = () => {
            const currentTime = this.audioContext.currentTime;
            const duration = this.currentSource ? this.currentSource.buffer.duration : 0;

            // 只在必要时更新进度，避免除数为零
            if (duration > 0) {
                const progress = (currentTime / duration) * 100;
                this.playbackProgress = progress;

                if (this.progressCallback) {
                    this.progressCallback(progress); // 调用进度回调
                }
            }

            this.lastUpdateTime = currentTime;

            if (this.isPlaying) {
                requestAnimationFrame(updateProgress); // 使用requestAnimationFrame提高性能
            }
        };

        // 启动进度更新
        updateProgress();
    }

    // 停止播放进度追踪
    stopProgressTracking() {
        this.lastUpdateTime = 0; // 重置进度
    }
}

export default AudioPlayer;
