/**
 * 设备自适应路由工具
 * 根据设备类型动态返回对应的组件
 */

import { getDeviceType, DeviceType } from '@/utils';

/**
 * 创建响应式路由配置
 * @param {Object} components - 不同设备对应的组件配置
 * @param {Function} components.pc - PC端组件
 * @param {Function} components.tablet - 平板端组件（可选，不传则使用PC组件）
 * @param {Function} components.mobile - 手机端组件（可选，不传则使用PC组件）
 * @returns {Function} 返回适配当前设备的组件加载函数
 */
export function createResponsiveComponent(components) {
    return () => {
        const deviceType = getDeviceType();
        console.log('🚀 路由加载 - 设备类型:', deviceType);

        // 根据设备类型返回对应组件
        switch (deviceType) {
            case DeviceType.TABLET:
                // 如果有平板专用组件，使用平板组件，否则回退到PC组件
                if (components.tablet) {
                    console.log('📱 加载平板端组件');
                    return components.tablet();
                }
                console.log('💻 平板端使用PC组件');
                return components.pc();

            case DeviceType.MOBILE:
                // 如果有手机专用组件，使用手机组件，否则回退到PC组件
                if (components.mobile) {
                    console.log('📱 加载手机端组件');
                    return components.mobile();
                }
                console.log('💻 手机端使用PC组件');
                return components.pc();

            case DeviceType.PC:
            default:
                console.log('💻 加载PC端组件');
                return components.pc();
        }
    };
}

/**
 * 创建响应式路由
 * @param {Object} routeConfig - 路由基础配置
 * @param {string} routeConfig.path - 路由路径
 * @param {Object} routeConfig.components - 不同设备的组件配置
 * @param {Object} routeConfig.meta - 路由元信息（可选）
 * @returns {Object} 路由配置对象
 */
export function createResponsiveRoute(routeConfig) {
    const { path, components, meta = {} } = routeConfig;

    return {
        path,
        component: createResponsiveComponent(components),
        meta: {
            ...meta,
            responsive: true // 标记为响应式路由
        }
    };
}
