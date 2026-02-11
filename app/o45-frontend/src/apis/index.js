// 判断是否为内部版（支持URL参数动态切换）
import { isInternalVersion } from '@/utils/version';
const isInternal = isInternalVersion();

// 定时发送消息
export const sendMessage = data => {
    return useHttp.post('/api/v1/stream', data);
};
// 跳过当前
export const stopMessage = () => {
    return useHttp.post('/api/v1/stop');
};
// 上传音色文件
export const uploadFile = data => {
    return useHttp.post('/api/v1/upload_audio', data);
};
// 上传配置
export const uploadConfig = data => {
    return useHttp.post('/api/v1/init_options', data);
};
// 发送短信验证码
export const sendMessageCode = data => {
    return useHttp.post('/v1/login/api/mobile/sms-code', data);
};
// 手机号登录
export const loginByPhone = data => {
    return useHttp.post('/v1/login/api/mobile/login/v2', data);
};
// 邮箱登录
export const loginByEmail = data => {
    return useHttp.post('/v1/login/api/email/login', data);
};
// 邮箱注册
export const registerByEmail = data => {
    return useHttp.post('/v1/login/api/email/register', data);
};
// 邮箱激活
export const activateEmail = data => {
    return useHttp.post('/v1/login/api/email/activate', data);
};
// 发送重置密码邮件
export const sendResetEmail = data => {
    return useHttp.post('/v1/login/api/email/send-reset-password', data);
};
// 设置新密码
export const setNewPassword = data => {
    return useHttp.post('/v1/login/api/email/reset-password', data);
};
// 删除用户
export const deleteUser = () => {
    return useHttp.delete('/v1/login/api/user');
};
// 获取用户信息
export const getUserInfo = data => {
    return useHttp.get('/v1/login/api/user-info', data);
};
// 获取rtc token
export const getRtcToken = (type = 'none') => {
    const modelType = localStorage.getItem('modelType') || 'simplex';
    const payload = { modelType };

    // const durVadTimeValue = localStorage.getItem('durVadTime');
    // if (durVadTimeValue !== null && durVadTimeValue !== '') {
    //     const durVadTime = Number(durVadTimeValue);
    //     if (!Number.isNaN(durVadTime)) {
    //         payload.durVadTime = durVadTime;
    //     }
    // }

    // const durVadThresholdValue = localStorage.getItem('durVadThreshold');
    // if (durVadThresholdValue !== null && durVadThresholdValue !== '') {
    //     const durVadThreshold = Number(durVadThresholdValue);
    //     if (!Number.isNaN(durVadThreshold)) {
    //         payload.durVadThreshold = durVadThreshold;
    //     }
    // }

    // const vadRaceValue = JSON.parse(localStorage.getItem('vadRace') || 'true');
    // // payload.vadRace = vadRaceValue;
    // payload.vadRace = false;

    // const saveDataValue = JSON.parse(localStorage.getItem('saveData') || 'true');
    // payload.saveData = saveDataValue;

    // 获取语音选项配置（直接使用数字类型的timbreId值）
    const voiceOptionValue = localStorage.getItem('voiceOption');
    const timbreIdValue = voiceOptionValue ? Number(voiceOptionValue) : 1;

    // 只有当 timbreId 不为 10086 时才传递该字段（与 saveData 同级）
    // if (timbreIdValue !== 10086) {
    //     payload.timbreId = timbreIdValue;
    // }

    // 如果选择了自定义音色（10086）且有音色克隆数据，添加到 payload（与 saveData 同级）
    if (timbreIdValue === 10086 && window.voiceCloneData) {
        payload.audioFormat = window.voiceCloneData.audioFormat;
        payload.base64Str = window.voiceCloneData.base64Str;
    }

    let url = '';

    // 高刷配置只在 omni 视频模式下传递（与 saveData 同级）
    if (type === 'omni') {
        // const highRefreshValue = localStorage.getItem('highRefresh') || 'false';
        // payload.highRefresh = highRefreshValue === 'true';

        // 高清模式配置只在 omni 视频模式下传递（与 saveData 同级）
        const highImageValue = localStorage.getItem('hdMode') || 'false';
        payload.highImage = highImageValue === 'true';

        payload.modelType = 'duplex';
        payload.serviceName = 'o45-cpp'; // 先写死
        url = '/api/login';
    } else {
        payload.modelType = 'simplex';
        payload.serviceName = 'o45-cpp'; // 先写死
        url = '/api/login';
    }

    // 内部版增加模型配置参数
    if (isInternal) {
        const modelConfig = localStorage.getItem('modelInfo');
        // ⚠️ 兼容真机首次进入/清缓存：localStorage 可能没有 prompt 或内容不是合法 JSON
        // 否则会在这里直接抛异常，导致 /api/login 请求根本不会发出
        let parsedPrompt = {};
        try {
            const rawPrompt = localStorage.getItem('prompt');
            parsedPrompt = rawPrompt ? JSON.parse(rawPrompt) : {};
        } catch (e) {
            parsedPrompt = {};
        }
        const { audioPrompt = '', taskPrompt = '', timbre = 1, modelId = 1 } = parsedPrompt || {};
        payload.modelConfig = {
            modelConfig,
            audio_prompt_text: audioPrompt,
            task_prompt_text: taskPrompt,
            timbre: timbre,
            checkpoint_id: modelId,
            media_type: type
        };
    }
    payload.sessionType = type;

    // 添加推理服务配置
    // const inferenceServiceType = localStorage.getItem('serviceName');
    // if (inferenceServiceType) {
    //     payload.serviceName = inferenceServiceType;
    // }

    // 添加通话语言配置
    const callLanguageValue = localStorage.getItem('callLanguage') || 'en';
    payload.language = callLanguageValue;

    // return useHttp.post('/api/login', payload);
    return useHttp.post(url, payload);
};
// 注销rtc
export const logoutRtc = data => {
    return useHttp.post('/api/logout', data);
};
// 重启模型
export const restartModel = () => {
    return useHttp.post('/api/restart_model');
};
export const getCurrentTime = () => {
    return useHttp.get('/api/get_system_time');
};
// 反馈-点赞点踩
export const feedback = data => {
    return useHttp.post('/api/session_feedback', data);
};
// 获取session音频列表
export const getSessionAudios = data => {
    return useHttp.get('/api/session_history/history', data);
};
// 获取推理服务列表
export const getInferenceServices = params => {
    return useHttp.get('/api/inference/services', params);
};
