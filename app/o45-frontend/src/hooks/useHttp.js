import axios from 'axios';
import en from '@/i18n/en.json';
import zh from '@/i18n/zh.json';
import { setNewUserId, getNewUserId } from './useRandomId';

// 创建实例时配置默认值
const service = axios.create({
    baseURL: '/',
    timeout: 30000,
    responseType: 'json'
});

const getNetworkErrorMessage = () => {
    const language = localStorage.getItem('language') || 'zh';
    const messages = language.startsWith('en') ? en : zh;
    return messages.networkErrorRetry || zh.networkErrorRetry || en.networkErrorRetry || '网络异常，请稍后重试';
};

// 请求拦截器
service.interceptors.request.use(config => {
    // 针对不同的 URL 设置不同的超时时间
    if (config.url.includes('stream')) {
        config.timeout = 3000;
    }

    // 为特定接口设置更长的超时时间
    if (config.url.includes('/api/login') || config.url.includes('/api/session_feedback')) {
        config.timeout = 60000; // 60秒
    }

    // session_history 接口设置 3 分钟超时
    if (config.url.includes('/api/session_history/history')) {
        config.timeout = 180000; // 180秒
    }

    // 如果在调用时传入了自定义 timeout，则使用自定义值
    // 这样可以在具体调用时覆盖默认配置

    console.log('config', config, localStorage.getItem('language'));
    if (config.url.startsWith('/v1/login/api')) {
        Object.assign(config.headers, {
            source: 'omni',
            lang: localStorage.getItem('language') || 'zh'
        });
    }
    if (config.url.startsWith('/v1/login/api/user')) {
        config.headers['token'] = localStorage.getItem('token');
    }
    if (window.location.search) {
        config.url += window.location.search;
    }
    Object.assign(config.headers, ajaxHeader());
    return config;
});

// 响应拦截器
service.interceptors.response.use(
    response => {
        console.log('response', response);
        // 登录的逻辑相关接口和之前的接口返回结构不同，所以在这里单独处理一下
        if (response.config.url.startsWith('/v1/login/api')) {
            if (response?.data?.code === 0) {
                return Promise.resolve({
                    code: 0,
                    message: '',
                    data: response.data
                });
            }
            return Promise.resolve({
                code: -1,
                message: response?.data?.message || getNetworkErrorMessage(),
                data: null
            });
        }
        let res = response.data;
        if (response?.status === 200) {
            return Promise.resolve({
                code: 0,
                message: '',
                data: res
            });
        }
        return Promise.resolve({ code: -1, message: getNetworkErrorMessage(), data: null });
    },
    error => {
        const res = { code: -1, message: error?.response?.data?.detail || getNetworkErrorMessage(), data: null };
        return Promise.resolve(res);
    }
);

export const ajaxHeader = () => {
    if (!localStorage.getItem('uid')) {
        setNewUserId();
    }
    return {
        'Content-Type': 'application/json;charset=UTF-8',
        Accept: 'application/json',
        service: 'minicpmo-server',
        uid: getNewUserId()
    };
};

export default {
    get(url, params, config = {}) {
        return service.get(url, { params, ...config });
    },
    post(url, data, config = {}) {
        return service.post(url, data, { ...config });
    },
    delete(url, params, config = {}) {
        return service.delete(url, { params, ...config });
    }
};
