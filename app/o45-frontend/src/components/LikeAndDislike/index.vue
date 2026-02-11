<template>
    <div class="like-box">
        <div class="like-btn" @click="selectFeedbackStatus('like')">
            <SvgIcon name="like" class="like-svg" v-if="feedbackStatus === '' || feedbackStatus === 'dislike'" />
            <SvgIcon name="like-active" class="like-svg" v-else />
        </div>
        <div class="dislike-btn" @click="selectFeedbackStatus('dislike')">
            <SvgIcon name="dislike" class="dislike-svg" v-if="feedbackStatus === '' || feedbackStatus === 'like'" />
            <SvgIcon name="dislike-active" class="dislike-svg" v-else />
        </div>
    </div>
    <el-dialog
        v-if="dialogVisible"
        v-model="dialogVisible"
        width="358"
        class="feedback-dialog"
        :title="t('feedbackDialogTitle')"
        :align-center="true"
        :modal="false"
        @close="cancelFeedback"
    >
        <el-input type="textarea" :rows="4" ref="inputRef" resize="none" v-model="comment" />
        <div class="operate-btn">
            <el-button @click="cancelFeedback">{{ t('feedbackDialogCancel') }}</el-button>
            <el-button type="primary" :loading="submitLoading" @click="submitFeedback">{{
                t('feedbackDialogSubmit')
            }}</el-button>
        </div>
    </el-dialog>
</template>
<script setup>
    import { feedback } from '@/apis';
    import { useI18n } from 'vue-i18n';

    const { t } = useI18n();
    const feedbackStatus = defineModel('feedbackStatus');
    const curResponseId = defineModel('curResponseId');
    const dialogVisible = ref(false);
    const comment = ref('');
    const submitLoading = ref(false);
    const inputRef = ref();

    const selectFeedbackStatus = val => {
        if (!curResponseId.value) {
            return;
        }
        feedbackStatus.value = val;
        // 如果是踩，弹出输入框
        if (val === 'dislike') {
            dialogVisible.value = true;
            nextTick(() => {
                inputRef.value.focus();
            });
        } else {
            submitFeedback('like');
        }
    };
    // 提交反馈
    const submitFeedback = async val => {
        submitLoading.value = true;
        const { code, message } = await feedback({
            response_id: curResponseId.value,
            rating: feedbackStatus.value || val,
            comment: comment.value
        });
        submitLoading.value = false;
        if (code !== 0) {
            ElMessage({
                type: 'error',
                message: message,
                duration: 3000,
                customClass: 'system-error'
            });
            return;
        }
        ElMessage.success('反馈成功');
        dialogVisible.value = false;
        comment.value = '';
        feedbackStatus.value = '';
    };
    const cancelFeedback = () => {
        dialogVisible.value = false;
        feedbackStatus.value = '';
    };
</script>
<style lang="less" scoped>
    .like-box {
        display: flex;
        margin: 0 8px;
        gap: 8px;
        .like-btn,
        .dislike-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }
        .like-svg,
        .dislike-svg {
            width: 20px;
            height: 20px;
        }
    }
    .operate-btn {
        margin-top: 8px;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        .el-button {
            width: 76px;
            height: 32px;
            border-radius: 12px;
            background: #f6f6f6;
            color: #464c5e;
            // font-family: 'PingFang SC';
            font-size: 14px;
            font-style: normal;
            font-weight: 400;
            line-height: normal;
            border: none;
            &:hover {
                border: none;
            }
        }
        .el-button + .el-button {
            margin-left: 0;
        }
        .el-button--primary {
            background: #5865f2;
            color: #fff;
            // font-family: 'PingFang SC';
            font-size: 14px;
            font-style: normal;
            font-weight: 500;
            line-height: normal;
            &:hover {
                border: none;
            }
        }
    }
</style>
<style lang="less">
    .feedback-dialog {
        border-radius: 16px;
        padding: 16px 20px;
        box-shadow: 0px 0px 16px 0px rgba(0, 0, 0, 0.15);
        .el-dialog__header {
            padding-bottom: 6px;
            .el-dialog__title {
                color: rgba(23, 23, 23, 0.9);
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 500;
                line-height: 20px;
            }
        }
        .el-dialog__body {
            .el-textarea__inner {
                border-radius: 8px;
                border: 1px solid #dcdcdc;
                box-shadow: none;
            }
        }
    }
</style>
