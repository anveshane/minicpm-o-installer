<template>
    <div :class="`user-config ${t('modelConfigTitle') === '模型配置' ? '' : 'en-user-config'}`">
        <div class="user-config-title">{{ t('modelConfigTitle') }}</div>
        <!-- <div class="config-item">
            <div class="config-item-label">
                <span>{{ t('audioInterruptionBtn') }}</span>
                <el-tooltip
                    popper-class="config-tooltip"
                    effect="dark"
                    :content="t('audioInterruptionTips')"
                    placement="top"
                >
                    <SvgIcon name="question" class="question-icon" />
                </el-tooltip>
            </div>
            <div class="config-item-content">
                <el-switch
                    v-model="configData.canStopByVoice"
                    inline-prompt
                    :disabled="isCalling"
                    class="config-switch"
                />
            </div>
        </div> -->
        <div class="config-item" v-if="type === 'video'">
            <div class="config-item-label">
                <span>{{ t('videoQualityBtn') }}</span>
                <el-tooltip
                    popper-class="config-tooltip"
                    effect="dark"
                    :content="t('videoQualityTips')"
                    placement="top"
                >
                    <SvgIcon name="question" class="question-icon" />
                </el-tooltip>
            </div>
            <div class="config-item-content">
                <el-switch
                    v-model="configData.videoQuality"
                    inline-prompt
                    class="config-switch"
                    :disabled="isCalling"
                />
            </div>
        </div>
        <div class="prompt-item">
            <div class="prompt-item-label">
                <span>{{ t('vadThresholdBtn') }}</span>
                <el-tooltip
                    popper-class="config-tooltip"
                    effect="dark"
                    :content="t('vadThresholdTips')"
                    placement="top"
                >
                    <SvgIcon name="question" class="question-icon" />
                </el-tooltip>
            </div>
            <div class="prompt-item-content vad-slider">
                <el-slider
                    v-model="configData.vadThreshold"
                    tooltip-class="config-tooltip"
                    :min="0.5"
                    :max="0.9"
                    :step="0.1"
                    size="small"
                    :disabled="isCalling"
                />
            </div>
        </div>
        <!-- <div class="prompt-item" v-if="type === 'voice'">
            <div class="prompt-item-label">
                <span>{{ t('assistantPromptBtn') }}</span>
                <el-tooltip
                    popper-class="config-tooltip"
                    effect="dark"
                    :content="t('assistantPromptTips')"
                    placement="top"
                >
                    <SvgIcon name="question" class="question-icon" />
                </el-tooltip>
            </div>
            <div class="prompt-item-content">
                <el-input
                    type="textarea"
                    :rows="3"
                    v-model="configData.assistantPrompt"
                    resize="none"
                    :disabled="true || isCalling"
                />
            </div>
        </div> -->
        <!-- <div class="config-item">
            <div class="config-item-label">{{ t('useVoicePromptBtn') }}</div>
            <div class="config-item-content">
                <el-switch
                    v-model="configData.canUseAudioPrompt"
                    inline-prompt
                    :disabled="isCalling"
                    class="config-switch"
                    @change="handleSelectUseAudioPrompt"
                />
            </div>
        </div> -->
        <div class="timbre-model">
            <div class="timbre-model-label">
                <span>{{ t('toneColorOptions') }}</span>
                <el-tooltip
                    popper-class="config-tooltip"
                    effect="dark"
                    :content="t('toneColorOptionsTips')"
                    placement="top"
                >
                    <SvgIcon name="question" class="question-icon" />
                </el-tooltip>
            </div>
            <div class="timbre-model-content">
                <el-select
                    v-model="configData.useAudioPrompt"
                    style="width: 100%"
                    @change="handleChangePeople"
                    :disabled="isCalling"
                    popper-class="config-select"
                    :popper-options="{
                        placement: 'bottom-end',
                        modifiers: [
                            {
                                name: 'flip',
                                options: {
                                    fallbackPlacements: ['top-end']
                                }
                            },
                            {
                                name: 'offset',
                                options: {
                                    offset: [0, 8]
                                }
                            }
                        ]
                    }"
                >
                    <el-option :value="0" :label="t('nullOption')">{{ t('nullOption') }}</el-option>
                    <el-option :value="1" :label="t('defaultOption')">{{ t('defaultOption') }}</el-option>
                    <el-option :value="2" :label="t('femaleOption')">{{ t('femaleOption') }}</el-option>
                    <el-option :value="3" :label="t('maleOption')">{{ t('maleOption') }}</el-option>
                </el-select>
            </div>
        </div>
        <!-- <div class="prompt-item">
            <div class="prompt-item-label">
                <span>{{ t('voiceClonePromptInput') }}</span>
                <el-tooltip
                    popper-class="config-tooltip"
                    effect="dark"
                    :content="t('voiceClonePromptTips')"
                    placement="top"
                >
                    <SvgIcon name="question" class="question-icon" />
                </el-tooltip>
            </div>
            <div class="prompt-item-content">
                <el-input
                    type="textarea"
                    :rows="3"
                    v-model="configData.voiceClonePrompt"
                    resize="none"
                    :disabled="true"
                />
            </div>
        </div> -->
        <!-- <div class="timbre-config" v-if="configData.canUseAudioPrompt">
            <div class="timbre-config-label">{{ t('audioChoiceBtn') }}</div>
            <div class="timbre-config-content">
                <el-checkbox-group v-model="configData.timbre" @change="handleSelectTimbre" :disabled="isCalling">
                    <el-checkbox :value="1" :label="t('defaultAudioBtn')"></el-checkbox>
                    <el-upload
                        v-model:file-list="fileList"
                        action=""
                        :multiple="false"
                        :on-change="handleChangeFile"
                        :auto-upload="false"
                        :show-file-list="false"
                        :disabled="isCalling"
                        accept="audio/*"
                    >
                        <el-checkbox :value="2">
                            <span>{{ t('customizationBtn') }}</span>
                            <SvgIcon name="upload" className="checkbox-icon" />
                        </el-checkbox>
                    </el-upload>
                </el-checkbox-group>
            </div>
        </div>
        <div class="file-content" v-if="fileName">
            <SvgIcon name="document" class="document-icon" />
            <span class="file-name">{{ fileName }}</span>
        </div> -->
    </div>
</template>

<script setup>
    const isCalling = defineModel('isCalling');
    const type = defineModel('type');
    import { useI18n } from 'vue-i18n';

    const { t, locale } = useI18n();

    let defaultVoiceClonePrompt =
        '你是一个AI助手。你能接受视频，音频和文本输入并输出语音和文本。模仿输入音频中的声音特征。';
    let defaultAssistantPrompt = '';

    const fileList = ref([]);
    const fileName = ref('');

    const defaultConfig = {
        canStopByVoice: false,
        videoQuality: false,
        canUseAudioPrompt: false,
        useAudioPrompt: 3,
        vadThreshold: 0.8,
        voiceClonePrompt: defaultVoiceClonePrompt,
        assistantPrompt: defaultAssistantPrompt,
        timbre: [1],
        audioFormat: 'mp3',
        base64Str: ''
    };
    const configData = ref({ ...defaultConfig });

    watch(
        () => type.value,
        () => {
            if (locale.value === 'zh') {
                defaultAssistantPrompt = '作为助手，你将使用这种声音风格说话。';
            } else {
                defaultAssistantPrompt = 'As an assistant, you will speak using this voice style.';
            }
            configData.value = { ...defaultConfig, assistantPrompt: defaultAssistantPrompt };
        }
    );
    watch(
        locale,
        (newLocale, oldLocale) => {
            console.log(`Language switched from ${oldLocale} to ${newLocale}`);
            if (newLocale === 'zh') {
                defaultAssistantPrompt = '作为助手，你将使用这种声音风格说话。';
            } else {
                defaultAssistantPrompt = 'As an assistant, you will speak using this voice style.';
            }
            configData.value.assistantPrompt = defaultAssistantPrompt;
        },
        { immediate: true }
    );
    onMounted(() => {
        handleSetStorage();
    });
    const handleSelectTimbre = e => {
        if (e.length > 1) {
            const val = e[e.length - 1];
            configData.value.timbre = [val];
            // 默认音色
            if (val === 1) {
                configData.value.audioFormat = 'mp3';
                configData.value.base64Str = '';
                fileList.value = [];
                fileName.value = '';
            }
        }
    };
    const handleChangeFile = file => {
        if (isAudio(file) && sizeNotExceed(file)) {
            fileList.value = [file];
            fileName.value = file.name;
            configData.value.timbre = [2];
            handleUpload();
        } else {
            ElMessage.error('Please upload audio file and size not exceed 10MB');
        }
    };
    const isAudio = file => {
        return file.raw.type.includes('audio');
    };
    const sizeNotExceed = file => {
        return file.size / 1024 / 1024 <= 10;
    };
    const handleUpload = async () => {
        const file = fileList.value[0].raw;
        if (file) {
            const reader = new FileReader();
            reader.onload = e => {
                const base64String = e.target.result.split(',')[1];
                configData.value.audioFormat = file.name.split('.')[1];
                configData.value.base64Str = base64String;
            };
            reader.readAsDataURL(file);
        }
    };
    const handleSelectUseAudioPrompt = val => {
        if (val) {
            configData.value.voiceClonePrompt = defaultVoiceClonePrompt;
            configData.value.assistantPrompt = defaultAssistantPrompt;
        }
    };
    // 配置发生变化，更新到localstorage中
    watch(configData.value, () => {
        handleSetStorage();
    });
    const handleSetStorage = () => {
        const { timbre, canStopByVoice, ...others } = configData.value;
        const defaultConfigData = {
            canStopByVoice,
            ...others
        };
        localStorage.setItem('configData', JSON.stringify(defaultConfigData));
        localStorage.setItem('canStopByVoice', canStopByVoice);
    };
    const handleChangePeople = val => {
        console.log('val: ', val);
        // const index = peopleList.findIndex(item => item.id === val);
        configData.value.voiceClonePrompt = defaultVoiceClonePrompt;
        configData.value.assistantPrompt = defaultAssistantPrompt;
        configData.value.timbre = [1];
    };
</script>
<style lang="less" scoped>
    .user-config {
        // font-family: PingFang SC;
        padding: 16px 32px 16px 20px;
        &-title {
            color: #171717;
            // font-family: 'PingFang SC';
            font-size: 14px;
            font-style: normal;
            font-weight: 500;
            line-height: normal;
            margin-bottom: 4px;
        }
        .config-item + .config-item {
            margin-bottom: 8px;
        }
        .config-item {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            padding: 6px 0;
            &-label {
                // width: 120px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                color: #171717;
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: 24px;
            }
            &-content {
                .el-radio-group {
                    .el-radio {
                        width: 50px;
                    }
                }
            }
        }
        .timbre-config {
            padding: 6px 0;
            &-label {
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                color: #171717;
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: 24px;
            }
            &-content {
                display: flex;
                align-items: center;
            }
        }
        .prompt-item {
            padding: 6px 0;
            margin-bottom: 8px;
            &-label {
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                color: #171717;
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: 24px;
            }
            &-content.vad-slider {
                display: flex;
                justify-content: center;
                .el-slider {
                    width: 94%;
                }
            }
        }
        .file-content {
            padding: 6px 0;
            font-size: 14px;
            display: flex;
            align-items: center;
            .document-icon {
                width: 16px;
                height: 16px;
                margin-right: 4px;
            }
            .file-name {
                flex: 1;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }
        }
        .timbre-model {
            padding: 6px 0;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            &-label {
                // width: 120px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                color: #171717;
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: 24px;
            }
            &-content {
                // flex: 1;
                margin-left: 16px;
                width: 130px;
            }
        }
    }
    .en-user-config {
        .config-item-label {
            // width: 160px;
        }
        .timbre-model-label {
            // width: 160px;
        }
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
</style>
<style lang="less">
    .config-switch.el-switch {
        --el-switch-on-color: #5865f2;
        --el-switch-off-color: rgba(23, 23, 23, 0.15);
        --el-switch-border-color: transparent;
        width: 44px;
        height: 24px;
        .el-switch__core {
            width: 44px;
            height: 24px;
            border-radius: 16px;
            .el-switch__inner {
                width: 40px;
            }
            .el-switch__action {
                width: 18px;
                height: 18px;
                left: 2px;
            }
        }
        &.is-checked {
            .el-switch__core {
                .el-switch__action {
                    left: calc(100% - 20px);
                }
            }
        }
    }
    .config-tooltip.el-popper.is-dark {
        max-width: 320px;
        // font-family: PingFang SC;
        border-radius: 8px;
        padding: 8px 12px;
        background: rgba(17, 17, 17, 1);
        border: none;
        font-size: 12px;
        line-height: 1.4;
        .el-popper__arrow::before {
            background: rgba(17, 17, 17, 1);
            border: 1px solid rgba(17, 17, 17, 1);
        }
    }
    .el-checkbox-group {
        display: flex;
        flex-wrap: wrap;
        flex: 1;
        > .el-checkbox {
            margin-right: 12px;
        }
    }
    .el-checkbox {
        margin-left: 20px;
        // margin-bottom: 8px;
        .el-checkbox__input {
            .el-checkbox__inner {
                border: 1px solid rgba(23, 23, 23, 0.4);
            }
        }
        .el-checkbox__input.is-checked {
            .el-checkbox__inner {
                background: #5865f2;
                border: 1px solid #5865f2;
            }
        }
        .el-checkbox__input.is-checked.is-disabled {
            .el-checkbox__inner::after {
                border-color: #ffffff;
            }
        }
    }
    .el-checkbox__label {
        color: #5d5d5d !important;
        // font-family: 'PingFang SC';
        font-size: 14px;
        font-style: normal;
        font-weight: 400;
        line-height: normal;
        display: flex;
        align-items: center;
        .checkbox-icon {
            width: 20px;
            height: 20px;
        }
    }
    .vad-slider {
        width: 100%;
        .el-slider__button {
            width: 18px;
            height: 18px;
            border: none;
            box-shadow: 0px 0px 12px rgba(0, 0, 0, 0.12);
        }
        .el-slider__bar {
            background-color: #5865f2;
        }
        .el-slider__runway {
            height: 4px;
            .el-slider__bar {
                height: 4px;
            }
        }
        .el-slider__button-wrapper {
            top: -16px;
        }
    }
    .prompt-item {
        .el-textarea__inner {
            border-radius: 12px;
        }
    }
    .timbre-model {
        .el-select {
            .el-select__wrapper {
                border-radius: 12px;
            }
        }
    }
    .user-config {
        .el-select__wrapper {
            min-height: 38px;
        }
        .el-select__placeholder {
            color: #a2a2a2;
        }
    }
    .config-select {
        .el-popper__arrow {
            display: none;
        }
    }
    .el-popper.config-select {
        // display: block !important;
        border-radius: 10px;
        border: none;
        ul {
            padding: 10px 0;
            li {
                height: 40px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                color: #2e2e2e;
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: 20px;
                &:hover,
                &.is-hovering {
                    background: #f3f3f3;
                }
            }
        }
    }
</style>
