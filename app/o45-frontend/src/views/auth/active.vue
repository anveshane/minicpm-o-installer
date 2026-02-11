<template>
    <div class="active-page">
        <div class="active-page-box">
            <div class="content">
                Account pending activation, please activate your account through the verification email in your inbox.
            </div>
            <div class="btn" @click="refresh">Refresh to retry</div>
            <div class="log-out" @click="logout">Log out</div>
        </div>
    </div>
</template>
<script setup>
    import { useRouter, useRoute } from 'vue-router';
    import { activateEmail, getUserInfo } from '@/apis';
    import { useUser } from '@/hooks/useGlobalState';

    const { setUser } = useUser();

    const router = useRouter();
    const route = useRoute();
    onMounted(async () => {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (userInfo && userInfo.token) {
            router.push({ path: '/' });
            return;
        }
        const { id, token } = route.query;
        // 通过激活链接访问
        if (id && token) {
            const { code, message, data } = await activateEmail({ id, token });
            if (code !== 0) {
                ElMessage.error(message);
                return;
            }
            ElMessage.success('Activation successful');
            localStorage.setItem('userInfo', JSON.stringify(data.data));
            setUser({ userId: data.data.userId });
            router.push({
                path: '/'
            });
        }
    });
    const refresh = async () => {
        const token = localStorage.getItem('token');
        if (token) {
            const { code, message, data } = await getUserInfo({ token });
            if (code !== 0) {
                ElMessage.warning(message);
                return;
            }
            ElMessage.success('Activation successful');
            localStorage.setItem('userInfo', JSON.stringify(data.data));
            setUser({ userId: data.data.userId });
            router.push({
                path: '/'
            });
        } else {
            ElMessage.warning(
                'Your account has not been activated yet. Please check your email and click the activation link.'
            );
        }
    };
    const logout = () => {
        router.push({
            path: '/'
        });
    };
</script>
<style lang="less" scoped>
    .active-page {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        &-box {
            width: 698px;
            padding: 48px 32px;
            display: flex;
            flex-direction: column;
            // justify-content: center;
            align-items: center;
            .content {
                color: #333;
                text-align: center;
                // font-family: 'Alibaba PuHuiTi';
                font-size: 28px;
                font-style: normal;
                font-weight: 500;
                line-height: 40px; /* 142.857% */
                margin-bottom: 48px;
            }
            .btn {
                display: flex;
                width: 200px;
                height: 56px;
                padding: 14px 10px;
                justify-content: center;
                align-items: center;
                gap: 10px;
                border-radius: 90px;
                border: 1px solid #666;
                color: #333;
                // font-family: 'Alibaba PuHuiTi';
                font-size: 16px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
                cursor: pointer;
            }
            .log-out {
                color: #1e71ff;
                // font-family: Roboto;
                font-size: 16px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
                cursor: pointer;
                margin-top: 16px;
            }
        }
    }
</style>
