import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// import vueDevTools from 'vite-plugin-vue-devtools';

import Icons from 'unplugin-icons/vite';
import IconsResolver from 'unplugin-icons/resolver';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

import fs from 'fs';
import path from 'path';

import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    // optimizeDeps: {
    //     include: ['public/ort-wasm-simd.wasm', 'public/silero_vad_legacy.onnx']
    // },
    plugins: [
        vue(),
        // vueDevTools(),
        AutoImport({
            resolvers: [
                ElementPlusResolver(), // Auto import icon components
                // 自动导入图标组件
                IconsResolver({
                    prefix: 'Icon'
                })
            ],
            imports: ['vue', 'vue-router', '@vueuse/core'],
            dirs: ['src/apis/**/*', 'src/hooks/*'],
            vueTemplate: true,
            eslintrc: {
                enabled: true
            }
        }),
        Components({
            resolvers: [
                ElementPlusResolver(), // 自动注册图标组件
                IconsResolver({
                    enabledCollections: ['ep']
                })
            ],
            dirs: ['src/components']
        }),
        Icons({
            autoInstall: true
        })
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    css: {
        preprocessorOptions: {
            less: {
                additionalData: `@import 'src/styles/element/index.less';`
            }
        }
    },
    server: {
        https: (() => {
            // 由 one_click.sh 自动生成的自签名证书（包含服务器 IP）
            const certDir = path.resolve(__dirname, '../.certs');
            const keyPath = path.resolve(certDir, 'server.key');
            const certPath = path.resolve(certDir, 'server.crt');
            if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
                return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
            }
            return false;  // 无证书时回退到 HTTP
        })(),
        host: '0.0.0.0',
        port: 8088,
        proxy: {
            // LiveKit 信令代理（HTTPS 页面通过 wss:// → ws:// 转发）
            '/rtc': {
                target: 'ws://localhost:7880',
                ws: true,
                changeOrigin: true
            },
            // '/api/v1': {
            //     // 0.5-1.0-1.5-2.0
            //     target: 'http://10.158.0.26:8021',
            //     ws: true,
            //     changeOrigin: true
            // },
            '/ws': {
                target: 'http://10.158.0.18:8021',
                ws: true,
                changeOrigin: true
            },
            '/v1/login/api': {
                target: 'https://login-service.modelbest.cn',
                ws: true,
                changeOrigin: true
            },
            '/login': {
                target: 'http://10.158.0.32:8041',
                // target: 'http://192.168.10.150:8021',
                ws: true,
                changeOrigin: true
            },
            '/logout': {
                target: 'http://10.158.0.32:8041',
                // target: 'http://192.168.10.150:8021',
                ws: true,
                changeOrigin: true
            },
            // 中国单工
            '/api/region1/inference/services': {
                target: 'http://47.93.211.211:8023',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/region1/, '/api')
            },
            // 中国双工
            '/api/region2/inference/services': {
                target: 'http://47.93.211.211:8022',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/region2/, '/api')
            },
            // 美国单工
            '/api/region3/inference/services': {
                target: 'http://34.135.164.183:8034',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/region3/, '/api')
            },
            // 美国双工
            '/api/region4/inference/services': {
                target: 'http://34.135.164.183:8035',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/region4/, '/api')
            },
            // 欧洲单工
            '/api/region5/inference/services': {
                target: 'http://34.178.28.73:8034',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/region5/, '/api')
            },
            // 欧洲双工
            '/api/region6/inference/services': {
                target: 'http://34.178.28.73:8035',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/region6/, '/api')
            },
            // 印度单工
            '/api/region7/inference/services': {
                target: 'http://34.131.182.85:8034',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/region7/, '/api')
            },
            // 印度双工
            '/api/region8/inference/services': {
                target: 'http://34.131.182.85:8035',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/region8/, '/api')
            },
            // 双工视频服务
            '/api/cpp/login': {
                target: 'http://10.32.0.221:8022',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/cpp/, '/api')
            },
            // 单工语音服务
            '/api/python/login': {
                target: 'http://47.93.211.211:8023',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/python/, '/api')
            },
            '/api': {
                // target: 'http://10.32.0.221:8022',
                target: 'http://localhost:8021',
                ws: true,
                changeOrigin: true
            },
            '/download': {
                // target: 'http://211.93.21.165:8021',
                target: 'http://10.158.0.32:8021',
                ws: true,
                changeOrigin: true
            }
        }
    }
});
