<template>
    <div :class="`skip-btn ${disabled ? 'disabled-btn' : ''}`">
        <div class="pause-icon">
            <SvgIcon name="pause" className="pause-svg" />
        </div>
        <span class="btn-text">{{ t('skipMessageBtn') }}</span>
    </div>
</template>
<script setup>
    import { useI18n } from 'vue-i18n';

    const { t } = useI18n();
    defineProps({
        disabled: {
            type: Boolean,
            default: false
        }
    });
</script>
<style lang="less">
    .skip-btn {
        width: 120px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        padding: 2px 14px 2px 2px;
        gap: 8px;
        border-radius: 90px;
        border: 1px solid #5865f2;
        cursor: pointer;
        user-select: none;
        .pause-icon {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 28px;
            height: 28px;
            background: #5865f2;
            border-radius: 50%;
            color: #ffffff;
            .pause-svg {
                width: 14px;
                height: 14px;
                color: #ffffff;
            }
        }
        .btn-text {
            color: #5865f2;
            // font-family: 'PingFang SC';
            font-size: 14px;
            font-style: normal;
            font-weight: 400;
            line-height: normal;
        }
    }
    .skip-btn.disabled-btn {
        cursor: not-allowed;
        background: #f3f3f3;
        border: 1px solid #f3f3f3;
        .pause-icon {
            background: #d1d1d1;
            .pause-svg {
                color: #ffffff;
            }
        }
        .btn-text {
            color: #d1d1d1;
        }
    }
</style>
