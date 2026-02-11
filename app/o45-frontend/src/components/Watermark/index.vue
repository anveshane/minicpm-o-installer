<template>
    <!-- 水印容器 -->
    <div id="watermark" class="watermark-layer"></div>
</template>

<script setup>
    const props = defineProps({
        text: {
            type: String,
            default: '机密水印'
        }
    });

    // 初始化水印
    onMounted(() => {
        const watermarkEl = document.getElementById('watermark');
        watermarkEl.style.backgroundImage = `url(${createWatermarkCanvas(props.text)})`;
    });
    function createWatermarkCanvas(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 300;

        canvas.width = size;
        canvas.height = size;
        ctx.clearRect(0, 0, size, size);

        ctx.globalAlpha = 0.1; // 控制透明度
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.translate(size / 2, size / 2);
        ctx.rotate((-30 * Math.PI) / 180); // 倾斜角度
        ctx.fillText(text, 0, 0);

        return canvas.toDataURL();
    }
</script>

<style scoped lang="less">
    .watermark-layer {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        user-select: none;
        z-index: 9999;
        background-repeat: repeat;
        opacity: 0.2;
    }
</style>
