export function resolveLivekitUrl() {
    const raw = (import.meta.env.VITE_LIVEKIT_URL ?? '/rtc').toString().trim();
    console.log('🔍 [rtcUrl] VITE_LIVEKIT_URL 原始值:', import.meta.env.VITE_LIVEKIT_URL);
    console.log('🔍 [rtcUrl] raw:', raw);

    // 绝对地址（http/https/ws/wss）
    if (/^(https?|wss?):\/\//i.test(raw)) {
        try {
            const u = new URL(raw);
            const protocol = u.protocol.startsWith('https')
                ? 'wss:'
                : u.protocol.startsWith('http')
                  ? 'ws:'
                  : u.protocol;
            // 去除末尾的 /rtc 以避免 SDK 再追加一次
            const parts = (u.pathname || '/').split('/').filter(Boolean);
            if (parts.length && parts[parts.length - 1].toLowerCase() === 'rtc') parts.pop();
            const basePath = parts.length ? `/${parts.join('/')}` : '';
            const absoluteUrl = `${protocol}//${u.host}${basePath}`;
            console.log('🔍 [rtcUrl] 最终返回 URL (绝对路径):', absoluteUrl);
            return absoluteUrl;
        } catch {
            // 解析失败时退化为相对逻辑
        }
    }

    // 相对路径或空：按当前域名拼接（去掉末尾 /rtc，避免 SDK 再追加）
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let path = raw || '/';
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.toLowerCase().endsWith('/rtc')) path = path.slice(0, -4) || '/';
    const search = window.location.search || '';
    const finalUrl = `${wsProtocol}//${window.location.host}${path === '/' ? '' : path}${search}`;
    console.log('🔍 [rtcUrl] 最终返回 URL (相对路径):', finalUrl);
    return finalUrl;
}

// 清华机器用这个配置
