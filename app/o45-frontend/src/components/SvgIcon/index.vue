<template>
    <svg :class="iconClass" v-html="content"></svg>
</template>

<script>
    // 模块级别的全局缓存，所有组件实例共享
    const svgCache = new Map();
</script>

<script setup>
    import { ref, computed, watch } from 'vue';

    const props = defineProps({
        name: {
            type: String,
            required: true
        },
        className: {
            type: String,
            default: ''
        }
    });

    const content = ref('');

    const iconClass = computed(() => ['svg-icon', props.className]);

    const loadSvg = iconName => {
        // 先检查缓存中是否已有该 SVG
        if (svgCache.has(iconName)) {
            content.value = svgCache.get(iconName);
            return;
        }

        // 缓存中没有，才进行加载
        import(`@/assets/svg/${iconName}.svg`)
            .then(module => {
                fetch(module.default)
                    .then(response => response.text())
                    .then(svg => {
                        content.value = svg;
                        // 将加载的 SVG 内容存入缓存
                        svgCache.set(iconName, svg);
                    });
            })
            .catch(error => {
                console.error(`Error loading SVG icon: ${iconName}`, error);
            });
    };

    // 监听 name prop 的变化，并在初始化时立即执行
    watch(
        () => props.name,
        newName => {
            if (newName) {
                loadSvg(newName);
            }
        },
        { immediate: true }
    );
</script>
<style lang="less" scoped>
    .svg-icon {
        width: 24px;
        height: 24px;
    }
</style>
