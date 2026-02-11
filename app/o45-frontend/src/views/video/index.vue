<template>
    <div class="video-room">
        <!-- 未连接时：显示加入界面 -->
        <div v-if="!state.connected" class="join-panel">
            <h2>加入房间</h2>
            <input v-model="token" placeholder="LiveKit Token" />
            <select v-model="mode">
                <option value="audio">仅音频</option>
                <option value="video">音视频</option>
            </select>
            <button @click="onJoin">加入</button>
            <p v-if="state.error" class="error">连接失败：{{ state.error.message }}</p>
        </div>

        <!-- 已连接时：显示本地预览、控制按钮、消息面板 -->
        <div v-else class="connected-panel">
            <h2>已连接 (模式: {{ mode === 'video' ? '音视频' : '仅音频' }})</h2>

            <!-- 本地视频预览（仅 video 模式） -->
            <div v-if="mode === 'video'" class="video-box">
                <video ref="localVideoRef" autoplay muted playsinline></video>
                <p>本地 ({{ state.videoFacing === 'user' ? '前置' : '后置' }})</p>
            </div>

            <!-- 本地音频（自听可选，一般静音） -->
            <audio ref="localAudioRef" autoplay muted></audio>

            <!-- 远端音频播放器：为每个远端用户生成一个 <audio> -->
            <div class="remote-audio" v-for="(tracks, sid) in state.remoteTracks" :key="sid">
                <audio :ref="setRemoteAudioRef(sid)" autoplay></audio>
                <p>用户 {{ sid }}</p>
            </div>

            <!-- 设备及房间控制 -->
            <div class="controls">
                <button v-if="mode === 'video'" @click="switchCamera">
                    切换摄像头 (当前: {{ state.videoFacing === 'user' ? '前置' : '后置' }})
                </button>
                <button v-if="mode === 'video'" @click="toggleCam">
                    {{ state.videoEnabled ? '关闭摄像头' : '开启摄像头' }}
                </button>
                <button @click="toggleMic">
                    {{ state.audioEnabled ? '关闭麦克风' : '开启麦克风' }}
                </button>
                <button @click="leaveRoom">离开房间</button>
            </div>

            <!-- 文本消息收发区 -->
            <div class="chat">
                <h3>消息</h3>
                <ul>
                    <li v-for="(msg, idx) in state.messages" :key="idx">
                        <strong>{{ msg.from }}:</strong>
                        <span>{{ formatPayload(msg.payload) }}</span>
                    </li>
                </ul>
                <input v-model="outgoing" @keyup.enter="sendMessage" placeholder="输入消息，回车发送" />
                <button @click="sendMessage">发送</button>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, watch, nextTick } from 'vue';
    import { useLiveKit } from '@/hooks/useLiveKit';

    const token = ref(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NTEwOTQ2MDQsImlzcyI6ImRldmtleSIsIm5hbWUiOiI4MDIxIiwibmJmIjoxNzQ4NTAyNjA0LCJzdWIiOiI4MDIxIiwidmlkZW8iOnsicm9vbSI6IjgwMjEiLCJyb29tSm9pbiI6dHJ1ZX19.NLCv0xnLxQ0dUdoBuSuPMvzfZZciUJHsSP5BFMiAjBQ'
    );
    const mode = ref('audio');
    const outgoing = ref('');

    // 从 Composable 导入所有功能
    const { state, joinRoom, sendData, switchCamera, toggleMic, toggleCam, leaveRoom } = useLiveKit();

    // 本地媒体元素引用
    const localVideoRef = ref(null);
    const localAudioRef = ref(null);

    // 远端每个用户的 <audio> 引用集合
    const remoteAudioRefs = {};

    /**
     * 1. 监听本地轨道创建后，把本地音视频分别 attach 到对应元素
     *    - 本地视频：attach 到 <video ref="localVideoRef">
     *    - 本地音频：如果要自听，可把麦克风轨 attach 到 <audio ref="localAudioRef">
     *      但我们这里保持 muted，其实无需 attach 本地音轨
     */
    watch(
        () => state.localTracks,
        async tracks => {
            await nextTick();
            // 本地视频
            if (mode.value === 'video') {
                const vt = tracks.find(t => t.kind === 'video');
                const elV = localVideoRef.value;
                if (vt && elV) {
                    vt.attach(elV);
                }
            }
            // 本地音频（一般保持 muted，不 attach）
            // 如果测试自听，可以打开下面的注释
            // const at = tracks.find(t => t.kind==='audio')
            // const elA = localAudioRef.value
            // if (at && elA) {
            //   elA.muted = false
            //   at.attach(elA)
            // }
        },
        { deep: true }
    );

    /**
     * 2. 监听远端轨道，每当远端有音频轨时，把它 attach 到对应的 <audio>
     */
    watch(
        () => state.remoteTracks,
        async remMap => {
            await nextTick();
            for (const sid in remMap) {
                const tracks = remMap[sid];
                const audioTrack = tracks.find(t => t.kind === 'audio');
                if (audioTrack && remoteAudioRefs[sid]) {
                    audioTrack.attach(remoteAudioRefs[sid]);
                }
                // 如果后续想同时处理远端视频，可在这里作类似 attach
            }
        },
        { deep: true }
    );

    /**
     * 生成远端 <audio> 的 ref 回调
     */
    function setRemoteAudioRef(sid) {
        return el => {
            if (!el) return;
            remoteAudioRefs[sid] = el;
            // 如果远端音轨已存在，就立即 attach
            const tracks = state.remoteTracks[sid] || [];
            const at = tracks.find(t => t.kind === 'audio');
            if (at) {
                at.attach(el);
            }
        };
    }

    // 加入房间
    async function onJoin() {
        const config = { userAgent: navigator.userAgent, joinTime: Date.now() };
        await joinRoom(import.meta.env.VITE_LIVEKIT_URL, token.value, mode.value, config);
    }

    // 格式化收到的 DataChannel payload（ArrayBuffer 或字符串）
    function formatPayload(p) {
        if (p instanceof ArrayBuffer) {
            return new TextDecoder().decode(new Uint8Array(p));
        }
        return p;
    }

    // 发送文本消息
    function sendMessage() {
        if (!outgoing.value) return;
        sendData({ type: 'chat', text: outgoing.value }, true);
        state.messages.push({ from: '我', payload: outgoing.value });
        outgoing.value = '';
    }
</script>

<style scoped>
    .video-room {
        padding: 16px;
    }
    .join-panel input,
    .join-panel select {
        margin-right: 8px;
        padding: 4px;
    }
    .error {
        color: red;
        margin-top: 8px;
    }
    .connected-panel {
        margin-top: 16px;
    }
    .video-box {
        width: 320px;
        height: 240px;
        background: #000;
        margin-bottom: 8px;
    }
    video,
    audio {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .remote-audio {
        margin-top: 8px;
    }
    .controls {
        margin: 8px 0;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
    .controls button {
        padding: 6px 12px;
    }
    .chat {
        margin-top: 16px;
    }
    .chat ul {
        max-height: 150px;
        overflow-y: auto;
        padding: 0;
        list-style: none;
    }
    .chat li {
        margin-bottom: 4px;
    }
    .chat input {
        width: calc(100% - 70px);
        padding: 4px;
    }
    .chat button {
        padding: 4px 8px;
        margin-left: 4px;
    }
</style>
