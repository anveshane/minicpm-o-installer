<template>
    <div class="orb-wrapper" :style="wrapperStyle">
        <canvas ref="canvasRef" />
    </div>
</template>

<script setup>
    import { computed, ref, onMounted, onBeforeUnmount } from 'vue';

    const props = defineProps({
        size: { type: Number, default: 214 }, // 画布尺寸（px）
        baseEnergy: { type: Number, default: 0.32 }, // 能量基线
        pulse: { type: Boolean, default: true }, // 是否自动呼吸
        glowPadding: { type: Number, default: 0 }, // 光晕溢出大小（px），用于计算包裹尺寸
        frozen: { type: Boolean, default: false } // 是否暂停动画（保持当前帧）
    });

    const canvasRef = ref(null);
    let gl, program, rafId, pulseTimer;
    let initialized = false;

    let energy = props.baseEnergy;
    let targetEnergy = props.baseEnergy;
    let timeAcc = 0; // 累积时间（ms），用于暂停后恢复
    let lastTs = 0; // 上一帧时间戳

    const wrapperStyle = computed(() => {
        const outer = props.size + props.glowPadding * 2;
        return {
            width: `${outer}px`,
            height: `${outer}px`
        };
    });

    const vs = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0., 1.);
  }
  `;

    const fs = `
  precision highp float;
  varying vec2 vUv;
  uniform float u_time;
  uniform float u_energy;

  /* ================= noise ================= */
  float hash(vec2 p){
    p = fract(p * vec2(123.34,456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + 1.), f.x),
      f.y
    );
  }

  float fbm(vec2 p){
    float v = 0., a = .5;
    for(int i = 0; i < 6; i++){
      v += a * noise(p);
      p *= 2.;
      a *= .5;
    }
    return v;
  }

  /* ================= main ================= */
  void main(){
    vec2 uv = vUv * 2. - 1.;
    float r = length(uv);
    if(r > 1.) discard;

    float t = u_time * 0.68;
    float breath = 0.72 + 0.28 * sin(u_time * 0.52);
    float e = clamp(u_energy * breath, 0.0, 1.0);

    /* -------- 中心偏移，制造柔和漂移 -------- */
    vec2 drift = vec2(
      sin(t * 0.24) * 0.16,
      cos(t * 0.28) * 0.16
    );
    uv += drift * 0.4;

    /* -------- 轻微旋涡拉扯（柔和流动方向） -------- */
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    angle += 0.18 * sin(t * 0.58 + radius * 2.4);
    vec2 swirl = vec2(cos(angle), sin(angle)) * radius;

    /* -------- 多层流动扰动 -------- */
    vec2 warp1 = vec2(
      fbm(swirl * 1.60 + vec2(t, -t)),
      fbm(swirl * 1.60 + vec2(-t, t))
    );
    vec2 warp2 = vec2(
      fbm(swirl * 3.0 + warp1 * 1.2 + vec2(t * 1.45, -t * 0.9)),
      fbm(swirl * 3.0 - warp1 * 1.2 + vec2(-t * 1.10, t * 1.25))
    );
    vec2 flow = swirl + warp1 * 0.28 + warp2 * 0.32 * (0.85 + e * 0.65);

    /* -------- 云雾体积与细节 -------- */
    float cloud = fbm(flow * 2.0 + drift * 0.55 + t * 0.40);
    float detail = fbm(flow * 4.4 + t * 0.90);
    float density = smoothstep(0.04, 0.86, cloud + detail * 0.14);

    /* -------- 配色：更干净的浅蓝系 -------- */
    vec3 colorA = vec3(1.000, 1.000, 1.000);          // 纯白
    vec3 colorB = vec3(0.75, 0.90, 1.00);             // 更浅的湖蓝
    vec3 colorC = vec3(0.26, 0.56, 1.00);             // 主色 1e71ff

    float light = 0.0; // 占位避免编译器误判未声明

    // 为浅色与深色使用不同的流场，降低互染
    vec2 lightFlow = flow + fbm(flow * 1.1 + 2.0) * 0.12;
    vec2 darkFlow  = flow + fbm(flow * 1.2 - 1.6) * 0.12;

    float lightField = fbm(lightFlow * 1.12 + vec2(1.8, 1.1) + t * 0.28);
    float darkField  = fbm(darkFlow  * 1.32 + vec2(-1.6, -1.2) - t * 0.26);
    float lightMask = smoothstep(0.40, 0.78, lightField);
    float darkMask  = smoothstep(0.44, 0.82, darkField); // 深色阈值稍高，减少侵染

    // 上半更亮、下半略暗（但整体仍干净）
    float verticalBias = smoothstep(-0.15, 0.9, uv.y);
    // 控制浅色占比，避免长期填满：下调浅色权重，上调深色权重
    lightMask = clamp(lightMask * (0.60 + 0.28 * verticalBias), 0.0, 1.0);
    darkMask  = clamp(darkMask  * (0.78 + 0.32 * (1.0 - verticalBias)), 0.0, 1.0);

    // 避免完全叠加：归一化分配
    float sumMask = lightMask + darkMask;
    float lightMix = (sumMask > 1e-3) ? lightMask / sumMask : 0.0;
    float darkMix  = (sumMask > 1e-3) ? darkMask  / sumMask : 0.0;

    // 基础亮度（兜底用）
    float lightStrength = clamp(density * 1.10 + 0.05, 0.0, 1.0); // 再提亮兜底

    // 构建浅色基底 + 深色基底，再按 mask 混合
    vec3 lightBase = mix(colorA, colorB, clamp(density * 0.72 + 0.06, 0.0, 1.0)); // 更偏白
    vec3 darkBase  = mix(colorB, colorC, clamp(density * 0.52 + 0.12, 0.0, 1.0)); // 深色再减

    vec3 baseMasked = lightBase * lightMix + darkBase * darkMix;
    vec3 baseDefault = mix(colorA, colorB, lightStrength); // 兜底：避免 mask 过低导致发黑
    float maskBlend = clamp(sumMask * 3.0, 0.0, 1.0); // sumMask 小时更多用兜底色

    // 边缘减暗：靠近圆边衰减深色，避免灰暗环
    float edgeFade = 1.0 - smoothstep(0.72, 1.0, r);
    darkMix *= edgeFade * 0.85;

    vec3 base = mix(baseDefault, baseMasked, maskBlend);
    base = mix(base, base * 1.03, verticalBias * 0.18); // 顶部轻微提亮

    /* -------- 核心能量与光晕 -------- */
    float core = smoothstep(1.14, 0.60, r);
    float rim = smoothstep(1.00, 1.12, r);
    vec3 glow = vec3(0.42, 0.64, 1.05) * rim * (0.46 + e * 0.46);

    vec3 finalColor = mix(base, base + glow, 0.56);
    // 边缘提亮，减少灰感
    float edgeLight = smoothstep(0.70, 1.0, r);
    finalColor = mix(finalColor, vec3(1.0), edgeLight * 0.10);
    finalColor = mix(finalColor, vec3(1.0), smoothstep(1.00, 1.12, r) * 0.110); // 更强高光
    finalColor *= (0.92 + 0.08 * core); // 进一步减少压暗

    /* -------- 轻微柔化提亮 -------- */
    finalColor = pow(finalColor, vec3(0.90)); // 再提亮

    gl_FragColor = vec4(finalColor, 1.0);
  }
  `;

    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            /* eslint-disable no-console */
            console.warn('Shader compile error:', gl.getShaderInfoLog(s));
            /* eslint-enable no-console */
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    function init() {
        gl = canvasRef.value.getContext('webgl', {
            antialias: true,
            premultipliedAlpha: true
        });
        if (!gl) return;

        const vsObj = compile(gl.VERTEX_SHADER, vs);
        const fsObj = compile(gl.FRAGMENT_SHADER, fs);
        if (!vsObj || !fsObj) return;

        program = gl.createProgram();
        gl.attachShader(program, vsObj);
        gl.attachShader(program, fsObj);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            /* eslint-disable no-console */
            console.warn('Program link error:', gl.getProgramInfoLog(program));
            /* eslint-enable no-console */
            return;
        }
        gl.useProgram(program);
        initialized = true;

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        const pos = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    }

    function render(t) {
        if (!gl || !program || !initialized) return;
        if (!lastTs) lastTs = t;
        const dt = props.frozen ? 0 : t - lastTs;
        lastTs = t;
        timeAcc += dt;

        energy += (targetEnergy - energy) * 0.055;
        gl.uniform1f(gl.getUniformLocation(program, 'u_time'), timeAcc * 0.001);
        gl.uniform1f(gl.getUniformLocation(program, 'u_energy'), energy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        rafId = requestAnimationFrame(render);
    }

    onMounted(() => {
        const c = canvasRef.value;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const px = props.size;
        c.width = c.height = px * dpr;
        c.style.width = c.style.height = px + 'px';
        init();
        if (initialized) {
            timeAcc = 0;
            lastTs = 0;
            if (props.pulse) {
                pulseTimer = setInterval(() => {
                    targetEnergy = 0.2 + Math.random() * 0.3;
                }, 1100);
            }
            rafId = requestAnimationFrame(render);
        }
    });

    onBeforeUnmount(() => {
        cancelAnimationFrame(rafId);
        if (pulseTimer) clearInterval(pulseTimer);
    });
</script>

<style scoped>
    .orb-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
        background: transparent;
    }

    canvas {
        border-radius: 50%;
        background: transparent;
        filter: drop-shadow(0 0 16px rgba(87, 151, 255, 0.42)) drop-shadow(0 0 6px rgba(87, 151, 255, 0.25));
    }
</style>
