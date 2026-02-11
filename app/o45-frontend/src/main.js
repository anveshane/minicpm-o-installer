import './styles/main.css';
import './styles/responsive.css';

import { router, setupRouter } from '@/router';
import { setupRouterGuard } from '@/router/guard';
import SvgIcon from '@/components/SvgIcon/index.vue';
import { createI18n } from 'vue-i18n';
import VConsole from 'vconsole';
import { isInternalVersion } from '@/utils/version';

import App from './App.vue';
import en from './i18n/en.json';
import zh from './i18n/zh.json';

// 默认语言设置为英文
const savedLanguage = localStorage.getItem('language') || 'en';

const i18n = createI18n({
    locale: savedLanguage, // 默认语言
    messages: {
        en,
        zh
    }
});

const app = createApp(App);

// Configure routing
// 配置路由
setupRouter(app);

// router-guard
// 路由守卫
setupRouterGuard(router);

// Register global directive
// 注册全局指令
// setupGlobDirectives(app);

app.component('SvgIcon', SvgIcon);

app.use(i18n);

app.mount('#app');

// 在移动设备上启用 vConsole（仅内部版）
const isMobileDevice =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (isInternalVersion() && isMobileDevice) {
    new VConsole({
        defaultPlugins: ['system', 'network', 'element', 'console'], // 面板列表
        maxLogNumber: 1000, // 最多保留的 log 条数
        theme: 'dark' // 支持 'light' 或 'dark'
    });
    console.log('✅ vConsole 已启用（内部版 - 生产环境测试）');
}
