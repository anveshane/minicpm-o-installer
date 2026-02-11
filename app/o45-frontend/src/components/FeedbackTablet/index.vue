<template>
    <el-dialog
        v-model="showFeedback"
        width="490"
        :align-center="true"
        close-on-click-modal
        close-on-press-escape
        :before-close="handleClose"
        :destroy-on-close="true"
        :show-close="false"
        class="feedback-tablet-dialog"
    >
        <template #header="{ titleId, titleClass }">
            <div class="feedback-header">
                <div :id="titleId" :class="titleClass">{{ t('feedbackDialogTitle') }}</div>
                <SvgIcon name="ipad-close" class="close-icon" @click="handleClose" />
            </div>
        </template>
        <template #default>
            <div class="feedback-body">
                <div class="feedback-select">
                    <div
                        v-for="(item, index) in options"
                        :class="`feedback-select-item ${feebackSelected.includes(item.value) ? 'actived-item' : ''}`"
                        :key="index"
                        @click="handleSelect(item.value)"
                    >
                        {{ t(item.label) }}
                    </div>
                </div>
                <div class="feedback-input">
                    <div class="feedback-input-label">{{ t('feedbackSuggestion') }}</div>
                    <el-input type="textarea" v-model="feedbackMsg" resize="none" :placeholder="t('otherQuestion')" />
                </div>
            </div>
        </template>
        <template #footer>
            <div class="feedback-footer">
                <div class="feedback-footer-submit" @click="submitFeedback">{{ t('feedbackDialogSubmit') }}</div>
            </div>
        </template>
    </el-dialog>
</template>

<script setup>
    import { useI18n } from 'vue-i18n';

    defineOptions({
        name: 'FeedbackTablet'
    });

    const { t, locale } = useI18n();

    const showFeedback = defineModel();
    const emits = defineEmits(['feedbackSuccess']);

    const options = [
        {
            label: 'feedbackType.type1',
            value: 1
        },
        {
            label: 'feedbackType.type2',
            value: 2
        },
        {
            label: 'feedbackType.type3',
            value: 3
        },
        {
            label: 'feedbackType.type4',
            value: 4
        },
        {
            label: 'feedbackType.type5',
            value: 5
        },
        {
            label: 'feedbackType.type6',
            value: 6
        }
    ];
    const feebackSelected = ref([]);

    const feedbackMsg = ref('');

    const handleClose = () => {
        console.log('handleClose');
        showFeedback.value = false;
    };
    const submitFeedback = () => {
        console.log('feedback');
        ElMessage.success(t('feedbackSuccess'));
        showFeedback.value = false;
    };
    const handleSelect = val => {
        const index = feebackSelected.value.indexOf(val);
        if (index !== -1) {
            feebackSelected.value.splice(index, 1);
        } else {
            feebackSelected.value.push(val);
        }
    };
</script>

<style lang="less">
    .feedback-tablet-dialog.el-dialog {
        border-radius: 18px;
        background: #fff;
        box-shadow: 0px 0px 30px 0px rgba(0, 0, 0, 0.15);
        padding: 0;

        .el-dialog__header {
            padding: 24px 20px;
            .feedback-header {
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
                .close-icon {
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                }
            }
        }
        .el-dialog__body {
            padding: 0 20px;
            .feedback-body {
                .feedback-select {
                    display: flex;
                    flex-wrap: wrap;
                    column-gap: 30px;
                    row-gap: 12px;
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
                .feedback-input {
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
        }
        .el-dialog__footer {
            .feedback-footer {
                display: flex;
                padding: 20px 20px 24px 20px;

                &-submit {
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
    }
</style>
