<template>
    <div class="like-dislike-wrapper" v-if="show">
        <div class="like-dislike-container">
            <!-- 点赞按钮 -->
            <div :class="['like-btn', { active: isLiked }]" @click="handleLike">
                <SvgIcon :name="isLiked ? 'like-active' : 'like'" class="icon" />
            </div>
            <!-- 点踩按钮 -->
            <div :class="['dislike-btn', { active: isDisliked }]" @click="handleDislike">
                <SvgIcon :name="isDisliked ? 'dislike-active' : 'dislike'" class="icon" />
            </div>
        </div>

        <!-- 点踩反馈弹窗 -->
        <el-dialog
            v-model="showDislikeDialog"
            width="490"
            :align-center="true"
            close-on-click-modal
            close-on-press-escape
            :before-close="handleCloseDialog"
            :destroy-on-close="true"
            :show-close="false"
            class="dislike-dialog"
        >
            <template #header="{ titleId, titleClass }">
                <div class="dislike-header">
                    <div :id="titleId" :class="titleClass">{{ t('reportIssue') }}</div>
                    <SvgIcon name="close" @click="handleCloseDialog" />
                </div>
            </template>
            <template #default>
                <div class="dislike-body">
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
                        <el-input
                            type="textarea"
                            v-model="feedbackMsg"
                            resize="none"
                            :placeholder="t('feedbackOtherPlaceholder')"
                        />
                    </div>
                </div>
            </template>
            <template #footer>
                <div class="dislike-footer">
                    <div class="dislike-footer-cancel" @click="handleCloseDialog">{{ t('feedbackDialogCancel') }}</div>
                    <div class="dislike-footer-submit" @click="handleSubmitDislike">
                        {{ t('feedbackDialogSubmit') }}
                    </div>
                </div>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
    import { ref, watch, computed } from 'vue';
    import { ElMessage } from 'element-plus';
    import { feedback } from '@/apis';
    import { useI18n } from 'vue-i18n';

    const props = defineProps({
        show: {
            type: Boolean,
            default: false
        }
    });

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

    // 处理点踩
    const handleDislike = async () => {
        if (isDisliked.value) {
            // 取消点踩
            const success = await callFeedbackApi(true, false, '');
            if (success) {
                isDisliked.value = false;
                ElMessage.success(t('dislikeCancelled'));
            }
        } else {
            // 点踩 - 先清空状态，再弹窗
            selectedIssues.value = [];
            feedbackMsg.value = '';
            isDisliked.value = true;
            isLiked.value = false; // 自动取消点赞
            showDislikeDialog.value = true;
            ElMessage.success(t('disliked'));
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

    // 监听 show 变化，重置状态
    watch(
        () => props.show,
        newVal => {
            if (newVal) {
                isLiked.value = false;
                isDisliked.value = false;
            }
        }
    );
</script>

<style lang="less" scoped>
    .like-dislike-wrapper {
        position: fixed;
        bottom: 30px;
        right: 30px;
        z-index: 1000;

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
    .dislike-dialog.el-dialog {
        border-radius: 18px;
        background: #fff;
        box-shadow: 0px 0px 30px 0px rgba(0, 0, 0, 0.15);
        padding: 0;

        .el-dialog__header {
            padding: 24px 20px;
            .dislike-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                .el-dialog__title {
                    color: #333;
                    font-feature-settings:
                        'liga' off,
                        'clig' off;
                    // font-family: Roboto;
                    font-size: 16px;
                    font-style: normal;
                    font-weight: 500;
                    line-height: normal;
                    text-transform: capitalize;
                }
                .svg-icon {
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                }
            }
        }
        .el-dialog__body {
            padding: 0 20px;
            .dislike-body {
                .dislike-select {
                    display: flex;
                    flex-wrap: wrap;
                    column-gap: 30px;
                    row-gap: 12px;
                    &-item {
                        padding: 8px 16px;
                        border-radius: 90px;
                        border: 0.5px solid rgba(89, 95, 109, 0.2);
                        background: #ffffff;
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
                        border: 0.5px solid #e6f0ff;
                        background: #e6f0ff;
                        color: #1a71ff;
                        padding: 8px 16px;
                    }
                }
                .dislike-input {
                    margin-top: 12px;
                    .el-textarea {
                        .el-textarea__inner {
                            height: 99px;
                            border-radius: 8px;
                            border: 0.5px solid #e3e7f1;
                        }
                    }
                }
            }
        }
        .el-dialog__footer {
            .dislike-footer {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                padding: 20px 20px 24px 20px;
                &-cancel,
                &-submit {
                    width: 76px;
                    height: 32px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    border-radius: 8px;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                    cursor: pointer;
                    user-select: none;
                }
                &-cancel {
                    color: #464c5e;
                    background: #f6f6f6;
                }
                &-submit {
                    color: #ffffff;
                    background: #1a71ff;
                }
            }
        }
    }
</style>
