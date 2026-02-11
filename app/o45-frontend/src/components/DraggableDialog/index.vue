<template>
    <div
        class="draggable-dialog"
        :style="{ top: `${position.y}px`, left: `${position.x}px` }"
        ref="dialogRef"
        @mousedown.stop
        @touchstart.stop
    >
        <div class="dialog-header" @mousedown="startDrag" @touchstart="startDrag">
            <span>字幕</span>
        </div>
        <div class="dialog-content" ref="scrollContainer">
            <p v-for="(item, index) in messagesList" :key="index">{{ item }}</p>
        </div>
        <div class="dialog-footer" @click="onClose" @touchend.prevent="onClose">
            <!-- <button @click="onClose">关闭</button> -->
            <SvgIcon name="small-close" class="icon-close" />
        </div>
    </div>
</template>

<script setup>
    const props = defineProps({
        message: String
    });
    const emit = defineEmits(['close']);

    const position = ref({ x: 0, y: 0 });
    const isDragging = ref(false);
    const offset = ref({ x: 0, y: 0 });
    const dialogRef = ref(null);
    const scrollContainer = ref(null);

    // 获取事件坐标（统一处理鼠标和触摸事件）
    const getEventCoordinates = e => {
        if (e.touches && e.touches.length > 0) {
            return {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
        }
        return {
            x: e.clientX,
            y: e.clientY
        };
    };

    const startDrag = e => {
        e.preventDefault();
        isDragging.value = true;
        const coords = getEventCoordinates(e);
        offset.value = {
            x: coords.x - position.value.x,
            y: coords.y - position.value.y
        };

        // 同时监听鼠标和触摸事件
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
    };

    const onDrag = e => {
        if (!isDragging.value) return;
        e.preventDefault();
        const coords = getEventCoordinates(e);
        position.value = {
            x: coords.x - offset.value.x,
            y: coords.y - offset.value.y
        };
    };

    const stopDrag = () => {
        isDragging.value = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('touchend', stopDrag);
    };

    const onClose = () => {
        emit('close');
    };

    onBeforeUnmount(() => {
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('touchend', stopDrag);
    });
    const messagesList = computed(() => {
        return props.message.filter(item => item?.text.trim() !== '').map(item => item.text);
    });
    watch(
        messagesList,
        async () => {
            await nextTick();
            scrollToBottom();
        },
        { deep: true }
    );
    function scrollToBottom() {
        const el = scrollContainer.value;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }
</script>

<style lang="less" scoped>
    .draggable-dialog {
        position: absolute;
        width: 300px;
        height: calc(100vh - 160px);
        overflow: hidden;
        padding: 16px 4px;
        border-radius: 20px;
        background: #ffffff;
        cursor: default;
        z-index: 9999;
        user-select: none;
        box-shadow: 0px 0px 30px 0px rgba(0, 0, 0, 0.1);
        touch-action: none; // 防止触摸时的默认滚动行为

        .dialog-header {
            cursor: move;
            color: #333;
            // // font-family: Roboto;
            font-size: 12px;
            font-style: normal;
            font-weight: 500;
            line-height: 20px;
            text-align: center;
            margin-bottom: 16px;
            touch-action: none; // 确保拖拽区域不会触发滚动
        }

        .dialog-content {
            margin-bottom: 12px;
            word-break: break-word;
            color: #333;
            max-height: calc(100vh - 230px);
            padding: 0 12px;
            overflow: auto;
            touch-action: pan-y; // 允许内容区域垂直滚动
            -webkit-overflow-scrolling: touch; // iOS 平滑滚动
            p {
                padding: 8px 16px;
                border-radius: 16px;
                background: #f3f5ff;
                margin-bottom: 16px;
                color: #595f6d;
                // // font-family: Roboto;
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: 20px;
                display: inline-block;
            }
        }

        .dialog-footer {
            position: absolute;
            top: 20px;
            left: 16px;
            border-radius: 50%;
            background: rgba(118, 118, 128, 0.12);
            display: flex;
            justify-content: center;
            align-items: center;
            width: 16px;
            height: 16px;
            cursor: pointer;
            touch-action: manipulation; // 优化触摸响应
            -webkit-tap-highlight-color: transparent; // 移除点击高亮

            // 增加触摸区域（不影响视觉大小）
            &::before {
                content: '';
                position: absolute;
                top: -8px;
                left: -8px;
                right: -8px;
                bottom: -8px;
            }

            .icon-close {
                width: 6px;
                height: 6px;
                pointer-events: none; // 防止图标拦截点击事件
            }
        }
    }
</style>
