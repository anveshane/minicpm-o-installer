<template>
    <div
        ref="clockRef"
        class="draggable-clock"
        :style="clockStyle"
        @mousedown="onMouseDown"
        @touchstart.prevent="onTouchStart"
    >
        <div class="time-container">
            <div class="time">{{ timeString }}</div>
            <div class="latency">网络延时: {{ networkLatencyDisplay }}</div>
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
    import timeSync from '@/utils/timeSync';

    // 性能优化：支持低性能模式
    // 默认模式：20fps，显示毫秒
    // 低性能模式：1fps，不显示毫秒（可通过props控制）
    const props = defineProps({
        lowPerformanceMode: {
            type: Boolean,
            default: false // 默认关闭低性能模式
        }
    });

    const STORAGE_KEY = 'draggable-clock-pos';
    const MARGIN = 24; // 默认距离右下角间距

    const clockRef = ref(null);
    const left = ref(null);
    const top = ref(null);
    const isDragging = ref(false);
    const dragOffsetX = ref(0);
    const dragOffsetY = ref(0);
    const rafId = ref(null);
    const timeString = ref('');
    const networkLatency = ref(-1); // 初始化为-1，表示未同步
    const elSize = ref({ width: 0, height: 0 });
    let dragFramePending = false;
    let pendingL = null;
    let pendingT = null;

    // 性能优化：缓存日期部分，减少字符串拼接
    let lastDateStr = '';
    let lastDate = 0;

    const formatTime = (date, showMilliseconds = true) => {
        const pad2 = n => String(n).padStart(2, '0');
        const pad3 = n => String(n).padStart(3, '0');

        // 检查日期是否改变（只在日期变化时重新格式化日期部分）
        const currentDate = Math.floor(date.getTime() / 86400000); // 天数
        if (currentDate !== lastDate) {
            const year = date.getFullYear();
            const month = pad2(date.getMonth() + 1);
            const day = pad2(date.getDate());
            lastDateStr = `${year}-${month}-${day}`;
            lastDate = currentDate;
        }

        const h = pad2(date.getHours());
        const m = pad2(date.getMinutes());
        const s = pad2(date.getSeconds());

        if (showMilliseconds) {
            const ms = pad3(date.getMilliseconds());
            return `${lastDateStr} ${h}:${m}:${s}.${ms}`;
        } else {
            return `${lastDateStr} ${h}:${m}:${s}`;
        }
    };

    // 性能优化：根据模式动态调整更新频率
    // 默认模式：20fps（50ms），显示毫秒
    // 低性能模式：1fps（1000ms），不显示毫秒
    let lastUpdateTime = 0;
    const getUpdateInterval = () => (props.lowPerformanceMode ? 1000 : 50);

    const tickRAF = () => {
        const now = performance.now();
        const elapsed = now - lastUpdateTime;
        const updateInterval = getUpdateInterval();

        if (elapsed >= updateInterval) {
            const showMs = !props.lowPerformanceMode;
            const newTimeStr = formatTime(timeSync.getSyncedTime(), showMs);

            // 只在字符串实际改变时才更新（避免无意义的响应式更新）
            if (newTimeStr !== timeString.value) {
                timeString.value = newTimeStr;
            }

            // 实时更新网络延时（延时变化不频繁，不需要额外优化）
            const latency = timeSync.getNetworkLatency();
            if (latency !== networkLatency.value) {
                networkLatency.value = latency;
            }

            lastUpdateTime = now;
        }

        rafId.value = requestAnimationFrame(tickRAF);
    };

    const startTimer = () => {
        if (rafId.value) return;
        tickRAF();
    };
    const stopTimer = () => {
        if (rafId.value) cancelAnimationFrame(rafId.value);
        rafId.value = null;
    };

    const onVisibilityChange = () => {
        if (document.hidden) {
            stopTimer();
        } else {
            startTimer();
        }
    };

    const clampPosition = (l, t) => {
        const width = elSize.value.width || 0;
        const height = elSize.value.height || 0;
        const maxL = Math.max(0, window.innerWidth - width - 8);
        const maxT = Math.max(0, window.innerHeight - height - 8);
        return {
            l: Math.min(Math.max(0, l), maxL),
            t: Math.min(Math.max(0, t), maxT)
        };
    };

    const measureSize = () => {
        const el = clockRef.value;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        elSize.value = { width: rect.width, height: rect.height };
    };

    const savePosition = () => {
        if (left.value === null || top.value === null) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: left.value, top: top.value }));
    };

    const loadOrSetDefaultPosition = () => {
        const saved = localStorage.getItem(STORAGE_KEY);
        const el = clockRef.value;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        if (saved) {
            try {
                const { left: l, top: t } = JSON.parse(saved);
                const clamped = clampPosition(Number(l) || 0, Number(t) || 0);
                left.value = clamped.l;
                top.value = clamped.t;
                return;
            } catch (e) {
                // ignore and fall back to default
            }
        }

        // 默认右下角
        const defaultLeft = Math.max(0, window.innerWidth - width - MARGIN);
        const defaultTop = Math.max(0, window.innerHeight - height - MARGIN);
        const clamped = clampPosition(defaultLeft, defaultTop);
        left.value = clamped.l;
        top.value = clamped.t;
        savePosition();
    };

    const onMouseDown = e => {
        if (!clockRef.value) return;
        isDragging.value = true;
        const rect = clockRef.value.getBoundingClientRect();
        dragOffsetX.value = e.clientX - rect.left;
        dragOffsetY.value = e.clientY - rect.top;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = 'none';
    };
    const onMouseMove = e => {
        if (!isDragging.value) return;
        pendingL = e.clientX - dragOffsetX.value;
        pendingT = e.clientY - dragOffsetY.value;
        if (dragFramePending) return;
        dragFramePending = true;
        requestAnimationFrame(() => {
            const { l, t } = clampPosition(pendingL, pendingT);
            left.value = l;
            top.value = t;
            dragFramePending = false;
        });
    };
    const onMouseUp = () => {
        if (!isDragging.value) return;
        isDragging.value = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
        savePosition();
    };

    const onTouchStart = e => {
        if (!clockRef.value) return;
        const touch = e.touches[0];
        isDragging.value = true;
        const rect = clockRef.value.getBoundingClientRect();
        dragOffsetX.value = touch.clientX - rect.left;
        dragOffsetY.value = touch.clientY - rect.top;
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    };
    const onTouchMove = e => {
        if (!isDragging.value) return;
        const touch = e.touches[0];
        pendingL = touch.clientX - dragOffsetX.value;
        pendingT = touch.clientY - dragOffsetY.value;
        if (dragFramePending) return;
        dragFramePending = true;
        requestAnimationFrame(() => {
            const { l, t } = clampPosition(pendingL, pendingT);
            left.value = l;
            top.value = t;
            dragFramePending = false;
        });
    };
    const onTouchEnd = () => {
        if (!isDragging.value) return;
        isDragging.value = false;
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        savePosition();
    };

    const onResize = () => {
        measureSize();
        if (left.value === null || top.value === null) return;
        const clamped = clampPosition(left.value, top.value);
        left.value = clamped.l;
        top.value = clamped.t;
        savePosition();
    };

    const networkLatencyDisplay = computed(() => {
        const latency = networkLatency.value;
        if (latency === -1) {
            return '同步中...';
        }
        return `${latency}ms`;
    });

    const clockStyle = computed(() => {
        const x = left.value !== null ? left.value : 0;
        const y = top.value !== null ? top.value : 0;
        return {
            transform: `translate3d(${x}px, ${y}px, 0)`
        };
    });

    onMounted(async () => {
        // 先启动计时器显示界面（即使未同步也显示本地时间）
        startTimer();
        await nextTick();
        measureSize();
        loadOrSetDefaultPosition();

        // 后台同步服务器时间（如果还未同步）
        // 只在页面首次加载时同步一次，不自动定时同步
        if (!timeSync.isSynced) {
            await timeSync.sync();
        }
        // 同步后立即更新一次网络延时
        networkLatency.value = timeSync.getNetworkLatency();

        window.addEventListener('resize', onResize);
        document.addEventListener('visibilitychange', onVisibilityChange);
    });

    onBeforeUnmount(() => {
        stopTimer();
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
    });
</script>

<style scoped lang="less">
    .draggable-clock {
        position: fixed;
        z-index: 9999;
        cursor: move;
        user-select: none;
        background: rgba(0, 0, 0, 0.85);
        color: #ffffff;
        padding: 12px 16px;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        width: 300px;
        /* 性能优化：移除 backdrop-filter，在低性能设备上会严重影响性能 */
        /* backdrop-filter: blur(8px); */
        /* 使用 will-change 提示浏览器优化 transform 动画 */
        will-change: transform;

        .time-container {
            display: flex;
            flex-direction: column;
            gap: 6px;

            .time {
                // // font-family:
                //     ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
                font-size: 18px;
                font-weight: 600;
                letter-spacing: 0.5px;
                color: #ffffff;
            }

            .latency {
                // // font-family:
                //     ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
                font-size: 13px;
                color: #a0aec0;
                letter-spacing: 0.3px;
            }
        }
    }
</style>
