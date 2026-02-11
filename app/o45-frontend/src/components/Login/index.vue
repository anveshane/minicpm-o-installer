<template>
    <el-dialog
        v-model="showLogin"
        width="480"
        :align-center="true"
        close-on-click-modal
        close-on-press-escape
        :before-close="handleClose"
        :destroy-on-close="true"
        :show-close="false"
        class="login-dialog"
    >
        <div class="login-title" v-if="pageType === 'login'">{{ t('login.title') }}</div>
        <!-- <div class="login-title" v-else-if="pageType === 'reset'">Reset Password</div>
        <div class="login-title" v-else>Sign up to MiniCPM</div>
        <section v-if="locale === 'zh'"> -->
        <div class="login-box">
            <el-form label-width="0" :model="formData" :rules="rules" ref="formRef" class="login-form">
                <el-form-item prop="phoneNum">
                    <el-input v-model="formData.phoneNum" placeholder="请输入手机号" />
                </el-form-item>
                <el-form-item prop="password">
                    <el-input v-model="formData.password" type="password" placeholder="请输入密码" show-password />
                </el-form-item>
            </el-form>
        </div>
        <div class="login-btn">
            <el-button type="primary" @click="handleLogin">注册 / 登录</el-button>
        </div>
        <div class="login-footer">
            <div class="footer-checkbox">
                <el-checkbox v-model="isAgree" />
            </div>
            <div class="footer-text">注册/登录即表示同意</div>
            <div class="footer-link" @click="goTo('CommercialTerms')">用户协议</div>
            <div class="footer-text">和</div>
            <div class="footer-link" @click="goTo('PrivacyPolicy')">隐私政策</div>
        </div>
        <!-- </section> -->
        <!-- <section v-else>
            <section v-if="pageType === 'login'">
                <div class="login-box">
                    <el-form label-width="0" :model="formData" :rules="rules" ref="formRef" class="login-form">
                        <el-form-item prop="email">
                            <SvgIcon name="email" class="email-icon" />
                            <el-input v-model="formData.email" placeholder="Enter your email" />
                        </el-form-item>
                        <el-form-item prop="password" class="password-item">
                            <SvgIcon name="lock" class="lock-icon" />
                            <el-input
                                v-model="formData.password"
                                placeholder="Enter your password"
                                type="password"
                                show-password
                                clearable
                            />
                            <span class="forget-btn" @click="handleChangeType('reset')">Forget your password?</span>
                        </el-form-item>
                    </el-form>
                </div>
                <div class="login-btn">
                    <el-button type="primary" @click="handleEmailLogin">Log in</el-button>
                </div>
                <div class="sign-up">
                    <span class="sign-up-text">No account yet? </span>
                    <span class="sign-up-btn" @click="handleChangeType('sign-up')">Sign up</span>
                </div>
                <div class="login-footer en-footer">
                    <div class="footer-text">By continuing, you agree to MiniCPM's</div>
                    <div class="footer-link" @click="goTo('CommercialTerms')">Terms of Service</div>
                    <div class="footer-text">and</div>
                    <div class="footer-link" @click="goTo('PrivacyPolicy')">Privacy Policy</div>
                    <div class="footer-text">.</div>
                </div>
            </section>
            <section v-else-if="pageType === 'reset'">
                <div class="reset-box">
                    <el-form
                        label-width="0"
                        :model="resetData"
                        :rules="resetRules"
                        ref="resetFormRef"
                        class="login-form"
                    >
                        <el-form-item prop="email">
                            <SvgIcon name="email" class="email-icon" />
                            <el-input v-model="resetData.email" placeholder="Enter your email" />
                        </el-form-item>
                    </el-form>
                </div>
                <div class="reset-btn">
                    <el-button type="primary" @click="sendResetLink">Send password reset link</el-button>
                </div>
                <div class="log-in">
                    <span class="log-in-text">Remembered your password? </span>
                    <span class="log-in-btn" @click="handleChangeType('login')">Log in</span>
                </div>
            </section>
            <section v-else>
                <div class="login-box">
                    <el-form label-width="0" :model="formData" :rules="rules" ref="formRef" class="login-form">
                        <el-form-item prop="email">
                            <SvgIcon name="email" class="email-icon" />
                            <el-input v-model="formData.email" placeholder="Enter your email" />
                        </el-form-item>
                        <el-form-item prop="password">
                            <SvgIcon name="lock" class="lock-icon" />
                            <el-input
                                v-model="formData.password"
                                placeholder="Enter your password"
                                type="password"
                                show-password
                            />
                        </el-form-item>
                        <el-form-item prop="passwordConfirm">
                            <SvgIcon name="lock" class="lock-icon" />
                            <el-input
                                v-model="formData.passwordConfirm"
                                placeholder="Again enter your password"
                                type="password"
                                show-password
                            />
                        </el-form-item>
                    </el-form>
                </div>
                <div class="login-btn">
                    <el-button type="primary" @click="handleEmailSignUp">Sign up</el-button>
                </div>
            </section>
        </section> -->
    </el-dialog>
</template>

<script setup>
    import { useI18n } from 'vue-i18n';
    import { useValidPhone, useValidEmail } from '@/hooks/useValid';
    import { useUser } from '@/hooks/useGlobalState';
    import { sha256 } from '@/hooks/useSha256';
    import { md5 } from '@/hooks/useMd5';
    import { loginByPhone, loginByEmail, sendResetEmail, registerByEmail, deleteUser } from '@/apis';
    import { useRouter } from 'vue-router';

    const { setUser } = useUser();

    const { t, locale } = useI18n();
    const router = useRouter();

    const showLogin = defineModel('showLogin');
    const emits = defineEmits(['loginSuccess']);

    const formData = ref({
        phoneNum: '',
        email: '',
        password: '',
        passwordConfirm: ''
    });
    const resetData = ref({
        email: ''
    });
    const formRef = ref(null);
    const resetFormRef = ref(null);
    const isAgree = ref(false);

    const pageType = ref('login');

    const checkPhoneNum = (rule, value, callback) => {
        if (value === '') {
            callback(new Error('手机号不能为空'));
        } else if (!useValidPhone(value)) {
            callback(new Error('手机号不正确'));
        } else {
            callback();
        }
    };
    const checkEmail = (rule, value, callback) => {
        if (value === '') {
            callback(new Error('Enter your email'));
        } else if (!useValidEmail(value)) {
            callback(new Error('Please enter the correct email address'));
        } else {
            callback();
        }
    };
    const checkPassword = (rule, value, callback) => {
        if (value === '') {
            callback(new Error('密码不能为空'));
        } else {
            callback();
        }
    };
    const rules = reactive({
        phoneNum: [{ validator: checkPhoneNum, trigger: 'change' }],
        email: [{ validator: checkEmail, trigger: 'change' }],
        password: [{ validator: checkPassword, trigger: 'change' }],
        passwordConfirm: [
            { validator: checkPassword, trigger: 'change' },
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
    });
    const resetRules = reactive({
        email: [{ validator: checkEmail, trigger: 'change' }]
    });
    const handleClose = () => {
        console.log('handleClose');
        showLogin.value = false;
    };
    // 手机号+密码登录
    const handleLogin = async () => {
        formRef.value.validate(async valid => {
            if (valid) {
                if (isAgree.value === false) {
                    ElMessage.warning('请同意用户协议和隐私政策');
                    return;
                }
                const { code, message, data } = await loginByPhone({
                    mobile: formData.value.phoneNum,
                    password: formData.value.password
                });
                console.log('return: ', code, message, data);
                if (code !== 0) {
                    ElMessage.error(message);
                    return;
                }
                showLogin.value = false;
                localStorage.setItem('userInfo', JSON.stringify(data.data || {}));
                setUser({ userId: data.data.userId });
                ElMessage.success('登录成功');
                emits('loginSuccess', data.data);
            } else {
                console.log('error submit!!');
                return false;
            }
        });
    };
    // 邮箱+密码登录
    const handleEmailLogin = async () => {
        formRef.value.validate(async valid => {
            if (valid) {
                const pwd = await sha256(formData.value.password);
                const md5Pwd = await md5(pwd);
                const { code, message, data } = await loginByEmail({
                    email: formData.value.email,
                    password: md5Pwd
                });
                if (code !== 0) {
                    ElMessage.error(message);
                    return;
                }
                showLogin.value = false;
                localStorage.setItem('userInfo', JSON.stringify(data.data || {}));
                setUser({ userId: data.data.userId });
                ElMessage.success('登录成功');
                emits('loginSuccess', data.data);
            } else {
                console.log('error submit!!');
                return false;
            }
        });
    };
    // 重置密码（邮箱登录）
    const sendResetLink = async () => {
        resetFormRef.value.validate(async valid => {
            if (valid) {
                const { code, message } = await sendResetEmail({ email: resetData.value.email });
                if (code !== 0) {
                    ElMessage.error(message);
                    return;
                }
                ElMessage.success('The password reset link has been sent, please check your email');
            } else {
                console.log('error submit!!');
                return false;
            }
        });
    };
    // 邮箱注册
    const handleEmailSignUp = async () => {
        formRef.value.validate(async valid => {
            if (valid) {
                const pwd = await sha256(formData.value.password);
                const md5Pwd = await md5(pwd);
                console.log('md5Pwd: ', md5Pwd);
                const { code, message, data } = await registerByEmail({
                    email: formData.value.email,
                    password: md5Pwd,
                    passwordConfirm: md5Pwd
                });
                if (code !== 0) {
                    ElMessage.error(message);
                    return;
                }
                showLogin.value = false;
                ElMessage.success('The account activation link has been sent, please check your email');
                localStorage.setItem('token', data.data.token);
                setTimeout(() => {
                    router.push({
                        path: '/active'
                    });
                }, 500);
            } else {
                console.log('error submit!!');
                return false;
            }
        });
    };
    // 删除用户-仅用于联调测试
    const deleteSingleUser = async () => {
        const { code, message } = await deleteUser();
        if (code !== 0) {
            ElMessage.error(message);
            return;
        }
        ElMessage.success('用户删除成功');
    };
    const handleChangeType = type => {
        pageType.value = type;
        formData.value.phoneNum = '';
        formData.value.email = '';
        formData.value.password = '';
        formData.value.passwordConfirm = '';
        resetData.value.email = '';
    };
    // 跳转到用户协议
    const goTo = path => {
        if (path === 'CommercialTerms') {
            window.open('/terms', '_blank');
        } else {
            window.open('/privacy', '_blank');
        }
    };
</script>

<style lang="less">
    .login-dialog {
        border-radius: 20px;
        padding: 0;
        .el-dialog__header {
            padding: 0;
        }
        .el-dialog__body {
            padding: 48px 32px;
            .login-title {
                color: #4f555a;
                // font-family: 'Alibaba PuHuiTi';
                font-size: 32px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
                padding: 0 18px 38px;
            }
            .login-box,
            .reset-box {
                padding: 0 18px;
                .el-form {
                    .el-form-item {
                        .el-form-item__content {
                            display: flex;
                            align-items: center;
                            border-radius: 12px;
                            background: #f6f6f6;
                            box-sizing: border-box;
                            border: 1px solid transparent;
                            padding: 9px 16px;
                            box-sizing: border-box;
                            &:focus-within {
                                border: 1px solid #4461f2;
                                background: #ffffff;
                            }
                            .el-input {
                                flex: 1;
                                border: 0;
                                width: 100%;
                                color: #1c1c23;
                                // font-family: PingFang SC;
                                font-size: 16px;
                                font-weight: 400;
                                line-height: 16px;
                                outline: none;
                                .el-input__wrapper {
                                    box-shadow: none;
                                    background: transparent;
                                    padding: 0;
                                }
                            }
                            .el-form-item__error {
                                padding-top: 4px;
                                color: #f54a45;
                                // font-family: 'PingFang SC';
                                font-size: 12px;
                                font-style: normal;
                                font-weight: 400;
                                line-height: normal;
                            }
                        }
                    }
                    .el-form-item + .el-form-item {
                        margin-top: 38px;
                    }
                    .el-form-item.is-error {
                        .el-form-item__content {
                            border: 1px solid #f54a45;
                            background: #ffffff;
                        }
                    }
                    .password-item {
                        .el-form-item__content {
                            position: relative;
                            .forget-btn {
                                position: absolute;
                                top: 100%;
                                right: 0;
                                margin-top: 4px;
                                color: #647fff;
                                // font-family: 'Alibaba PuHuiTi';
                                font-size: 14px;
                                font-style: normal;
                                font-weight: 400;
                                line-height: 1;
                                cursor: pointer;
                            }
                        }
                    }
                }
            }
            .login-btn,
            .reset-btn {
                margin-top: 48px;
                padding: 0 18px;
                .el-button.el-button--primary {
                    width: 100%;
                    height: 56px;
                    border-radius: 16px;
                    background: #647fff;
                    color: #fff;
                    // font-family: PingFang SC;
                    font-size: 16px;
                    font-weight: 500;
                    line-height: normal;
                    box-shadow: none;
                    border: none;
                }
            }
            .login-footer {
                display: flex;
                align-items: center;
                margin-top: 12px;
                padding: 0 16px;
                .footer-checkbox {
                    .el-checkbox {
                        margin-left: 0;
                        margin-right: 4px;
                        .el-checkbox__inner {
                            width: 16px;
                            height: 16px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            &::after {
                                width: 5px;
                                height: 8px;
                                border-bottom-right-radius: 2px;
                            }
                        }
                        .is-checked {
                            .el-checkbox__inner {
                                background: #0058ff;
                                border-color: #0058ff;
                            }
                        }
                    }
                }
                .footer-text {
                    color: #999;
                    // font-family: 'PingFang SC';
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                }
                .footer-link {
                    color: #647fff;
                    // font-family: 'PingFang SC';
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                    text-decoration: underline;
                    cursor: pointer;
                    margin: 0 4px;
                }
            }
            .sign-up,
            .log-in {
                text-align: center;
                // font-family: 'Alibaba PuHuiTi';
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: normal;
                margin-top: 12px;
                &-text {
                    color: #4f555a;
                }
                &-btn {
                    color: #647fff;
                    cursor: pointer;
                }
            }
            .login-footer.en-footer {
                flex-wrap: wrap;
                padding: 0;
                margin-top: 48px;
            }
        }
    }
    .email-icon,
    .lock-icon {
        width: 20px;
        height: 20px;
        margin-right: 16px;
    }
</style>
