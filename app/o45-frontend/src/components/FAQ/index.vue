<template>
    <div class="faq-box">
        <span class="faq-box-label">{{ t('faq') }}</span>
        <el-tooltip class="box-item" effect="dark" placement="bottom" popper-class="faq-popper">
            <template #content>
                <div class="faq-item">
                    <p class="faq-item-question">{{ t('q1') }}</p>
                    <p class="faq-item-answer">{{ t('a1') }}</p>
                </div>
                <div class="faq-item">
                    <p class="faq-item-question">{{ t('q2') }}</p>
                    <p class="faq-item-answer">{{ t('a2') }}</p>
                </div>
                <div class="faq-item">
                    <p class="faq-item-question">{{ t('q3') }}</p>
                    <p class="faq-item-answer">{{ t('a3') }}</p>
                </div>
            </template>
            <SvgIcon name="question" class="question-icon" />
        </el-tooltip>
    </div>
</template>
<script setup>
    import { useI18n } from 'vue-i18n';

    const { t } = useI18n();
</script>
<style lang="less" scoped>
    .faq-box {
        display: flex;
        justify-content: center;
        align-items: center;
        .faq-box-label {
            color: #595f6d;
            // font-family: Roboto;
            font-size: 14px;
            font-style: normal;
            font-weight: 400;
            line-height: normal;
            user-select: none;
        }
        .question-icon {
            width: 16px;
            height: 16px;
            cursor: pointer;
            margin-left: 4px;
            &:focus {
                outline: none;
            }
        }
    }
</style>
<style lang="less">
    .el-popper.is-dark.faq-popper {
        max-width: 490px;
        // font-family: PingFang SC;
        border-radius: 8px;
        line-height: 1.4;
        padding: 16px;
        background: rgba(17, 17, 17, 1);
        border: none;
        font-size: 12px;
        .faq-item:not(:last-of-type) {
            margin-bottom: 12px;
        }
        .el-popper__arrow::before {
            background: rgba(17, 17, 17, 1);
            border: 1px solid rgba(17, 17, 17, 1);
        }
    }
</style>
