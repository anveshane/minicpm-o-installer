<template>
    <Watermark v-if="waterMarkText" :text="waterMarkText" />
    <RouterView />
</template>

<script setup>
    import { useUser } from '@/hooks/useGlobalState';
    const { user, setUser } = useUser();

    const waterMarkText = ref('');
    const showWatermark = ref(false);
    onMounted(() => {
        showWatermark.value = !!localStorage.getItem('userInfo');
        if (showWatermark.value) {
            const userInfo = JSON.parse(localStorage.getItem('userInfo'));
            waterMarkText.value = userInfo.userId;
            setUser({ userId: userInfo.userId });
        }
    });
    watch(
        () => user.value,
        newUser => {
            if (newUser) {
                console.log('User changed:', newUser);
                waterMarkText.value = newUser.userId;
            }
        }
    );
</script>

<style lang="less" scoped></style>
