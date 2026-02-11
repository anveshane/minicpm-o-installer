<template>
    <el-dialog
        v-model="showModeSelector"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :show-close="false"
        width="90%"
        style="max-width: 480px"
        class="mode-select-dialog"
        :modal-class="'mode-select-modal'"
        :align-center="!isMobile"
    >
        <div class="dialog-container">
            <!-- Logo -->
            <div class="dialog-logo">
                <SvgIcon name="minicpm-o4" class="logo-icon" />
            </div>

            <!-- 标题 -->
            <div class="dialog-title">{{ t('modeSelectTitle') }}</div>

            <!-- 选项卡片 -->
            <div class="mode-cards">
                <div
                    class="mode-card"
                    :class="{ active: selectedMode === 'streaming' }"
                    @click="selectedMode = 'streaming'"
                >
                    <div class="card-icon">
                        <SvgIcon name="type-stream" class="icon" />
                    </div>
                    <div class="card-content">
                        <div class="card-title">{{ t('modeStreamingTitle') }}</div>
                        <div class="card-desc">{{ t('modeStreamingDesc') }}</div>
                    </div>
                </div>

                <div
                    v-if="isPc"
                    class="mode-card"
                    :class="{ active: selectedMode === 'multimodal' }"
                    @click="selectedMode = 'multimodal'"
                >
                    <div class="card-icon">
                        <SvgIcon name="type-image" class="icon" />
                    </div>
                    <div class="card-content">
                        <div class="card-title">{{ t('modeMultimodalTitle') }}</div>
                        <div class="card-desc">{{ t('modeMultimodalDesc') }}</div>
                    </div>
                </div>
            </div>

            <!-- 提示 -->
            <div class="switch-tip">{{ t('modeSwitchTip') }}</div>

            <!-- 按钮 -->
            <div class="action-button">
                <el-button type="primary" :disabled="!selectedMode" @click="handleStart" class="start-btn">
                    {{ t('modeStartBtn') }}
                </el-button>
            </div>
        </div>
    </el-dialog>
</template>

<script setup>
    import { useI18n } from 'vue-i18n';

    // 使用 defineModel 实现 v-model
    const showModeSelector = defineModel();
    const isPc = defineModel('isPc', { type: Boolean, default: true });
    const emit = defineEmits(['modeSelected']);
    const { t } = useI18n();

    // 默认选择第一个选项
    const selectedMode = ref('streaming');

    // 判断是否为移动端（与媒体查询保持一致）
    const isMobile = computed(() => {
        return window.innerWidth <= 768;
    });

    const handleStart = () => {
        // 1. 保存到 localStorage
        localStorage.setItem('hasSelectedMode', 'true');
        localStorage.setItem('selectedMode', selectedMode.value);

        // 2. 关闭弹窗
        showModeSelector.value = false;

        // 3. 通知父组件选择完成
        emit('modeSelected', selectedMode.value);

        // 4. 如果选择图文模式，跳转
        if (selectedMode.value === 'multimodal') {
            setTimeout(() => {
                window.location.href = 'https://minicpm-v.openbmb.cn/';
            }, 300);
        }
    };
</script>

<style lang="less">
    :deep(.mode-select-dialog) {
        padding: 0;
        border-radius: 20px !important;
        overflow: hidden;
        // PC/平板端保留阴影，手机端在媒体查询中移除
        box-shadow: 0 0 20px 0 rgba(0, 0, 0, 0.1);

        .el-dialog__header {
            display: none;
            padding: 0;
        }

        .el-dialog__body {
            padding: 48px 32px;
            border-radius: 20px;
        }
    }

    .dialog-container {
        display: flex;
        flex-direction: column;
        // align-items: center;
    }

    // Logo
    .dialog-logo {
        margin: 0 auto 32px;

        .logo-icon {
            width: 240px;
            height: auto;
            color: #4461f2;
        }
    }

    // 标题
    .dialog-title {
        color: #333333;
        // font-family: 'Alibaba PuHuiTi', 'PingFang SC', sans-serif;
        font-size: 16px;
        font-weight: 400;
        margin-bottom: 16px;
    }

    // 选项卡片
    .mode-cards {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 32px;
    }

    .mode-card {
        width: 100%;
        height: 74px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
        box-sizing: border-box;

        &:hover {
            border-color: #1e71ff;
        }

        &.active {
            border-color: #1e71ff;
        }

        .card-icon {
            flex-shrink: 0;
            width: 42px;
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
            border-radius: 8px;
            box-shadow: 0px 0px 6px 0px rgba(0, 0, 0, 0.1);

            .icon {
                width: 24px;
                height: 24px;
            }
        }

        .card-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;

            .card-title {
                color: #333333;
                // font-family: 'PingFang SC', sans-serif;
                font-size: 16px;
                font-weight: 500;
                line-height: 20px;
            }

            .card-desc {
                color: #666666;
                // font-family: 'PingFang SC', sans-serif;
                font-size: 14px;
                font-weight: 400;
                line-height: 18px;
            }
        }

        .card-radio {
            flex-shrink: 0;
            width: 20px;
            height: 20px;
            border: 2px solid #d0d5dd;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;

            .radio-dot {
                width: 10px;
                height: 10px;
                background: #4461f2;
                border-radius: 50%;
            }
        }

        &.active .card-radio {
            border-color: #4461f2;
        }
    }

    // 提示文字
    .switch-tip {
        width: 100%;
        margin-bottom: 28px;
        padding: 0 4px;
        color: #999;
        // font-family: 'PingFang SC', sans-serif;
        font-size: 13px;
        font-weight: 400;
        line-height: 1.5;
        text-align: center;
    }

    // 按钮
    .action-button {
        width: 100%;

        .start-btn {
            width: 100%;
            height: 56px;
            border-radius: 30px;
            background: #1e71ff;
            color: #ffffff;
            // font-family: 'PingFang SC', sans-serif;
            font-size: 18px;
            font-weight: 500;
            line-height: normal;
            border: none;
            box-shadow: none;
            transition: all 0.3s ease;

            &:hover:not(.is-disabled) {
                background: #0d5fe6;
            }

            &:active:not(.is-disabled) {
                background: #0c53cc;
            }

            &.is-disabled {
                background: #e0e4ee;
                color: #999;
                cursor: not-allowed;
            }
        }
    }

    // 平板适配（保持PC端样式，保留阴影）
    @media screen and (max-width: 1024px) and (min-width: 769px) {
        .dialog-logo {
            margin-bottom: 32px;

            .logo-icon {
                width: auto;
                height: 90px;
            }
        }

        .dialog-title {
            font-size: 24px;
            margin-bottom: 24px;
        }

        :deep(.mode-select-dialog) {
            // 平板端保留阴影
            box-shadow: 0 0 20px 0 rgba(0, 0, 0, 0.1) !important;

            .el-dialog__body {
                padding: 40px 28px;
            }
        }
    }

    // 移动端适配
    @media screen and (max-width: 768px) {
        :deep(.mode-select-dialog) {
            width: 100% !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
        }

        .dialog-logo {
            margin-bottom: 60px;

            .logo-icon {
                width: auto;
                height: 80px;
            }
        }

        .dialog-title {
            font-size: 16px;
            font-weight: 400;
            color: #333;
            margin-bottom: 20px;
            text-align: center;
        }

        .mode-cards {
            flex-direction: row;
            gap: 12px;
            margin-bottom: 20px;
        }

        .mode-card {
            flex: 1;
            width: calc(50% - 6px);
            height: 200px;
            padding: 30px 12px;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 16px;

            .card-icon {
                width: 48px;
                height: 48px;
                margin-bottom: 0;

                .icon {
                    width: 32px;
                    height: 32px;
                }
            }

            .card-content {
                gap: 8px;
                text-align: center;
                align-items: center;

                .card-title {
                    font-size: 14px;
                    line-height: 1.4;
                }

                .card-desc {
                    font-size: 12px;
                    line-height: 1.4;
                }
            }

            .card-radio {
                display: none;
            }
        }

        .switch-tip {
            margin-bottom: 24px;
            font-size: 12px;
        }

        .action-button {
            .start-btn {
                height: 52px;
                font-size: 16px;
            }
        }
    }

    // 小屏手机适配
    @media screen and (max-width: 375px) {
        :deep(.mode-select-dialog) {
            width: 100% !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
        }

        .dialog-logo {
            margin-bottom: 60px;

            .logo-icon {
                width: auto;
                height: 70px;
            }
        }

        .dialog-title {
            font-size: 16px;
            font-weight: 400;
            color: #333;
            margin-bottom: 16px;
            text-align: center;
        }

        .mode-card {
            flex: 1;
            width: calc(50% - 6px);
            height: 200px;
            padding: 30px 12px;
            flex-direction: column;
            justify-content: center;
            align-items: center;

            .card-icon {
                width: 40px;
                height: 40px;

                .icon {
                    width: 28px;
                    height: 28px;
                }
            }

            .card-content {
                text-align: center;
                align-items: center;

                .card-title {
                    font-size: 13px;
                }

                .card-desc {
                    font-size: 11px;
                }
            }
        }

        .action-button {
            .start-btn {
                height: 48px;
                font-size: 15px;
            }
        }
    }
</style>

<style lang="less">
    // 纯白色遮罩，完全挡住后面的内容
    .mode-select-modal {
        background-color: #ffffff !important;
        // PC/平板端默认居中
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    }

    // 手机端：覆盖遮罩层的对齐方式，让弹窗靠上显示
    @media screen and (max-width: 768px) {
        .mode-select-modal {
            align-items: flex-start !important;
            padding-top: 10px !important;
            overflow-y: auto !important;
        }
    }

    // 弹窗样式（PC/平板端）
    .mode-select-dialog {
        border-radius: 20px !important;
        overflow: hidden;
        padding: 48px 32px;
        box-shadow: 0 0 20px 0 rgba(0, 0, 0, 0.1) !important;
        .el-dialog__header {
            padding: 0;
        }
        .el-dialog__body {
            padding: 0;
        }
        .logo-icon {
            width: 240px;
            height: 47px;
        }
    }

    // 手机端：移除圆角和阴影
    @media screen and (max-width: 768px) {
        .mode-select-dialog {
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            top: 0 !important;
            transform: none !important;
            padding: 12px 16px 0 !important;
        }
    }

    // 小屏手机端：移除圆角和阴影
    @media screen and (max-width: 375px) {
        .mode-select-dialog {
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            top: 0 !important;
            transform: none !important;
            padding: 12px 16px 0 !important;
        }
    }
</style>
