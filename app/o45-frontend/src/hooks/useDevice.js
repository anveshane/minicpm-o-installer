/**
 * 设备检测响应式 Hook
 * 提供响应式的设备类型和屏幕方向检测
 */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { getDeviceType, getOrientation, DeviceType, Orientation, getDeviceInfo } from '@/utils/device';

/**
 * 设备检测 Hook
 * @returns {Object} 包含设备类型和方向的响应式对象
 */
export function useDevice() {
    // 响应式状态
    const deviceType = ref(DeviceType.PC);
    const orientation = ref(Orientation.LANDSCAPE);

    // 计算属性
    const isPc = computed(() => deviceType.value === DeviceType.PC);
    const isTablet = computed(() => deviceType.value === DeviceType.TABLET);
    const isMobile = computed(() => deviceType.value === DeviceType.MOBILE);
    const isPortrait = computed(() => orientation.value === Orientation.PORTRAIT);
    const isLandscape = computed(() => orientation.value === Orientation.LANDSCAPE);

    // 更新设备信息
    const updateDeviceInfo = () => {
        deviceType.value = getDeviceType();
        orientation.value = getOrientation();
        console.log('📱 设备信息更新:', {
            deviceType: deviceType.value,
            orientation: orientation.value,
            ...getDeviceInfo()
        });
    };

    // 屏幕方向改变处理函数
    const handleOrientationChange = () => {
        orientation.value = getOrientation();
        console.log('🔄 屏幕方向改变:', orientation.value);
    };

    // 窗口尺寸改变处理函数（防抖）
    let resizeTimer = null;
    const handleResize = () => {
        if (resizeTimer) {
            clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(() => {
            updateDeviceInfo();
        }, 300);
    };

    // 生命周期钩子
    onMounted(() => {
        updateDeviceInfo();

        // 监听屏幕方向改变
        if (window.screen?.orientation) {
            window.screen.orientation.addEventListener('change', handleOrientationChange);
        } else {
            // 降级方案：监听 window 的 orientationchange 事件
            window.addEventListener('orientationchange', handleOrientationChange);
        }

        // 监听窗口大小改变（主要用于开发环境模拟）
        window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
        // 清理事件监听
        if (window.screen?.orientation) {
            window.screen.orientation.removeEventListener('change', handleOrientationChange);
        } else {
            window.removeEventListener('orientationchange', handleOrientationChange);
        }
        window.removeEventListener('resize', handleResize);

        if (resizeTimer) {
            clearTimeout(resizeTimer);
        }
    });

    return {
        // 响应式状态
        deviceType,
        orientation,

        // 计算属性
        isPc,
        isTablet,
        isMobile,
        isPortrait,
        isLandscape,

        // 方法
        updateDeviceInfo,
        getDeviceInfo
    };
}

/**
 * 简化版 Hook - 只检测设备类型，不监听变化
 * 适合只需要初始设备类型的场景
 */
export function useDeviceType() {
    const deviceType = getDeviceType();

    return {
        isPc: deviceType === DeviceType.PC,
        isTablet: deviceType === DeviceType.TABLET,
        isMobile: deviceType === DeviceType.MOBILE,
        deviceType
    };
}

/**
 * 简化版 Hook - 只检测屏幕方向
 * 适合只需要监听屏幕方向变化的场景
 */
export function useOrientation() {
    const orientation = ref(getOrientation());

    const updateOrientation = () => {
        orientation.value = getOrientation();
    };

    onMounted(() => {
        if (window.screen?.orientation) {
            window.screen.orientation.addEventListener('change', updateOrientation);
        } else {
            window.addEventListener('orientationchange', updateOrientation);
        }
    });

    onUnmounted(() => {
        if (window.screen?.orientation) {
            window.screen.orientation.removeEventListener('change', updateOrientation);
        } else {
            window.removeEventListener('orientationchange', updateOrientation);
        }
    });

    return {
        orientation,
        isPortrait: computed(() => orientation.value === Orientation.PORTRAIT),
        isLandscape: computed(() => orientation.value === Orientation.LANDSCAPE)
    };
}
