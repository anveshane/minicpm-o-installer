// composables/useNetworkSpeed.js
import { ref } from 'vue';
import axios from 'axios';

export function useNetworkSpeed(options) {
    const speedMbps = ref(null);
    const isTesting = ref(false);

    let timer = null;

    const testDownloadSpeed = async () => {
        const { fileUrl, fileSizeBytes } = options;
        const start = performance.now();

        try {
            isTesting.value = true;

            await axios.get(`${fileUrl}?_t=${Date.now()}`, {
                responseType: 'blob',
                headers: { 'Cache-Control': 'no-cache' }
            });

            const end = performance.now();
            const duration = (end - start) / 1000; // 秒
            const bitsLoaded = fileSizeBytes * 8;
            const mbps = bitsLoaded / duration / 1024 / 1024;

            speedMbps.value = Number(mbps.toFixed(2));
        } catch (e) {
            console.warn('测速失败:', e);
            speedMbps.value = null;
        } finally {
            isTesting.value = false;
        }
    };

    const startTesting = () => {
        const interval = options.interval ?? 10000;

        // 如果已有定时器，先清除再重启
        if (timer) {
            clearInterval(timer);
        }

        // 立即测速一次
        testDownloadSpeed();

        // 开启新定时器
        timer = setInterval(testDownloadSpeed, interval);
    };

    const stopTesting = () => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    };

    return {
        speedMbps,
        isTesting,
        startTesting,
        stopTesting
    };
}
