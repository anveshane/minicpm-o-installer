/**
 * 版本管理工具
 * 支持通过URL参数动态切换版本
 */

/**
 * 获取实际应用的版本
 * 优先级：URL参数 > 环境变量
 *
 * URL参数支持：
 * - version=official 或 version=external → 对外版
 * - version=internal → 对内版
 *
 * @returns {string} 'internal' 或 'external'
 */
export function getAppVersion() {
    // 尝试从URL参数获取版本
    const urlParams = new URLSearchParams(window.location.search);
    const versionParam = urlParams.get('version');

    if (versionParam) {
        // 如果URL参数中有version
        if (versionParam === 'official' || versionParam === 'external') {
            console.log(`[版本切换] URL参数指定为对外版: version=${versionParam}`);
            return 'external';
        } else if (versionParam === 'internal') {
            console.log(`[版本切换] URL参数指定为对内版: version=${versionParam}`);
            return 'internal';
        }
    }

    // 如果没有URL参数或参数无效，使用环境变量
    const envVersion = import.meta.env.VITE_APP_VERSION || 'external';
    console.log(`[版本切换] 使用环境变量版本: ${envVersion}`);
    return envVersion;
}

/**
 * 判断当前是否为内部版
 * @returns {boolean}
 */
export function isInternalVersion() {
    return getAppVersion() === 'internal';
}

/**
 * 判断当前是否为对外版
 * @returns {boolean}
 */
export function isExternalVersion() {
    return getAppVersion() === 'external';
}

/**
 * 获取版本显示名称
 * @returns {string}
 */
export function getVersionDisplayName() {
    return isInternalVersion() ? '对内版' : '对外版';
}
