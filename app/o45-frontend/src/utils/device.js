/**
 * 设备类型检测工具
 * 用于区分 PC、平板、手机三种设备类型
 */

/**
 * 设备类型枚举
 */
export const DeviceType = {
    PC: 'pc',
    TABLET: 'tablet',
    MOBILE: 'mobile'
};

/**
 * 屏幕方向枚举
 */
export const Orientation = {
    PORTRAIT: 'portrait', // 竖屏
    LANDSCAPE: 'landscape' // 横屏
};

/**
 * 判断是否为移动设备（包括平板和手机）
 * @returns {boolean}
 */
export const isMobile = () => {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;

    // 基础移动设备判断（移除了Linux关键字避免误判PC）
    let flag = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    // iPad上的Safari（包括iPad Pro）
    if (platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
        flag = true;
    }

    // 华为平板/鸿蒙设备识别（增强版）
    // 包括：Huawei、HarmonyOS、MatePad、MediaPad、OpenHarmony、HMS Core
    if (/Huawei|HUAWEI|HarmonyOS|OpenHarmony|MatePad|MediaPad|HMS Core/i.test(userAgent)) {
        flag = true;
    }

    // 鸿蒙系统特殊处理（某些设备可能只有 "HM" 或 "Harmony" 标识）
    if (/\bHM\b|Harmony/i.test(userAgent)) {
        flag = true;
    }

    // Android设备但明确标识为平板
    if (/Android/i.test(userAgent) && /Tablet/i.test(userAgent)) {
        flag = true;
    }

    // 其他平板设备识别（通过屏幕尺寸和触摸点判断）
    // 增加条件：避免触摸屏PC被误判
    if (navigator.maxTouchPoints > 1 && window.screen.width >= 768 && window.screen.width < 2048) {
        // 排除明显的桌面系统
        const isDesktop =
            /Windows NT|Macintosh|X11.*Linux/i.test(userAgent) && !/Android|iOS|HarmonyOS/i.test(userAgent);
        if (!isDesktop) {
            flag = true;
        }
    }

    console.log('🔍 [isMobile] flag: ', flag);

    return flag;
};

/**
 * 判断是否为平板设备
 * 判断标准：
 * 1. 屏幕宽度 >= 768px (iPad mini) 且 < 1024px (大部分平板)
 * 2. 或者屏幕宽度 >= 1024px 但有触摸点且是移动设备
 * @returns {boolean}
 */
export const isTablet = () => {
    const userAgent = navigator.userAgent;
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const minSize = Math.min(screenWidth, screenHeight);
    const maxSize = Math.max(screenWidth, screenHeight);

    console.log('🔍 [isTablet] 设备检测信息:', {
        userAgent,
        screenWidth,
        screenHeight,
        minSize,
        maxSize,
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform
    });

    // 明确的平板标识
    if (/iPad|Android.*Tablet|PlayBook|Silk|Tablet|KFAPWI/i.test(userAgent)) {
        console.log('✅ [isTablet] 检测到平板标识（iPad/Tablet）');
        return true;
    }

    // 华为平板/MatePad/鸿蒙平板
    // 扩展检测：Huawei、HarmonyOS、MatePad、MediaPad、AGS (华为平板型号前缀)
    if (/MatePad|MediaPad|Huawei.*AGS|HUAWEI.*AGS|HarmonyOS.*(?!Mobile)/i.test(userAgent)) {
        console.log('✅ [isTablet] 检测到华为平板');
        return true;
    }

    // iPad Pro (使用 MacIntel 作为 platform 的设备)
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
        console.log('✅ [isTablet] 检测到 iPad Pro');
        return true;
    }

    // 根据屏幕尺寸判断（降低阈值以包含更多平板）
    // 平板的短边通常 >= 600px，长边 >= 960px
    if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) {
        // 宽松的尺寸判断：短边 >= 600px 且长边 >= 960px
        if (minSize >= 600 && maxSize >= 960) {
            console.log('✅ [isTablet] 根据屏幕尺寸判断为平板（宽松）');
            return true;
        }
        // 严格的尺寸判断：短边 >= 768px 且长边 >= 1024px
        if (minSize >= 768 && maxSize >= 1024) {
            console.log('✅ [isTablet] 根据屏幕尺寸判断为平板（严格）');
            return true;
        }
    }

    // Android 平板（不包含 Mobile 关键字，且屏幕尺寸合适）
    if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) {
        if (minSize >= 600) {
            console.log('✅ [isTablet] 检测到 Android 平板（无 Mobile 关键字）');
            return true;
        }
    }

    // 华为鸿蒙设备特殊处理：即使有 Mobile 关键字，但屏幕尺寸较大时仍判断为平板
    if (/Huawei|HUAWEI|HarmonyOS|OpenHarmony/i.test(userAgent)) {
        if (minSize >= 600 && maxSize >= 960) {
            console.log('✅ [isTablet] 华为/鸿蒙设备根据屏幕尺寸判断为平板');
            return true;
        }
    }

    console.log('❌ [isTablet] 未检测到平板特征');
    return false;
};

/**
 * 判断是否为手机设备
 * @returns {boolean}
 */
export const isPhone = () => {
    return isMobile() && !isTablet();
};

/**
 * 获取设备类型
 * @returns {string} 'pc' | 'tablet' | 'mobile'
 */
export const getDeviceType = () => {
    if (isTablet()) {
        return DeviceType.TABLET;
    }
    if (isPhone()) {
        return DeviceType.MOBILE;
    }
    return DeviceType.PC;
};

/**
 * 获取屏幕方向
 * @returns {string} 'portrait' | 'landscape'
 */
export const getOrientation = () => {
    // 优先使用 screen.orientation API
    if (window.screen?.orientation?.type) {
        return window.screen.orientation.type.includes('portrait') ? Orientation.PORTRAIT : Orientation.LANDSCAPE;
    }

    // 降级方案：通过宽高比判断
    const width = window.innerWidth;
    const height = window.innerHeight;

    return width < height ? Orientation.PORTRAIT : Orientation.LANDSCAPE;
};

/**
 * 判断是否为竖屏
 * @returns {boolean}
 */
export const isPortrait = () => {
    return getOrientation() === Orientation.PORTRAIT;
};

/**
 * 判断是否为横屏
 * @returns {boolean}
 */
export const isLandscape = () => {
    return getOrientation() === Orientation.LANDSCAPE;
};

/**
 * 获取设备信息对象
 * @returns {Object}
 */
export const getDeviceInfo = () => {
    const deviceType = getDeviceType();
    const orientation = getOrientation();
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;

    return {
        deviceType,
        orientation,
        isPortrait: orientation === Orientation.PORTRAIT,
        isLandscape: orientation === Orientation.LANDSCAPE,
        isPc: deviceType === DeviceType.PC,
        isTablet: deviceType === DeviceType.TABLET,
        isMobile: deviceType === DeviceType.MOBILE,
        screenWidth,
        screenHeight,
        userAgent: navigator.userAgent
    };
};
