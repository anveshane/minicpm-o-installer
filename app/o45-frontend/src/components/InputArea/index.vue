<template>
    <div class="input-container">
        <el-input
            v-model="query"
            :class="`${getInputClass}`"
            :placeholder="t('textInputPlaceholder')"
            @blur="handleToggleFocus"
            @focus="handleToggleFocus"
            @keyup.enter="handleSend"
        />
        <div class="send-btn" v-if="isFocus || query.length > 0" @click="handleSend">
            <SvgIcon name="send" class="send-icon" />
            <span class="send-label">{{ t('sendBtn') }}</span>
        </div>
    </div>
</template>
<script setup>
    import { ElMessage } from 'element-plus';
    import { useI18n } from 'vue-i18n';
    const { t, locale } = useI18n();
    const query = defineModel('query');
    const sendLoading = defineModel('sendLoading');
    const emits = defineEmits(['sendText']);
    const isFocus = ref(false);

    const handleToggleFocus = () => {
        isFocus.value = !isFocus.value;
    };
    const handleSend = () => {
        // ElMessage.success('发送成功');
        if (query.value.trim() !== '') {
            // emits('sendText', query.value);
            sendLoading.value = true;
        } else {
            ElMessage({
                type: 'warning',
                message: t('emptyMessage'),
                duration: 3000,
                customClass: 'system-error'
            });
        }
    };
    const getInputClass = computed(() => {
        let str = '';
        if (isFocus.value || query.value.length > 0) {
            str = 'uncollapse-input';
        } else {
            str = 'collapse-input';
            if (locale.value === 'zh') {
                str += ' input-zh-init';
            } else {
                str += ' input-en-init';
            }
        }
        return str;
    });
</script>
<style lang="less" scoped>
    .input-container {
        // border: 1px solid #000000;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        width: 100%;
        .uncollapse-input {
            width: 100%;
        }
        .collapse-input.input-zh-init {
            width: 94px;
        }
        .collapse-input.input-en-init {
            width: 140px;
        }
        &:has(.uncollapse-input) {
            padding: 0px 4px 4px 12px;
            border: 1px solid #5865f2;
            border-radius: 12px 12px 4px 12px;
            overflow: hidden;
        }
        .send-btn {
            padding: 4px 8px;
            display: flex;
            align-items: center;
            gap: 2px;
            background: #5865f2;
            border-radius: 8px 8px 2px 8px;
            color: #ffffff;
            cursor: pointer;
            user-select: none;
            .send-icon {
                width: 16px;
                height: 16px;
            }
            .send-label {
                // font-family: 'PingFang SC';
                font-size: 12px;
                font-style: normal;
                font-weight: 400;
                line-height: normal;
            }
        }
    }
</style>
<style lang="less">
    .collapse-input {
        .el-input__wrapper {
            border-radius: 12px 12px 4px 12px;
            background: #f3f3f3;
            box-shadow: none;
        }
    }
    .uncollapse-input {
        .el-input__wrapper,
        .el-input__wrapper.is-focus {
            box-shadow: none;
        }
        .el-input__wrapper {
            padding: 0;
        }
    }
</style>
