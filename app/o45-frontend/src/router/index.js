import { createRouter, createWebHistory } from 'vue-router';
import { basicRoutes } from './menu';

// 创建一个可以被 Vue 应用程序使用的路由实例
export const router = createRouter({
    // 创建一个 hash 历史记录。
    history: createWebHistory(import.meta.env.BASE_URL),
    // 路由列表。
    routes: basicRoutes
});

// 添加全局路由守卫，防止用户通过修改地址栏访问不支持的页面
router.beforeEach((to, from, next) => {
    // 只对首页路由进行检查
    if (to.path === '/') {
        const modelType = localStorage.getItem('modelType') || 'simplex';
        const type = to.query.type;

        // 1. 验证 type 参数：如果存在，只能是 '0' 或 '1'
        if (type !== undefined && type !== '0' && type !== '1') {
            console.log(`🚫 无效的 type 参数：${type}，已自动重定向到默认页面`);
            const newQuery = { ...to.query };
            delete newQuery.type; // 删除无效的 type 参数
            next({
                path: '/',
                query: newQuery,
                replace: true
            });
            return;
        }

        // 2. 如果是双工模式，且尝试访问语音通话页面（type=0），则重定向到视频通话（type=1）
        if (modelType === 'duplex' && type === '0') {
            console.log('🚫 双工模式不支持语音通话，已自动重定向到视频通话');
            next({
                path: '/',
                query: {
                    ...to.query,
                    type: '1' // 强制切换到视频通话
                },
                replace: true // 替换历史记录，避免用户点击后退按钮回到错误页面
            });
            return;
        }
    }

    next();
});

// config router
// 配置路由器
export function setupRouter(app) {
    app.use(router);
}
