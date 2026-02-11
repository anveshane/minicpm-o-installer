<template>
    <div>
        <div>测试直接播放文件</div>
        <el-upload
            ref="uploadRef"
            class="upload-demo"
            action="#"
            :before-upload="handleBeforeUpload"
            :on-change="handleChange"
            multiple
        >
            <template #trigger>
                <el-button type="primary">select file</el-button>
            </template>

            <el-button class="ml-3" type="success" @click="submitUpload"> upload to server </el-button>

            <template #tip>
                <div class="el-upload__tip">jpg/png files with a size less than 500kb</div>
            </template>
        </el-upload>
        <el-button @click="playAudio">播放</el-button>
    </div>
</template>
<script setup>
    import useAudioStream from '@/audio-core/useAudioStream';
    let streamPlayer = null;

    const uploadRef = ref();
    const base64Data = ref([]);

    const submitUpload = () => {
        console.log('uploadRef.value: ', uploadRef.value.raw);
    };
    const handleBeforeUpload = file => {
        return false;
    };

    const handleChange = async (_, fileList) => {
        base64Data.value = []; // 清空之前的 base64 数据
        const files = fileList.map(f => f.raw); // 保留顺序
        const promises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
        });

        Promise.all(promises)
            .then(results => {
                base64Data.value = results;
                console.log('base64Data.value: ', base64Data.value);
            })
            .catch(err => {
                console.error('读取文件失败:', err);
            });
    };

    // 音频播放相关
    onMounted(async () => {
        streamPlayer = new useAudioStream();
        await streamPlayer.init({
            onStart: () => {
                console.log('播放开始');
            },
            onEnd: () => {
                console.log('✅ 播放结束');
            },
            onStop: param => {
                console.log('✅ 播放停止', param);
            }
        });
    });

    const playAudio = async () => {
        for (let i = 0; i < base64Data.value.length; i++) {
            const file = base64Data.value[i];
            setTimeout(async () => {
                await streamPlayer.push(file.split(',')[1]);
            }, i * 500); // 每个音频间隔1秒
        }
    };
</script>
