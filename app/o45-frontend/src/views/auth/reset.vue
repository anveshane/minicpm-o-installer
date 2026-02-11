<template>
    <div class="reset-page">
        <div class="reset-content">
            <div class="reset-content-title">Reset Your Password</div>
            <div class="reset-content-form">
                <el-form label-position="top" :model="formData" :rules="rules" ref="formRef">
                    <el-form-item label="New Password" prop="password">
                        <el-input
                            v-model="formData.password"
                            type="password"
                            show-password
                            placeholder="Enter new password"
                        ></el-input>
                    </el-form-item>
                    <el-form-item label="Confirm Password" prop="confirmPassword">
                        <el-input
                            v-model="formData.confirmPassword"
                            type="password"
                            show-password
                            placeholder="Confirm new password"
                        ></el-input>
                    </el-form-item>
                </el-form>
            </div>
            <div class="reset-content-footer">
                <el-button class="reset-btn" type="primary" @click="resetPassword">Confirm</el-button>
            </div>
        </div>
    </div>
</template>
<script setup>
    import { setNewPassword } from '@/apis';
    import { sha256 } from '@/hooks/useSha256';
    import { md5 } from '@/hooks/useMd5';
    import { useRoute, useRouter } from 'vue-router';

    const route = useRoute();
    const router = useRouter();
    const rules = {
        password: [
            { required: true, message: 'Please enter a new password', trigger: 'blur' },
            { min: 6, max: 20, message: 'Password length should be between 6 and 20 characters', trigger: 'blur' }
        ],
        confirmPassword: [
            { required: true, message: 'Please confirm your password', trigger: 'blur' },
            { min: 6, max: 20, message: 'Password length should be between 6 and 20 characters', trigger: 'blur' },
            {
                validator: (rule, value, callback) => {
                    if (value !== formData.value.password) {
                        callback(new Error('The two passwords do not match'));
                    } else {
                        callback();
                    }
                },
                trigger: 'change'
            }
        ]
    };
    const formData = ref({
        password: '',
        confirmPassword: ''
    });
    const formRef = ref(null);
    onMounted(() => {
        const { id, token } = route.query;
        if (!id || !token) {
            ElMessage.error('Invalid link');
            router.push({ path: '/new' });
            return;
        }
    });
    const resetPassword = async () => {
        formRef.value.validate(async valid => {
            if (valid) {
                const pwd = await sha256(formData.value.password);
                const md5Pwd = await md5(pwd);
                const { id, token } = route.query;
                const { code, message, data } = await setNewPassword({
                    id,
                    token,
                    password: md5Pwd,
                    passwordConfirm: md5Pwd
                });
                console.log(code, message, data);
                if (code !== 0) {
                    ElMessage.error(message);
                    return;
                }
                ElMessage.success('Password reset successfully');
                router.push({ path: '/new' });
            }
        });
    };
</script>
<style lang="less">
    .reset-page {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        .reset-content {
            width: 480px;
            padding: 48px 32px;
            border-radius: 20px;
            background: #ffffff;
            box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.1);
            &-title {
                color: #333;
                text-align: center;
                // font-family: 'Alibaba PuHuiTi';
                font-size: 26px;
                font-style: normal;
                font-weight: 600;
                line-height: 1;
            }
            &-form {
                .el-form {
                    .el-form-item {
                        margin: 32px 0 0;
                        .el-form-item__label {
                            color: #333;
                            // font-family: 'Alibaba PuHuiTi';
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 400;
                            line-height: normal;
                        }
                        .el-form-item__content {
                            .el-input {
                                .el-input__wrapper {
                                    height: 58px;
                                    border-radius: 16px;
                                    background: #f6f6f6;
                                    box-shadow: none;
                                }
                            }
                        }
                    }
                }
            }
            &-footer {
                display: flex;
                justify-content: center;
                align-items: center;
                .reset-btn {
                    width: 300px;
                    height: 56px;
                    margin-top: 48px;
                    border-radius: 16px;
                    background: #647fff;
                    border: none;
                    color: #fff;
                    // font-family: 'Alibaba PuHuiTi';
                    font-size: 18px;
                    font-style: normal;
                    font-weight: 500;
                    line-height: normal;
                }
            }
        }
    }
</style>
