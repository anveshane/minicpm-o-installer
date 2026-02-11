// md5.js
// 原生 JavaScript 实现 MD5 加密模块

/**
 * 将字符串转换为 UTF-8 编码的字节数组
 * @param {string} str
 * @returns {number[]}
 */
function toUtf8Bytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0xd800 || code >= 0xe000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            // 处理代理对
            i++;
            const low = str.charCodeAt(i);
            code = ((code & 0x3ff) << 10) | ((low & 0x3ff) + 0x10000);
            bytes.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f)
            );
        }
    }
    return bytes;
}

/**
 * 左循环位移
 * @param {number} x 32 位整数
 * @param {number} c 移动位数
 * @returns {number}
 */
function rotLeft(x, c) {
    return (x << c) | (x >>> (32 - c));
}

// 四个基本非线性函数
const fns = {
    F: (b, c, d) => (b & c) | (~b & d),
    G: (b, c, d) => (b & d) | (c & ~d),
    H: (b, c, d) => b ^ c ^ d,
    I: (b, c, d) => c ^ (b | ~d)
};

/**
 * 单步操作
 */
function step(fn, a, b, c, d, x, s, t) {
    return (rotLeft((a + fn(b, c, d) + x + t) >>> 0, s) + b) >>> 0;
}

/**
 * 计算 MD5 摘要
 * @param {string} message 输入字符串
 * @returns {string} 32 位十六进制摘要
 */
export const md5 = message => {
    const msgBytes = toUtf8Bytes(message);
    const origBitLen = msgBytes.length * 8;

    // 填充：先 1，再 0，直到长度 mod 512 === 448
    msgBytes.push(0x80);
    while (msgBytes.length % 64 !== 56) msgBytes.push(0);

    // 附加原始长度（64 位小端）
    for (let i = 0; i < 8; i++) {
        msgBytes.push((origBitLen >>> (8 * i)) & 0xff);
    }

    // 初始状态
    let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

    // 生成常量表 T[k]
    const T = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));

    // 处理每个 512 位块
    for (let i = 0; i < msgBytes.length; i += 64) {
        const chunk = msgBytes.slice(i, i + 64);
        const M = Array.from(
            { length: 16 },
            (_, j) => chunk[4 * j] | (chunk[4 * j + 1] << 8) | (chunk[4 * j + 2] << 16) | (chunk[4 * j + 3] << 24)
        );

        let [A, B, C, D] = [a0, b0, c0, d0];
        const rounds = [
            { fn: fns.F, idx: i => i, s: [7, 12, 17, 22] },
            { fn: fns.G, idx: i => (5 * i + 1) % 16, s: [5, 9, 14, 20] },
            { fn: fns.H, idx: i => (3 * i + 5) % 16, s: [4, 11, 16, 23] },
            { fn: fns.I, idx: i => (7 * i) % 16, s: [6, 10, 15, 21] }
        ];

        rounds.forEach(({ fn, idx, s }, round) => {
            for (let j = 0; j < 16; j++) {
                const k = idx(j);
                const temp = D;
                D = C;
                C = B;
                B = step(fn, A, B, C, D, M[k], s[j % 4], T[round * 16 + j]);
                A = temp;
            }
        });

        a0 = (a0 + A) >>> 0;
        b0 = (b0 + B) >>> 0;
        c0 = (c0 + C) >>> 0;
        d0 = (d0 + D) >>> 0;
    }

    // 转为 32 字节十六进制
    return [a0, b0, c0, d0].map(n => n.toString(16).padStart(8, '0')).join('');
};
