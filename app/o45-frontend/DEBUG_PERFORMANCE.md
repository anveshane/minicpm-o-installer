# WebRTC 性能调试指南

## 🔍 问题诊断

如果你感觉首次响应时间变长了，可能的原因包括：

### 1. 浏览器缓存问题
```javascript
// 在浏览器控制台执行，清除所有缓存
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

### 2. 网络环境变化
- 检查网络延迟：`ping your-server.com`
- 检查带宽：使用 speedtest.net
- 检查是否有代理或VPN影响

### 3. 代码回退测试
我已经将代码回退到更保守的设置：
- 恢复了 `nextTick()` 以确保DOM就绪
- 将 `playoutDelay` 从 50ms 调整到 100ms
- 简化了 attach 函数，减少额外处理
- 移除了可能造成延迟的预加载功能

## 📊 性能监测

### 在浏览器控制台中运行以下代码来监测性能：

```javascript
// 1. 监测总体性能
console.time('WebRTC-Init');
// 开始通话后运行
console.timeEnd('WebRTC-Init');

// 2. 监测音频attach时间
const originalAttach = HTMLAudioElement.prototype.appendChild;
HTMLAudioElement.prototype.appendChild = function(...args) {
    console.time('Audio-Attach');
    const result = originalAttach.apply(this, args);
    console.timeEnd('Audio-Attach');
    return result;
};

// 3. 监测音频播放时间
document.addEventListener('play', (e) => {
    if (e.target.tagName === 'AUDIO') {
        console.log('🎵 音频开始播放:', performance.now());
    }
}, true);
```

### 使用组件内置的性能监测：

```javascript
// 在Vue DevTools或控制台中
$refs.voiceComponent.performanceMetrics;
$refs.voiceComponent.printPerformanceReport();
```

## 🔧 逐步排查

### 步骤1：检查基础延迟
```javascript
// 测试基础网络延迟
const start = performance.now();
fetch('/api/ping').then(() => {
    console.log('网络延迟:', performance.now() - start, 'ms');
});
```

### 步骤2：对比原始版本
临时注释掉所有优化代码，使用最简单的实现：
```javascript
// 最简单的attach
track.attach(audioElement);
```

### 步骤3：逐个启用优化
按以下顺序逐个启用优化功能：
1. AudioContext 预热
2. LiveKit 原生事件
3. 立即 attach
4. 音频元素优化

## 🎯 性能基准

### 正常情况下的时间指标：
- **LiveKit 连接**: < 2000ms
- **首次轨道订阅**: < 500ms  
- **音频 attach**: < 50ms
- **首次播放**: < 200ms
- **总响应时间**: < 3000ms

### 如果超出这些指标：
1. 检查网络连接
2. 检查服务器负载
3. 检查浏览器性能
4. 回退到原始代码

## 🚨 常见问题

### 问题1：AudioContext 被阻止
```javascript
// 检查 AudioContext 状态
console.log('AudioContext state:', globalAudioContext?.state);

// 手动激活
document.addEventListener('click', () => {
    if (globalAudioContext?.state === 'suspended') {
        globalAudioContext.resume();
    }
}, { once: true });
```

### 问题2：自动播放被阻止
```javascript
// 检查自动播放策略
navigator.getAutoplayPolicy?.('mediaelement').then(policy => {
    console.log('Autoplay policy:', policy);
});
```

### 问题3：LiveKit 配置问题
```javascript
// 检查 LiveKit 连接状态
console.log('Room state:', state.room?.state);
console.log('Connection quality:', state.room?.engine?.connectionState);
```

## 📈 性能优化建议

### 如果性能仍然不理想：

1. **回退到原始实现**
   ```javascript
   // 使用最简单的 watch
   watch(() => state.remoteTracks, async (tracks) => {
       await nextTick();
       // 简单的 attach 逻辑
   });
   ```

2. **检查浏览器兼容性**
   - Chrome: 通常性能最好
   - Safari: 可能有自动播放限制
   - Firefox: 可能需要特殊配置

3. **服务器端优化**
   - 检查 LiveKit 服务器配置
   - 优化网络路由
   - 使用CDN加速

## 🔄 回滚方案

如果优化导致性能下降，可以快速回滚：

```bash
# 回滚到优化前的版本
git checkout HEAD~1 -- src/views/home/components/Voice_new_rtc.vue
git checkout HEAD~1 -- src/hooks/useLiveKit.js
```

或者手动移除所有优化代码，只保留基础功能。
