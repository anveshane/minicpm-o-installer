/**
 * 语音选项配置
 * 统一管理各端的语音选项下拉框
 * value值直接对应后端的timbre参数
 */

export const VOICE_OPTIONS = [
    {
        value: 1,
        label: {
            zh: '男一号（默认）',
            en: 'Male 1 (Default)'
        }
    },
    {
        value: 2,
        label: {
            zh: '男二号',
            en: 'Male 2'
        }
    },
    {
        value: 3,
        label: {
            zh: '男三号',
            en: 'Male 3'
        }
    },
    {
        value: 4,
        label: {
            zh: '女一号',
            en: 'Female 1'
        }
    },
    {
        value: 5,
        label: {
            zh: '女二号',
            en: 'Female 2'
        }
    },
    {
        value: 6,
        label: {
            zh: '女三号',
            en: 'Female 3'
        }
    },
    {
        value: 10086,
        label: {
            zh: '自定义 (声音克隆)',
            en: 'Custom'
        }
    }
];

/**
 * 根据语言获取语音选项标签
 * @param {number} value - 语音选项的value值（1-6）
 * @param {string} lang - 语言代码 'zh' 或 'en'
 * @returns {string} - 对应语言的标签
 */
export const getVoiceLabel = (value, lang = 'zh') => {
    const option = VOICE_OPTIONS.find(opt => opt.value === value);
    return option ? option.label[lang] || option.label.zh : '';
};

/**
 * 获取默认语音选项
 * @returns {number} - 默认语音选项的value值（1 = 男一号）
 */
export const getDefaultVoiceOption = () => 1;
