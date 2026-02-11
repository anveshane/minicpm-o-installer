// ====== 设备检测相关 ======
// 从 device.js 导出所有设备检测函数，保持向后兼容
export {
    isMobile,
    isTablet,
    isPhone,
    getDeviceType,
    getOrientation,
    isPortrait,
    isLandscape,
    getDeviceInfo,
    DeviceType,
    Orientation
} from './device';

// 兼容性：保留旧的 isMobile 导入方式
// 项目中已有代码可以继续使用 import { isMobile } from '@/utils'
// 单片语音长度(单位：ms)
const voicePerLength = 200;

// 图片计数，算出在哪一次发送语音时，同时发送图片。例如一片语音100ms，一秒钟发送一次语音，即发送的第10片语音时需要带一张图片
export const maxCount = 1000 / voicePerLength;

export const getChunkLength = sampleRate => {
    return sampleRate * (voicePerLength / 1000);
};

export const isAvailablePort = port => {
    return [
        8000, 8001, 8002, 8003, 8004, 8010, 8011, 8012, 8013, 8014, 8020, 8021, 8022, 8023, 8024, 8025, 8026, 8027,
        8028, 32449
    ].includes(port);
};

// 文件转base64格式
export const fileToBase64 = file => {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject('文件不能为空');
        }
        const reader = new FileReader();
        reader.onload = e => {
            const base64String = e.target.result;
            resolve(base64String);
        };
        reader.onerror = () => {
            reject('文件转码失败');
        };
        reader.readAsDataURL(file);
    });
};

// 时间戳转年月日时分秒毫秒
export const formatTimestamp = timestamp => {
    // 创建 Date 对象
    const date = new Date(timestamp);

    // 获取年月日时分秒毫秒
    const year = date.getFullYear(); // 年
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月（补零）
    const day = String(date.getDate()).padStart(2, '0'); // 日（补零）
    const hours = String(date.getHours()).padStart(2, '0'); // 时（补零）
    const minutes = String(date.getMinutes()).padStart(2, '0'); // 分（补零）
    const seconds = String(date.getSeconds()).padStart(2, '0'); // 秒（补零）
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0'); // 毫秒（补零）

    // 拼接成完整的日期时间字符串
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
};

// 获取错误日志
export const getErrorLogs = () => {
    const errorLogs = localStorage.getItem('errorLogs');
    return errorLogs ? JSON.parse(errorLogs) : [];
};

// 设置错误日志
export const setErrorLogs = errorLogs => {
    localStorage.setItem('errorLogs', JSON.stringify(errorLogs));
};

// 判断IP地理位置
export const getUserCountry = async () => {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    return data.country_code; // 如 CN
};

// ====== 模式选择相关 ======
// 重置模式选择，用于让用户重新选择交互模式
export const resetModeSelection = () => {
    localStorage.removeItem('hasSelectedMode');
    localStorage.removeItem('selectedMode');
};

// 获取当前选择的模式
export const getSelectedMode = () => {
    return localStorage.getItem('selectedMode');
};

// 检查是否已选择模式
export const hasSelectedMode = () => {
    return localStorage.getItem('hasSelectedMode') === 'true';
};
