import { createResponsiveRoute } from '../deviceRouter';

export const basicRoutes = [
    // ==================== 首页 - 响应式路由 ====================
    createResponsiveRoute({
        path: '/',
        components: {
            pc: () => import('@/views/home/index.vue'), // PC端组件
            tablet: () => import('@/views/home/index.tablet.vue'), // 平板端组件
            mobile: () => import('@/views/home/index.mobile.vue') // 手机端组件
        },
        meta: {
            title: '首页'
        }
    }),
    {
        path: '/test',
        component: () => import('@/views/test/audioTest.vue'),
        meta: {
            title: '音频测试'
        }
    },
    {
        path: '/testFile',
        component: () => import('@/views/test/testFile.vue')
    },
    {
        path: '/gif-test',
        component: () => import('@/views/test/VoiceGifCopyTest.vue'),
        meta: {
            title: 'VoiceGifCopy 组件测试'
        }
    },
    {
        path: '/gpt4o',
        component: () => import('@/views/test/gpt4o.vue')
    },
    {
        path: '/testOld',
        component: () => import('@/views/testOld/index.vue')
    },
    {
        path: '/reset',
        component: () => import('@/views/auth/reset.vue')
    },
    {
        path: '/active',
        component: () => import('@/views/auth/active.vue')
    },
    {
        path: '/terms',
        component: () => import('@/views/docs/terms.vue')
    },
    {
        path: '/privacy',
        component: () => import('@/views/docs/privacy.vue')
    },
    {
        path: '/video',
        component: () => import('@/views/video/index.vue')
    },
    {
        path: '/inference-services',
        component: () => import('@/views/inference-services/index.vue'),
        meta: {
            title: '推理服务列表'
        }
    }
];
