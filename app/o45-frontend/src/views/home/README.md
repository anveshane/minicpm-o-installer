# 首页组件说明

## 文件结构

```
home/
├── index.vue              # PC端首页（完整功能，含头部、侧边栏、主内容区）
├── index.tablet.vue       # 平板端首页（待开发）
├── index.mobile.vue       # 手机端首页（待开发）
├── components/            # 子组件（可被所有设备页面复用）
│   ├── Voice_new_rtc.vue
│   ├── Video_new_rtc.vue
│   └── ...
└── README.md             # 本文件
```

## 开发指南

### 1. PC端 (index.vue)

**状态：** ✅ 已完成

包含完整的桌面端布局：

- 顶部导航栏（Logo、模式切换、配置、语言切换）
- 左侧边栏（语音/视频切换、配置表单）
- 主内容区（语音通话、视频通话等组件）
- 侧边栏折叠功能

### 2. 平板端 (index.tablet.vue)

**状态：** 🚧 待开发

**设计建议：**

- 保留顶部导航栏（简化版）
- 考虑使用抽屉式侧边栏（触摸友好）
- 支持横屏/竖屏自动适配
- 增大触摸区域（按钮、切换项等）

**开发步骤：**

1. 复用PC端的业务逻辑（通过导入或Composables）
2. 重新设计布局（更适合触摸操作）
3. 调整字体和间距（比PC端略大）
4. 测试横屏和竖屏模式

### 3. 手机端 (index.mobile.vue)

**状态：** 🚧 待开发

**设计建议：**

- 采用全屏布局（最大化内容区域）
- 使用底部标签栏代替侧边栏
- 顶部使用简化的固定导航
- 添加手机特有功能：
    - 摄像头前后切换按钮
    - 手势操作（滑动切换、双击等）
    - 全屏视频模式
    - 支持竖屏优先

**开发步骤：**

1. 设计移动端专属布局
2. 导入业务逻辑组件
3. 添加移动端特有交互
4. 优化触摸体验

## 组件复用

所有设备页面都可以复用 `components/` 下的子组件：

```vue
<script setup>
    // 平板端或手机端也可以这样导入
    import VoiceCallRTC from './components/Voice_new_rtc.vue';
    import VideoCallRTC from './components/Video_new_rtc.vue';
</script>
```

## 业务逻辑复用

建议将共同的业务逻辑提取为 Composables：

```javascript
// hooks/useCallLogic.js
export function useCallLogic() {
    const isCalling = ref(false);
    const loading = ref(false);
    const activeTab = ref('video');

    const startCall = () => {
        /* ... */
    };
    const endCall = () => {
        /* ... */
    };

    return {
        isCalling,
        loading,
        activeTab,
        startCall,
        endCall
    };
}
```

然后在任何设备页面中使用：

```vue
<script setup>
    import { useCallLogic } from '@/hooks/useCallLogic';
    const { isCalling, loading, startCall, endCall } = useCallLogic();
</script>
```

## 测试方法

### Chrome DevTools 设备模拟

1. F12 打开开发者工具
2. 点击设备图标（Ctrl+Shift+M / Cmd+Shift+M）
3. 选择设备：
    - **PC测试**：点击设备图标关闭模拟
    - **平板测试**：选择 iPad Pro、iPad Mini 等
    - **手机测试**：选择 iPhone 13、Galaxy S21 等
4. 刷新页面，观察控制台输出

### 控制台输出示例

**PC端：**

```
🚀 路由加载 - 设备类型: pc
💻 加载PC端组件
💻 PC端首页已加载
```

**平板端：**

```
🚀 路由加载 - 设备类型: tablet
📱 加载平板端组件
📱 平板端页面已加载
```

**手机端：**

```
🚀 路由加载 - 设备类型: mobile
📱 加载手机端组件
📱 手机端页面已加载
```

## 注意事项

1. **不要在组件内部判断设备类型**  
   路由层已经处理了设备适配，组件内部专注于UI实现即可

2. **保持业务逻辑独立**  
   将业务逻辑提取为独立的文件，便于在不同设备间复用

3. **考虑性能优化**  
   移动端应该加载更少的资源，使用懒加载和代码分割

4. **测试真实设备**  
   除了模拟器，也要在真实的平板和手机上测试

## 下一步

- [ ] 开发平板端UI (`index.tablet.vue`)
- [ ] 开发手机端UI (`index.mobile.vue`)
- [ ] 提取公共业务逻辑为Composables
- [ ] 添加设备特定功能（摄像头翻转等）
- [ ] 性能优化和真机测试
