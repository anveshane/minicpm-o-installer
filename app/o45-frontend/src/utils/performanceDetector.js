/**
 * 设备性能检测工具
 * 用于判断是否应该启用低性能模式
 */

class PerformanceDetector {
    constructor() {
        this.performanceScore = 0;
        this.isLowPerformance = false;
    }

    /**
     * 检测设备性能
     * @returns {Object} { isLowPerformance, score, details }
     */
    detect() {
        const scores = [];
        const details = {};

        // 1. CPU核心数检测
        const cores = navigator.hardwareConcurrency || 2;
        details.cores = cores;
        if (cores <= 2) {
            scores.push(0);
        } else if (cores <= 4) {
            scores.push(50);
        } else {
            scores.push(100);
        }

        // 2. 内存检测（如果可用）
        if (navigator.deviceMemory) {
            const memory = navigator.deviceMemory; // GB
            details.memory = `${memory}GB`;
            if (memory <= 2) {
                scores.push(0);
            } else if (memory <= 4) {
                scores.push(50);
            } else {
                scores.push(100);
            }
        }

        // 3. 设备类型检测
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isTablet = /iPad/i.test(navigator.userAgent);
        details.deviceType = isMobile ? (isTablet ? 'tablet' : 'mobile') : 'desktop';

        if (isMobile && !isTablet) {
            scores.push(30); // 移动设备性能通常较低
        } else if (isTablet) {
            scores.push(60);
        } else {
            scores.push(80);
        }

        // 4. 网络连接类型检测（如果可用）
        if (navigator.connection) {
            const connection = navigator.connection;
            const effectiveType = connection.effectiveType;
            details.networkType = effectiveType;

            // 2g: 慢速网络，启用低性能模式
            // 3g: 中速网络，可能需要低性能模式
            // 4g/wifi: 高速网络
            if (effectiveType === '2g' || effectiveType === 'slow-2g') {
                scores.push(0);
            } else if (effectiveType === '3g') {
                scores.push(40);
            } else {
                scores.push(100);
            }
        }

        // 5. 简单的渲染性能测试
        const renderScore = this._testRenderPerformance();
        details.renderPerformance = renderScore;
        scores.push(renderScore);

        // 计算综合评分
        this.performanceScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        // 低于50分认为是低性能设备
        this.isLowPerformance = this.performanceScore < 50;

        return {
            isLowPerformance: this.isLowPerformance,
            score: Math.round(this.performanceScore),
            details
        };
    }

    /**
     * 简单的渲染性能测试
     * @private
     * @returns {number} 0-100的性能分数
     */
    _testRenderPerformance() {
        const start = performance.now();
        let iterations = 0;

        // 在16ms内（一帧时间）执行简单计算
        while (performance.now() - start < 16) {
            iterations++;
            // 简单的计算任务
            Math.sqrt(Math.random() * 1000);
        }

        // iterations越高，性能越好
        // 经验值：高性能设备 > 10000, 低性能设备 < 5000
        if (iterations > 10000) {
            return 100;
        } else if (iterations > 5000) {
            return 60;
        } else if (iterations > 2000) {
            return 30;
        } else {
            return 0;
        }
    }

    /**
     * 获取性能建议
     * @returns {Object} { mode, reason, suggestions }
     */
    getRecommendation() {
        const detection = this.detect();

        let mode = 'normal'; // normal | low
        let reason = '';
        const suggestions = [];

        if (detection.isLowPerformance) {
            mode = 'low';
            reason = `设备性能评分：${detection.score}/100（低于50分）`;

            if (detection.details.cores && detection.details.cores <= 2) {
                suggestions.push('CPU核心数较少，建议启用低性能模式');
            }
            if (detection.details.memory && parseInt(detection.details.memory) <= 2) {
                suggestions.push('设备内存较小，建议启用低性能模式');
            }
            if (detection.details.deviceType === 'mobile') {
                suggestions.push('移动设备性能有限，建议启用低性能模式以节省电量');
            }
            if (detection.details.networkType === '2g' || detection.details.networkType === '3g') {
                suggestions.push('网络连接较慢，建议启用低性能模式减少资源消耗');
            }
        } else {
            mode = 'normal';
            reason = `设备性能评分：${detection.score}/100（正常）`;
            suggestions.push('设备性能良好，使用默认模式即可');
        }

        return {
            mode,
            reason,
            suggestions,
            details: detection.details
        };
    }

    /**
     * 检测当前网络延迟是否过高
     * @param {number} latency - 当前网络延迟（ms）
     * @returns {boolean}
     */
    isHighLatency(latency) {
        return latency > 200; // 超过200ms认为是高延迟
    }
}

// 创建单例
const performanceDetector = new PerformanceDetector();

export default performanceDetector;

/**
 * 使用示例：
 *
 * import performanceDetector from '@/utils/performanceDetector';
 *
 * // 方式1：直接检测
 * const result = performanceDetector.detect();
 * console.log('是否低性能设备：', result.isLowPerformance);
 * console.log('性能评分：', result.score);
 *
 * // 方式2：获取建议
 * const recommendation = performanceDetector.getRecommendation();
 * console.log('推荐模式：', recommendation.mode);
 * console.log('原因：', recommendation.reason);
 * console.log('建议：', recommendation.suggestions);
 */
