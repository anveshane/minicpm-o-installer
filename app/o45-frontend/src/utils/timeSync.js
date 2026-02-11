import { getCurrentTime } from '@/apis';

/**
 * 时间同步工具
 * 用于同步服务器时间，计算时间偏移量
 */
class TimeSync {
    constructor() {
        this.timeOffset = 0; // 服务器时间与本地时间的偏移量（毫秒）
        this.networkLatency = -1; // 网络延时（毫秒），-1 表示尚未同步
        this.isSynced = false; // 是否已同步
        this.syncInterval = null; // 定时同步的定时器
    }

    /**
     * 将后端时间格式转换为时间戳（毫秒）
     */
    parseServerTime(timeStr) {
        // 后端格式: "2025-11-10 05:26:02.069769"
        // 前后端同时区，后端返回本地时间，不添加Z让浏览器按本地时区解析
        const parts = timeStr.split(' ');
        if (parts.length === 2) {
            const [date, time] = parts;
            // 截取时间部分的毫秒（只保留3位）
            const timeParts = time.split('.');
            const ms = timeParts[1] ? timeParts[1].substring(0, 3) : '000';
            // 不添加Z，让Date构造函数按本地时区解析
            const isoStr = `${date}T${timeParts[0]}.${ms}`;
            return new Date(isoStr).getTime();
        }
        // 如果格式不对，尝试直接解析（将空格替换为T）
        return new Date(timeStr.replace(' ', 'T')).getTime();
    }

    /**
     * 同步服务器时间
     */
    async sync() {
        try {
            // eslint-disable-next-line no-console
            console.log('⏳ 开始同步服务器时间...');

            const clientSendTime = performance.now(); // 发送请求前的客户端时间（高精度）
            const { code, data } = await getCurrentTime();
            const clientReceiveTime = performance.now(); // 收到响应后的客户端时间（高精度）

            if (code === 0 && data && data.time) {
                // 计算网络往返时间（RTT）
                const rtt = clientReceiveTime - clientSendTime;
                // 保留小数，避免太小的延时被 round 成 0
                this.networkLatency = Math.max(1, Math.round(rtt)); // 至少显示1ms

                // 假设网络延时对称，单程延时为 RTT / 2
                const oneWayLatency = rtt / 2;

                // 服务器时间戳（毫秒）
                const serverTime = this.parseServerTime(data.time);

                // 计算服务器时间到达客户端时的真实时间
                const estimatedServerTime = serverTime + oneWayLatency;

                // 计算时间偏移量：服务器时间 - 本地时间
                const localTime = Date.now();
                this.timeOffset = estimatedServerTime - localTime;
                this.isSynced = true;

                // eslint-disable-next-line no-console
                console.log('🕐 时间同步成功（页面加载后仅同步一次）:', {
                    serverTimeRaw: data.time,
                    serverTime: new Date(serverTime).toISOString(),
                    networkLatencyRaw: rtt.toFixed(2) + 'ms',
                    networkLatency: this.networkLatency + 'ms',
                    timeOffset: Math.round(this.timeOffset) + 'ms',
                    localTime: new Date(localTime).toISOString(),
                    syncedTime: new Date(localTime + this.timeOffset).toISOString()
                });

                return true;
            } else {
                // eslint-disable-next-line no-console
                console.error('❌ 同步失败: 响应数据格式错误', { code, data });
                return false;
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('❌ 同步服务器时间失败:', error);
            return false;
        }
    }

    /**
     * 获取同步后的当前时间（Date 对象）
     */
    getSyncedTime() {
        const now = Date.now();
        return new Date(now + this.timeOffset);
    }

    /**
     * 获取同步后的当前时间戳（毫秒）
     */
    getSyncedTimestamp() {
        return Date.now() + this.timeOffset;
    }

    /**
     * 格式化同步后的时间为字符串
     * @param {string} format - 格式化模板，默认为 'YYYY-MM-DD HH:mm:ss.SSS'
     */
    formatSyncedTime(format = 'YYYY-MM-DD HH:mm:ss.SSS') {
        const date = this.getSyncedTime();
        const pad2 = n => String(n).padStart(2, '0');
        const pad3 = n => String(n).padStart(3, '0');

        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        const hours = pad2(date.getHours());
        const minutes = pad2(date.getMinutes());
        const seconds = pad2(date.getSeconds());
        const ms = pad3(date.getMilliseconds());

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds)
            .replace('SSS', ms);
    }

    /**
     * 启动自动同步（每隔一段时间重新同步）
     * @param {number} interval - 同步间隔（毫秒），默认30秒
     * 注意：当前应用不使用自动同步，只在页面加载时同步一次
     */
    startAutoSync(interval = 30000) {
        this.stopAutoSync(); // 先停止之前的定时器
        this.syncInterval = setInterval(() => {
            this.sync();
        }, interval);
    }

    /**
     * 停止自动同步
     */
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * 获取网络延时
     */
    getNetworkLatency() {
        return this.networkLatency;
    }

    /**
     * 获取时间偏移量
     */
    getTimeOffset() {
        return this.timeOffset;
    }
}

// 创建单例实例
const timeSyncInstance = new TimeSync();

// 导出单例实例和类
export default timeSyncInstance;
export { TimeSync };
