<template>
    <div class="equalizer">
        <div
            v-for="(bar, i) in bars"
            :key="i"
            class="bar"
            :style="{
                transform: `scaleY(${bar.currentHeight / BASE_HEIGHT})`,
                borderRadius: bar.currentHeight <= 3 ? '50%' : '2px'
            }"
        ></div>
    </div>
</template>

<script setup>
    import { ref, watch, onBeforeUnmount } from 'vue';

    const props = defineProps({
        animation: Boolean
    });

    const BASE_HEIGHT = 25;
    const MIN_HEIGHT = 3;
    const MAX_HEIGHT = 25;
    const INITIAL_HEIGHTS = [3, 10, 17, 5, 19, 17, 12, 12, 12, 17, 12, 19, 12, 5, 3];
    const BAR_COUNT = INITIAL_HEIGHTS.length;

    const bars = ref(
        INITIAL_HEIGHTS.map(h => ({
            currentHeight: h,
            freq: 0.8 + Math.random() * 0.7, // 0.8~1.5Hz 频率
            phase: Math.random() * Math.PI * 2,
            baseHeight: h
        }))
    );

    let frameId = null;

    function animate(timestamp = 0) {
        const t = timestamp / 1000; // 转秒
        for (const bar of bars.value) {
            // 正弦波模拟自然跳动，振幅 = (最大高度 - 最小高度)/2，偏移 = baseHeight
            const amplitude = (MAX_HEIGHT - MIN_HEIGHT) / 2;
            const center = bar.baseHeight;
            const sineVal = Math.sin(2 * Math.PI * bar.freq * t + bar.phase);
            // 让跳动围绕 baseHeight +/- amplitude/2 轻微浮动，且不越界
            let height = center + sineVal * amplitude * 0.5;
            height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height));
            bar.currentHeight += (height - bar.currentHeight) * 0.1; // 用插值缓动更平滑
        }

        frameId = requestAnimationFrame(animate);
    }

    watch(
        () => props.animation,
        enabled => {
            if (enabled) {
                frameId = requestAnimationFrame(animate);
            } else {
                cancelAnimationFrame(frameId);
                frameId = null;
                // 停止动画时高度保持初始高度
                bars.value.forEach(bar => {
                    bar.currentHeight = bar.baseHeight;
                });
            }
        },
        { immediate: true }
    );

    onBeforeUnmount(() => {
        cancelAnimationFrame(frameId);
    });
</script>

<style scoped>
    .equalizer {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 25px;
        gap: 5px;
        background-color: transparent;
    }

    .bar {
        width: 3px;
        height: 25px;
        background-color: white;
        border-radius: 2px;
        transform-origin: center;
        transition: border-radius 0.3s ease;
    }
</style>
