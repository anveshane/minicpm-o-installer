/**
 * 生产环境 HTTPS 静态服务器 + 反向代理
 * 替代 Vite dev server，用于 pnpm build 后的部署
 * 
 * 用法: node serve-prod.mjs [--port 8088] [--backend 8021] [--livekit 7880]
 */
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 解析命令行参数
function getArg(name, defaultVal) {
    const idx = process.argv.indexOf(`--${name}`);
    return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : defaultVal;
}

const PORT = parseInt(getArg('port', '8088'));
const BACKEND_PORT = parseInt(getArg('backend', '8021'));
const LIVEKIT_PORT = parseInt(getArg('livekit', '7880'));
const DIST_DIR = path.join(__dirname, 'dist');
const CERT_DIR = path.join(__dirname, '..', '.certs');

// MIME 类型映射
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.wasm': 'application/wasm',
    '.onnx': 'application/octet-stream',
};

// 反向代理请求
function proxyRequest(req, res, targetPort) {
    const options = {
        hostname: '127.0.0.1',
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error(`Proxy error (port ${targetPort}):`, err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway', detail: err.message }));
    });

    req.pipe(proxyReq, { end: true });
}

// 处理 WebSocket 升级（LiveKit 信令）
function handleUpgrade(req, socket, head, targetPort) {
    const options = {
        hostname: '127.0.0.1',
        port: targetPort,
        path: req.url,
        method: 'GET',
        headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
    };

    const proxyReq = http.request(options);
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        socket.write(
            `HTTP/1.1 101 Switching Protocols\r\n` +
            Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
            '\r\n\r\n'
        );
        if (proxyHead.length) socket.write(proxyHead);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
    });
    proxyReq.on('error', (err) => {
        console.error(`WebSocket proxy error:`, err.message);
        socket.end();
    });
    proxyReq.end();
}

// 静态文件服务
function serveStatic(req, res) {
    let filePath = path.join(DIST_DIR, req.url === '/' ? '/index.html' : req.url.split('?')[0]);

    // SPA fallback: 非文件路径返回 index.html
    if (!path.extname(filePath)) {
        filePath = path.join(DIST_DIR, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            // 文件不存在，返回 index.html（SPA 路由）
            fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, data2) => {
                if (err2) {
                    res.writeHead(404);
                    res.end('Not Found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data2);
            });
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
        });
        res.end(data);
    });
}

// 检查 dist 目录
if (!fs.existsSync(DIST_DIR)) {
    console.error(`错误: dist/ 目录不存在，请先运行: pnpm build:external`);
    process.exit(1);
}

// 检查证书
const certPath = path.join(CERT_DIR, 'server.crt');
const keyPath = path.join(CERT_DIR, 'server.key');
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error(`错误: HTTPS 证书不存在: ${CERT_DIR}/`);
    console.error(`请先运行 one_click.sh start 生成证书`);
    process.exit(1);
}

// 创建 HTTPS 服务器
const server = https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
}, (req, res) => {
    const url = req.url;

    // 代理规则
    if (url.startsWith('/api') || url.startsWith('/ws') || url.startsWith('/download')) {
        return proxyRequest(req, res, BACKEND_PORT);
    }
    if (url.startsWith('/rtc')) {
        return proxyRequest(req, res, LIVEKIT_PORT);
    }

    // 静态文件
    serveStatic(req, res);
});

// WebSocket 升级处理
server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/rtc')) {
        handleUpgrade(req, socket, head, LIVEKIT_PORT);
    } else if (req.url.startsWith('/ws')) {
        handleUpgrade(req, socket, head, BACKEND_PORT);
    } else {
        socket.end();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  生产环境 HTTPS 服务器已启动:`);
    console.log(`  https://0.0.0.0:${PORT}/`);
    console.log(`\n  代理规则:`);
    console.log(`  /api/*     → http://127.0.0.1:${BACKEND_PORT}`);
    console.log(`  /rtc/*     → ws://127.0.0.1:${LIVEKIT_PORT}`);
    console.log(`  其他       → dist/ 静态文件\n`);
});
