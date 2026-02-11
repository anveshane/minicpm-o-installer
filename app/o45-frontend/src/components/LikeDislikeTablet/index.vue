<template>
    <div ref="wrapperRef" class="like-dislike-wrapper" v-if="show" :style="wrapperStyle">
        <div class="like-dislike-container" @mousedown="onMouseDown" @touchstart.prevent="onTouchStart">
            <!-- 点赞按钮 -->
            <div :class="['like-btn', { active: isLiked }]" @mousedown.stop @touchstart.stop @click.stop="handleLike">
                <SvgIcon :name="isLiked ? 'like-active' : 'like'" class="icon" />
            </div>

            <!-- 点踩按钮 with popover -->
            <el-popover
                :visible="showDislikeDialog"
                placement="top-end"
                :width="420"
                @update:visible="handlePopoverVisibleChange"
            >
                <div class="dislike-popover-wrapper">
                    <div class="dislike-popover-header">
                        <div class="close-btn">
                            <SvgIcon name="ipad-close" class="icon-close" @click="handleCloseDialog" />
                        </div>
                        <div class="dislike-title">{{ t('reportIssue') }}</div>
                        <div class="header-spacer"></div>
                    </div>
                    <div class="dislike-popover-content">
                        <div class="dislike-select">
                            <div
                                v-for="(item, index) in dislikeOptions"
                                :class="`dislike-select-item ${selectedIssues.includes(item.value) ? 'actived-item' : ''}`"
                                :key="index"
                                @click="handleSelectIssue(item.value)"
                            >
                                {{ item.label }}
                            </div>
                        </div>
                        <div class="dislike-input">
                            <div class="dislike-input-label">{{ t('feedbackSuggestion') }}</div>
                            <el-input
                                type="textarea"
                                v-model="feedbackMsg"
                                resize="none"
                                :placeholder="t('feedbackOtherPlaceholder')"
                            />
                        </div>
                    </div>
                    <div class="dislike-actions">
                        <div class="dislike-submit-btn" @click="handleSubmitDislike">
                            {{ t('feedbackDialogSubmit') }}
                        </div>
                    </div>
                </div>
                <template #reference>
                    <div
                        :class="['dislike-btn', { active: isDisliked }]"
                        @mousedown.stop
                        @touchstart.stop
                        @click="handleDislikeClick"
                    >
                        <SvgIcon :name="isDisliked ? 'dislike-active' : 'dislike'" class="icon" />
                    </div>
                </template>
            </el-popover>
        </div>
    </div>
</template>

<script setup>
    import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
    import { ElMessage } from 'element-plus';
    import { feedback } from '@/apis';
    import { useI18n } from 'vue-i18n';

    defineOptions({
        name: 'LikeDislikeTablet'
    });

    const props = defineProps({
        show: {
            type: Boolean,
            default: false
        }
    });

    const STORAGE_KEY = 'like-dislike-tablet-pos';
    const MARGIN = 30; // 默认距离右下角间距

    const wrapperRef = ref(null);
    const left = ref(null);
    const top = ref(null);
    const isDragging = ref(false);
    const dragOffsetX = ref(0);
    const dragOffsetY = ref(0);
    const elSize = ref({ width: 0, height: 0 });
    let dragFramePending = false;
    let pendingL = null;
    let pendingT = null;

    const isLiked = ref(false);
    const isDisliked = ref(false);
    const showDislikeDialog = ref(false);
    const selectedIssues = ref([]);
    const feedbackMsg = ref('');

    const { t } = useI18n();

    const dislikeOptions = computed(() => [
        { label: t('feedbackOptionUnnatural'), value: '音色不自然' },
        { label: t('feedbackOptionArtifacts'), value: '声音有瑕疵' },
        { label: t('feedbackOptionSlow'), value: '回复速度慢' },
        { label: t('feedbackOptionChoppy'), value: '回复不流畅' },
        { label: t('feedbackOptionIncorrect'), value: '回答不正确' },
        { label: t('feedbackOptionIrrelevant'), value: '答非所问' }
    ]);

    // 获取 userId 和 sessionId
    const getUserData = () => {
        const userId = localStorage.getItem('userId') || '';
        const sessionId = localStorage.getItem('sessionId') || '';
        return { userId, sessionId };
    };

    // 调用反馈接口
    const callFeedbackApi = async (cancel, like, feedbackText = '') => {
        try {
            const { userId, sessionId } = getUserData();
            const { code } = await feedback({
                userId,
                sessionId,
                cancel,
                like,
                feedback: feedbackText
            });

            if (code !== 0) {
                ElMessage.error(t('feedbackFailedRetry'));
                return false;
            }
            return true;
        } catch (error) {
            console.error('反馈接口调用失败:', error);
            ElMessage.error(t('feedbackFailedRetry'));
            return false;
        }
    };

    // 处理点赞
    const handleLike = async () => {
        if (isLiked.value) {
            // 取消点赞
            const success = await callFeedbackApi(true, true, '');
            if (success) {
                isLiked.value = false;
                ElMessage.success(t('likeCancelled'));
            }
        } else {
            // 点赞
            const success = await callFeedbackApi(false, true, '');
            if (success) {
                isLiked.value = true;
                isDisliked.value = false; // 自动取消点踩
                ElMessage.success(t('liked'));
            }
        }
    };

    // 处理点踩按钮点击
    const handleDislikeClick = async event => {
        console.log('🔵 点踩按钮被点击', { isDisliked: isDisliked.value, showDialog: showDislikeDialog.value });

        if (isDisliked.value) {
            // 已经点踩状态，点击取消点踩
            event.stopPropagation(); // 阻止触发 popover 显示
            const success = await callFeedbackApi(true, false, '');
            if (success) {
                isDisliked.value = false;
                showDislikeDialog.value = false;
                ElMessage.success(t('dislikeCancelled'));
            }
        } else {
            // 首次点踩 - 准备数据，让 popover 自然显示
            selectedIssues.value = [];
            feedbackMsg.value = '';
            // 不阻止事件，让 el-popover 处理显示
            console.log('🔵 准备显示弹窗');
        }
    };

    // 选择问题
    const handleSelectIssue = value => {
        const index = selectedIssues.value.indexOf(value);
        if (index !== -1) {
            selectedIssues.value.splice(index, 1);
        } else {
            selectedIssues.value.push(value);
        }
    };

    // 处理 popover 显示状态变化
    const handlePopoverVisibleChange = async val => {
        console.log('🟢 Popover 状态变化', { val, isDisliked: isDisliked.value, showDialog: showDislikeDialog.value });

        if (val && !isDisliked.value) {
            // 弹窗要显示时（首次点踩）
            console.log('🟢 设置点踩状态并显示弹窗');
            isDisliked.value = true;
            isLiked.value = false; // 自动取消点赞
            showDislikeDialog.value = true;
            ElMessage.success(t('disliked'));
        } else if (!val && showDislikeDialog.value) {
            // 弹窗要关闭时（点击空白处）
            console.log('🟢 关闭弹窗');
            await handleCloseDialog();
        }
    };

    // 关闭弹窗（不提交反馈）
    const handleCloseDialog = async () => {
        // 弹窗关闭也需要调用接口，但不传反馈内容
        await callFeedbackApi(false, false, '');
        showDislikeDialog.value = false;
        // 重置选择
        selectedIssues.value = [];
        feedbackMsg.value = '';
    };

    // 提交点踩反馈
    const handleSubmitDislike = async () => {
        // 拼接反馈信息：选项用逗号分隔，用户输入也加上
        const feedbackParts = [...selectedIssues.value];
        if (feedbackMsg.value.trim()) {
            feedbackParts.push(feedbackMsg.value.trim());
        }
        const feedbackText = feedbackParts.join(',');

        const success = await callFeedbackApi(false, false, feedbackText);
        if (success) {
            ElMessage.success(t('feedbackThanks'));
            showDislikeDialog.value = false;
            // 重置选择
            selectedIssues.value = [];
            feedbackMsg.value = '';
        }
    };

    // ==================== 拖动相关逻辑 ====================
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
        const el = wrapperRef.value;
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
        const el = wrapperRef.value;
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
        if (!wrapperRef.value) return;
        // 使用 .stop 修饰符后，这里不需要再判断按钮
        isDragging.value = true;
        const rect = wrapperRef.value.getBoundingClientRect();
        dragOffsetX.value = e.clientX - rect.left;
        dragOffsetY.value = e.clientY - rect.top;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = 'none';
        e.preventDefault(); // 防止文本选择
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
        if (!wrapperRef.value) return;
        // 使用 .stop 修饰符后，这里不需要再判断按钮
        const touch = e.touches[0];
        isDragging.value = true;
        const rect = wrapperRef.value.getBoundingClientRect();
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

    const wrapperStyle = computed(() => {
        const x = left.value !== null ? left.value : 0;
        const y = top.value !== null ? top.value : 0;
        return {
            transform: `translate3d(${x}px, ${y}px, 0)`
        };
    });

    // 监听 show 变化，重置状态
    watch(
        () => props.show,
        newVal => {
            if (newVal) {
                isLiked.value = false;
                isDisliked.value = false;
                // 显示时初始化位置
                nextTick(() => {
                    measureSize();
                    loadOrSetDefaultPosition();
                });
            }
        }
    );

    onMounted(async () => {
        await nextTick();
        measureSize();
        loadOrSetDefaultPosition();
        window.addEventListener('resize', onResize);
    });

    onBeforeUnmount(() => {
        window.removeEventListener('resize', onResize);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
    });
</script>

<style lang="less" scoped>
    .like-dislike-wrapper {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 1000;
        user-select: none;
        will-change: transform;

        .like-dislike-container {
            width: 150px;
            height: 66px;
            padding: 0 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 22px;
            background: #ffffff;
            border-radius: 200px;
            box-shadow: 0px 4px 20px 0px rgba(0, 0, 0, 0.1);
            cursor: move;
            touch-action: none;

            .like-btn,
            .dislike-btn {
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 50%;
                transition: all 0.3s ease;
                color: #8c8c8c;
                touch-action: auto;

                .icon {
                    width: 36px;
                    height: 36px;
                }

                &:hover {
                    background: #f6f8ff;
                }

                &:active {
                    transform: scale(0.95);
                }
            }

            .like-btn {
                &.active {
                    color: #52c41a;
                    background: #f6ffed;
                }
            }

            .dislike-btn {
                &.active {
                    color: #ff4d4f;
                    background: #fff1f0;
                }
            }
        }
    }
</style>

<style lang="less">
    /* Popover 全局样式 */
    .dislike-popover-wrapper {
        .dislike-popover-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 44px;
            padding: 4px 10px;
            border-bottom: 1px solid rgba(89, 95, 109, 0.2);

            .close-btn {
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                flex-shrink: 0;

                .icon-close {
                    width: 18px;
                    height: 18px;
                }
            }

            .dislike-title {
                flex: 1;
                text-align: center;
                color: #333;
                // font-family: Roboto;
                font-size: 16px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
            }

            .header-spacer {
                width: 36px;
                flex-shrink: 0;
            }
        }

        .dislike-popover-content {
            padding: 20px;

            .dislike-select {
                display: flex;
                flex-wrap: wrap;
                column-gap: 20px;
                row-gap: 10px;

                &-item {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 44px;
                    padding: 0 16px;
                    border-radius: 90px;
                    border: 1px solid rgba(89, 95, 109, 0.2);
                    background: #fff;
                    color: #595f6d;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                    cursor: pointer;
                    user-select: none;
                }

                .actived-item {
                    border: 1px solid #1e71ff;
                    background: #e6f0ff;
                    color: #1a71ff;
                }
            }

            .dislike-input {
                margin-top: 12px;

                &-label {
                    margin-bottom: 10px;
                    color: #595f6d;
                    // font-family: 'PingFang SC';
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 500;
                    line-height: normal;
                }

                .el-textarea {
                    .el-textarea__inner {
                        height: 96px !important;
                        min-height: 96px !important;
                        max-height: 96px !important;
                        border-radius: 8px;
                        background-color: #f6f6f6;
                        border: none;
                        box-shadow: none !important;
                        resize: none;
                    }
                }
            }
        }

        .dislike-actions {
            padding: 0 20px 20px;

            .dislike-submit-btn {
                width: 100%;
                height: 48px;
                display: flex;
                justify-content: center;
                align-items: center;
                border-radius: 24px;
                background: #1e71ff;
                color: #fff;
                text-align: center;
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 500;
                line-height: 22px;
                letter-spacing: -0.01px;
                cursor: pointer;
                user-select: none;
                transition: background 0.3s ease;

                &:hover {
                    background: #1562e6;
                }

                &:active {
                    background: #0d52cc;
                }
            }
        }
    }
</style>
