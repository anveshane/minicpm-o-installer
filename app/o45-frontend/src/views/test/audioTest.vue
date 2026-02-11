<template>
    <div class="audio-test-page" :class="{ fullscreen: isFullscreen }">
        <!-- 标题 -->
        <div class="page-title" v-show="!isFullscreen">
            <SvgIcon name="minicpm-o4" class="title-icon" />
            <h1>聊天数据搜索工具</h1>
        </div>

        <!-- 搜索区域 -->
        <div class="search-section" v-show="!isFullscreen">
            <div class="search-box">
                <el-select
                    v-model="sessionId"
                    placeholder="选择或输入 Session ID"
                    size="large"
                    filterable
                    allow-create
                    clearable
                    :disabled="loading"
                    @change="handleSelectSession"
                    class="session-select"
                    popper-class="session-select-dropdown"
                >
                    <el-option
                        v-for="item in filteredSessionList"
                        :key="item.session_id"
                        :label="item.session_id"
                        :value="item.session_id"
                    >
                        <div class="option-content">
                            <span class="option-id">{{ item.session_id }}</span>
                            <span class="option-time">{{ item.createTime }}</span>
                        </div>
                    </el-option>
                </el-select>
                <el-button type="primary" size="large" :loading="loading" @click="handleSearch" :disabled="!sessionId">
                    {{ loading ? '加载中...' : '搜索数据' }}
                </el-button>
            </div>
            <div class="search-tip" v-if="!audioList.length && !loading">
                <el-icon><InfoFilled /></el-icon>
                <span>输入 Session ID 后点击搜索按钮获取数据列表</span>
            </div>
        </div>

        <!-- 数据列表 -->
        <div class="audio-list-section" v-if="audioList.length">
            <div class="list-header">
                <h2>数据列表</h2>
                <!-- 分页 -->
                <div class="pagination-wrapper" v-if="total > 0">
                    <el-pagination
                        v-model:current-page="currentPage"
                        v-model:page-size="pageSize"
                        :page-sizes="[20, 50, 100]"
                        :total="total"
                        layout="total, sizes, prev, pager, next"
                        small
                        background
                        @current-change="handlePageChange"
                        @size-change="handleSizeChange"
                    />
                </div>
                <el-button
                    size="small"
                    :icon="Download"
                    @click="downloadAllDataAsJson"
                    title="下载完整数据"
                    type="success"
                    plain
                    circle
                    :loading="downloadingJson"
                ></el-button>
                <el-button
                    size="small"
                    :icon="isFullscreen ? Close : FullScreen"
                    @click="toggleFullscreen"
                    :title="isFullscreen ? '退出全屏' : '全屏显示'"
                    type="primary"
                    plain
                    circle
                ></el-button>
            </div>

            <div class="audio-cards">
                <div
                    class="audio-card"
                    v-for="(item, index) in audioList"
                    :key="item.id"
                    :class="{ playing: currentPlayingIndex === index }"
                >
                    <div class="card-header">
                        <div class="card-index">{{ (currentPage - 1) * pageSize + index + 1 }}</div>
                        <div class="card-label">ID: {{ item.id }}</div>
                        <div class="card-label">第 {{ item.round }} 轮</div>
                        <el-icon
                            class="download-icon"
                            @click="downloadAudio(item, index)"
                            v-if="item.audioUrl"
                            title="下载音频"
                        >
                            <Download />
                        </el-icon>
                        <el-tag size="small" type="info">{{ item.recordType }}</el-tag>
                    </div>
                    <div class="card-body">
                        <!-- 文本内容 -->
                        <div class="text-content" v-if="item.text">
                            <div class="text-label">文本内容:</div>
                            <div class="text-value">{{ item.text }}</div>
                        </div>
                        <div class="empty-tip" v-else>
                            <span>暂无文本</span>
                        </div>

                        <!-- 图片展示 -->
                        <div class="image-preview" v-if="item.imageUrl">
                            <img :src="item.imageUrl" alt="记录图片" @load="handleImageLoad($event, index)" />
                            <div
                                class="image-size-badge"
                                v-if="item.imageWidth > 0 && item.imageHeight > 0"
                                :class="{
                                    'size-small': isImageSizeSmall(item),
                                    'size-valid': !isImageSizeSmall(item)
                                }"
                                :title="getImageSizeHint(item)"
                            >
                                {{ item.imageWidth }} × {{ item.imageHeight }}
                                <span class="size-hint">{{ getImageSizeHint(item) }}</span>
                            </div>
                        </div>
                        <div class="empty-tip" v-else>
                            <span>暂无图片</span>
                        </div>

                        <!-- 音频播放器 -->
                        <div class="audio-player-wrapper" v-if="item.audioUrl">
                            <audio
                                :ref="el => setAudioRef(el, index)"
                                :src="item.audioUrl"
                                @play="handlePlay(index)"
                                @pause="handlePause(index)"
                                @ended="handleEnded(index)"
                                @timeupdate="handleTimeUpdate"
                                @loadedmetadata="handleLoadedMetadata($event, index)"
                                controls
                                preload="metadata"
                            ></audio>
                        </div>
                        <div class="empty-tip" v-else>
                            <span>暂无音频</span>
                        </div>

                        <div class="audio-info">
                            <div class="info-item" v-if="item.createdAt">
                                <span class="info-label">创建时间:</span>
                                <span class="info-value">{{ formatTime(item.createdAt) }}</span>
                            </div>
                            <div class="info-item" v-if="item.audioUrl">
                                <span class="info-label">时长:</span>
                                <span class="info-value">{{ formatDuration(item.duration) }}</span>
                            </div>
                            <div class="info-item" v-if="item.audioUrl">
                                <span class="info-label">大小:</span>
                                <span class="info-value">{{ formatSize(item.size) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 空状态 -->
        <div class="empty-state" v-if="searched && !audioList.length && !loading">
            <el-empty description="未找到音频数据">
                <el-button type="primary" @click="handleReset">重新搜索</el-button>
            </el-empty>
        </div>
    </div>
</template>

<script setup>
    import { ref, onMounted, computed } from 'vue';
    import { ElMessage } from 'element-plus';
    import { InfoFilled, Download, FullScreen, Close } from '@element-plus/icons-vue';
    import SvgIcon from '@/components/SvgIcon/index.vue';
    import { getSessionAudios } from '@/apis';
    import { getSessionIdList, saveSessionId } from '@/utils/sessionStorage';

    const sessionId = ref('');
    const loading = ref(false);
    const searched = ref(false);
    const audioList = ref([]);
    const currentPlayingIndex = ref(-1);
    const audioRefs = ref([]);
    const isFullscreen = ref(false);
    const sessionIdList = ref([]);
    const currentPage = ref(1);
    const pageSize = ref(20);
    const total = ref(0);
    const downloadingJson = ref(false);

    // 过滤后的session列表（支持模糊匹配）
    const filteredSessionList = computed(() => {
        if (!sessionId.value) {
            return sessionIdList.value;
        }
        return sessionIdList.value.filter(item =>
            item.session_id.toLowerCase().includes(sessionId.value.toLowerCase())
        );
    });

    // 加载session列表
    const loadSessionList = () => {
        sessionIdList.value = getSessionIdList();
    };

    // 选择session
    const handleSelectSession = value => {
        sessionId.value = value;
    };

    onMounted(() => {
        loadSessionList();
    });

    // 设置音频元素引用
    const setAudioRef = (el, index) => {
        if (el) {
            audioRefs.value[index] = el;
        }
    };

    // 搜索音频
    const handleSearch = async (resetPage = true) => {
        if (!sessionId.value.trim()) {
            ElMessage.warning('请输入 Session ID');
            return;
        }

        if (resetPage) {
            currentPage.value = 1;
        }

        loading.value = true;
        searched.value = true;

        try {
            const response = await getSessionAudios({
                session_id: sessionId.value,
                page: currentPage.value,
                size: pageSize.value
            });

            if (response.code === 0 && response.data) {
                const data = response.data;

                // 保存总数
                total.value = data.total_records || 0;
                console.log('📊 后端返回数据:', {
                    total_records: data.total_records,
                    records_length: data.records?.length,
                    current_page: currentPage.value,
                    page_size: pageSize.value
                });

                // 处理所有记录，不过滤
                audioList.value = (data.records || []).map(record => {
                    let audioUrl = null;
                    let size = 0;

                    // 如果有voice，转换为blob URL
                    if (record.voice) {
                        const audioBlob = base64ToBlob(record.voice, 'audio/wav');
                        audioUrl = URL.createObjectURL(audioBlob);
                        size = audioBlob.size;
                    }

                    // 如果有图片，也转换为blob URL
                    let imageUrl = null;
                    if (record.image) {
                        const imageBlob = base64ToBlob(record.image, 'image/png');
                        imageUrl = URL.createObjectURL(imageBlob);
                    }

                    return {
                        id: record.id,
                        recordType: record.record_type,
                        text: record.text || '',
                        audio: record.voice,
                        audioUrl: audioUrl,
                        image: record.image,
                        imageUrl: imageUrl,
                        imageWidth: 0,
                        imageHeight: 0,
                        createdAt: record.created_at,
                        duration: 0,
                        size: size,
                        round: record.round
                    };
                });

                if (audioList.value.length === 0) {
                    ElMessage.info('该 Session 没有数据');
                } else {
                    ElMessage.success(`成功加载数据，共 ${total.value} 条记录`);
                    // 搜索成功后保存session_id
                    if (resetPage) {
                        saveSessionId(sessionId.value);
                        // 重新加载列表
                        loadSessionList();
                    }
                }
            } else {
                ElMessage.error(response.message || '获取数据失败');
                audioList.value = [];
            }
        } catch (error) {
            ElMessage.error('获取音频失败，请检查网络连接');
            audioList.value = [];
        } finally {
            loading.value = false;
        }
    };

    // Base64转Blob
    const base64ToBlob = (base64, mimeType) => {
        // 移除可能存在的base64前缀
        const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    };

    // 音频播放事件
    const handlePlay = index => {
        // 暂停其他正在播放的音频
        audioRefs.value.forEach((audio, i) => {
            if (i !== index && audio && !audio.paused) {
                audio.pause();
            }
        });
        currentPlayingIndex.value = index;
    };

    const handlePause = index => {
        if (currentPlayingIndex.value === index) {
            currentPlayingIndex.value = -1;
        }
    };

    const handleEnded = index => {
        if (currentPlayingIndex.value === index) {
            currentPlayingIndex.value = -1;
        }
    };

    const handleTimeUpdate = () => {
        // 可以在这里添加进度更新逻辑
    };

    const handleLoadedMetadata = (event, index) => {
        audioList.value[index].duration = event.target.duration;
    };

    // 图片加载完成，获取原始尺寸
    const handleImageLoad = (event, index) => {
        const img = event.target;
        audioList.value[index].imageWidth = img.naturalWidth;
        audioList.value[index].imageHeight = img.naturalHeight;
    };

    // 判断图片尺寸是否符合算法要求（横屏720x360，竖屏360x720）
    const isImageSizeSmall = item => {
        if (item.imageWidth <= 0 || item.imageHeight <= 0) return false;

        const isLandscape = item.imageWidth > item.imageHeight;

        if (isLandscape) {
            // 横屏：要求 >= 720x360
            return item.imageWidth < 720 || item.imageHeight < 360;
        } else {
            // 竖屏：要求 >= 360x720
            return item.imageWidth < 360 || item.imageHeight < 720;
        }
    };

    // 获取图片尺寸要求提示
    const getImageSizeHint = item => {
        if (item.imageWidth <= 0 || item.imageHeight <= 0) return '';

        const isLandscape = item.imageWidth > item.imageHeight;
        const required = isLandscape ? '720×360' : '360×720';
        const orientation = isLandscape ? '横屏' : '竖屏';

        return `${orientation}·要求≥${required}`;
    };

    // 下载音频
    const downloadAudio = (item, index) => {
        try {
            const link = document.createElement('a');
            link.href = item.audioUrl;
            link.download = `${item.label || `audio_${index + 1}`}.wav`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            ElMessage.success('下载成功');
        } catch (error) {
            ElMessage.error('下载失败');
        }
    };

    // 格式化时长
    const formatDuration = duration => {
        if (!duration || isNaN(duration)) return '00:00';
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // 格式化文件大小
    const formatSize = bytes => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    // 格式化时间
    const formatTime = timeStr => {
        if (!timeStr) return '';
        const date = new Date(timeStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
    };

    // 重置
    const handleReset = () => {
        sessionId.value = '';
        audioList.value = [];
        searched.value = false;
        currentPlayingIndex.value = -1;
        currentPage.value = 1;
        pageSize.value = 20;
        total.value = 0;
    };

    // 切换全屏
    const toggleFullscreen = () => {
        isFullscreen.value = !isFullscreen.value;
    };

    // 页码改变
    const handlePageChange = page => {
        currentPage.value = page;
        handleSearch(false);
        // 滚动到顶部
        const audioCardsElement = document.querySelector('.audio-cards');
        if (audioCardsElement) {
            audioCardsElement.scrollTop = 0;
        }
    };

    // 每页数量改变
    const handleSizeChange = size => {
        pageSize.value = size;
        currentPage.value = 1;
        handleSearch(false);
    };

    // 下载完整数据为JSON
    const downloadAllDataAsJson = async () => {
        if (!sessionId.value.trim()) {
            ElMessage.warning('请先搜索数据');
            return;
        }

        downloadingJson.value = true;
        let loadingMessage = null;

        try {
            // 第一次请求获取总数
            const firstResponse = await getSessionAudios({
                session_id: sessionId.value,
                page: 1,
                size: 20
            });

            if (firstResponse.code !== 0 || !firstResponse.data) {
                ElMessage.error(firstResponse.message || '获取数据失败');
                return;
            }

            const totalRecords = firstResponse.data.total_records || 0;
            if (totalRecords === 0) {
                ElMessage.warning('没有数据可下载');
                return;
            }

            loadingMessage = ElMessage({
                message: `正在下载数据 (0/${totalRecords})...`,
                type: 'info',
                duration: 0
            });

            // 收集所有记录
            const allRecords = [...firstResponse.data.records];
            const pageSize = 20;
            const totalPages = Math.ceil(totalRecords / pageSize);

            // 从第2页开始请求剩余数据
            for (let page = 2; page <= totalPages; page++) {
                const response = await getSessionAudios({
                    session_id: sessionId.value,
                    page: page,
                    size: pageSize
                });

                if (response.code === 0 && response.data?.records) {
                    allRecords.push(...response.data.records);

                    // 更新进度提示
                    loadingMessage.close();
                    loadingMessage = ElMessage({
                        message: `正在下载数据 (${allRecords.length}/${totalRecords})...`,
                        type: 'info',
                        duration: 0
                    });
                }

                // 添加小延迟避免请求过快
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // 构建完整的数据结构
            const completeData = {
                session_id: sessionId.value,
                total_records: totalRecords,
                download_time: new Date().toISOString(),
                records: allRecords
            };

            // 将数据转换为JSON字符串
            const jsonStr = JSON.stringify(completeData, null, 2);

            // 创建Blob对象
            const blob = new Blob([jsonStr], { type: 'application/json' });

            // 创建下载链接
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);

            // 设置文件名（包含session_id和时间戳）
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            link.download = `session_${sessionId.value}_${timestamp}.json`;

            // 触发下载
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // 释放URL对象
            URL.revokeObjectURL(link.href);

            loadingMessage.close();
            ElMessage.success(`成功下载 ${allRecords.length} 条记录`);
        } catch (error) {
            console.error('下载JSON失败:', error);
            ElMessage.error('下载数据失败，请检查网络连接');
        } finally {
            if (loadingMessage) {
                loadingMessage.close();
            }
            downloadingJson.value = false;
        }
    };
</script>

<style lang="less" scoped>
    .audio-test-page {
        min-height: 100vh;
        background: #ffffff;
        padding: 24px;

        &.fullscreen {
            padding: 16px;

            .audio-list-section {
                .audio-cards {
                    max-height: calc(100vh - 100px);
                    padding-bottom: 80px;
                }
            }
        }

        // 标题
        .page-title {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 16px;

            .title-icon {
                width: 24px;
                height: 24px;
                color: #667eea;
            }

            h1 {
                font-size: 20px;
                font-weight: 600;
                color: #303133;
                margin: 0;
            }
        }

        // 搜索区域
        .search-section {
            background: #f5f7fa;
            border-radius: 8px;
            padding: 16px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            margin-bottom: 16px;
            max-width: 800px;
            margin-left: auto;
            margin-right: auto;

            .search-box {
                display: flex;
                align-items: stretch;
                gap: 12px;
                margin-bottom: 12px;

                .session-select {
                    flex: 1;
                }

                :deep(.el-input) {
                    .el-input__wrapper {
                        border-radius: 8px;
                        transition: all 0.3s ease;
                    }
                }

                :deep(.el-select) {
                    .el-input {
                        height: 40px;

                        .el-input__wrapper {
                            height: 40px;
                        }
                    }
                }

                .el-button {
                    min-width: 100px;
                    height: 40px;
                    border-radius: 8px;
                    font-weight: 500;
                }
            }

            .search-tip {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #909399;
                font-size: 13px;

                .el-icon {
                    font-size: 14px;
                }
            }
        }

        // 音频列表
        .audio-list-section {
            .list-header {
                display: flex;
                align-items: center;
                gap: 16px;
                margin-bottom: 16px;

                h2 {
                    font-size: 16px;
                    font-weight: 600;
                    color: #303133;
                    margin: 0;
                    flex-shrink: 0;
                }

                .pagination-wrapper {
                    flex: 1;
                    display: flex;
                    justify-content: center;
                    overflow-x: auto;

                    &::-webkit-scrollbar {
                        height: 4px;
                    }

                    &::-webkit-scrollbar-thumb {
                        background: #dcdfe6;
                        border-radius: 2px;
                    }

                    :deep(.el-pagination) {
                        .el-pagination__total {
                            font-size: 13px;
                        }
                    }
                }

                :deep(.el-button) {
                    flex-shrink: 0;
                    width: 32px;
                    height: 32px;
                    padding: 0;

                    &.is-circle {
                        border-radius: 50%;
                    }
                }
            }

            .audio-cards {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
                gap: 12px;
                max-height: calc(100vh - 220px);
                overflow-y: auto;
                padding-right: 8px;
                padding-bottom: 80px;

                // 滚动条样式
                &::-webkit-scrollbar {
                    width: 6px;
                }

                &::-webkit-scrollbar-track {
                    background: #f5f7fa;
                    border-radius: 3px;
                }

                &::-webkit-scrollbar-thumb {
                    background: #dcdfe6;
                    border-radius: 3px;

                    &:hover {
                        background: #c0c4cc;
                    }
                }

                .audio-card {
                    background: #ffffff;
                    border-radius: 8px;
                    padding: 12px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
                    border: 1px solid #e4e7ed;
                    transition: all 0.3s ease;

                    &:hover {
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        border-color: #667eea;
                    }

                    &.playing {
                        border: 2px solid #667eea;
                        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
                    }

                    .card-header {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        margin-bottom: 8px;
                        flex-wrap: wrap;

                        .card-index {
                            width: 28px;
                            height: 28px;
                            border-radius: 6px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: #ffffff;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: 600;
                            font-size: 13px;
                            flex-shrink: 0;
                        }

                        .card-label {
                            flex: 1;
                            font-size: 14px;
                            font-weight: 600;
                            color: #303133;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                            min-width: 0;
                        }

                        .download-icon {
                            flex-shrink: 0;
                            font-size: 18px;
                            color: #667eea;
                            cursor: pointer;
                            transition: all 0.3s ease;

                            &:hover {
                                color: #409eff;
                                transform: scale(1.1);
                            }

                            &:active {
                                transform: scale(0.95);
                            }
                        }

                        .el-tag {
                            flex-shrink: 0;
                        }
                    }

                    .card-body {
                        .text-content {
                            margin-bottom: 8px;
                            padding: 8px;
                            background: #f5f7fa;
                            border-radius: 6px;

                            .text-label {
                                font-size: 12px;
                                color: #909399;
                                margin-bottom: 4px;
                            }

                            .text-value {
                                font-size: 13px;
                                color: #303133;
                                line-height: 1.5;
                                word-break: break-word;
                            }
                        }

                        .image-preview {
                            margin-bottom: 8px;
                            border-radius: 6px;
                            overflow: hidden;
                            background: #f5f7fa;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 120px;
                            position: relative;

                            img {
                                max-width: 100%;
                                max-height: 120px;
                                height: auto;
                                width: auto;
                                display: block;
                                object-fit: contain;
                            }

                            .image-size-badge {
                                position: absolute;
                                top: 6px;
                                right: 6px;
                                background: rgba(0, 0, 0, 0.7);
                                color: #ffffff;
                                padding: 4px 10px;
                                border-radius: 4px;
                                font-size: 11px;
                                font-weight: 500;
                                font-family: 'Courier New', monospace;
                                backdrop-filter: blur(4px);
                                transition: all 0.3s ease;
                                display: flex;
                                flex-direction: column;
                                align-items: flex-end;
                                gap: 2px;
                                max-width: 140px;

                                .size-hint {
                                    font-size: 9px;
                                    opacity: 0.9;
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                                    white-space: nowrap;
                                }

                                &.size-valid {
                                    background: rgba(52, 199, 89, 0.9);
                                    color: #ffffff;
                                    font-weight: 600;
                                    box-shadow: 0 2px 8px rgba(52, 199, 89, 0.3);
                                }

                                &.size-small {
                                    background: rgba(255, 59, 48, 0.9);
                                    color: #ffffff;
                                    font-weight: 600;
                                    box-shadow: 0 2px 8px rgba(255, 59, 48, 0.3);
                                }
                            }
                        }

                        .empty-tip {
                            margin-bottom: 8px;
                            padding: 12px;
                            background: #f5f7fa;
                            border-radius: 6px;
                            text-align: center;
                            color: #909399;
                            font-size: 12px;
                        }

                        .audio-player-wrapper {
                            margin-bottom: 8px;

                            audio {
                                width: 100%;
                                height: 32px;
                                border-radius: 6px;
                                outline: none;
                            }
                        }

                        .audio-info {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 12px;
                            padding: 8px;
                            background: #f5f7fa;
                            border-radius: 6px;

                            .info-item {
                                display: flex;
                                align-items: center;
                                gap: 4px;
                                font-size: 12px;

                                .info-label {
                                    color: #909399;
                                    flex-shrink: 0;
                                }

                                .info-value {
                                    color: #303133;
                                    font-weight: 500;
                                }
                            }
                        }
                    }
                }
            }
        }

        // 空状态
        .empty-state {
            background: #f5f7fa;
            border-radius: 12px;
            padding: 48px 24px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            text-align: center;

            :deep(.el-empty) {
                .el-empty__description {
                    font-size: 14px;
                    color: #909399;
                }
            }

            .el-button {
                border-radius: 8px;
                min-width: 100px;
            }
        }
    }

    // 平板响应式
    @media (max-width: 1024px) {
        .audio-test-page {
            &.fullscreen {
                .audio-list-section {
                    .audio-cards {
                        max-height: calc(100vh - 100px);
                        padding-bottom: 100px;
                    }
                }
            }

            .audio-list-section {
                .list-header {
                    gap: 12px;

                    h2 {
                        font-size: 15px;
                    }

                    .pagination-wrapper {
                        :deep(.el-pagination) {
                            .el-pagination__total {
                                font-size: 12px;
                            }
                        }
                    }
                }

                .audio-cards {
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    max-height: calc(100vh - 240px);
                    padding-bottom: 150px;
                }
            }
        }
    }

    // 响应式
    @media (max-width: 768px) {
        .audio-test-page {
            padding: 12px;

            &.fullscreen {
                padding: 12px;

                .audio-list-section {
                    .audio-cards {
                        max-height: calc(100vh - 100px);
                        padding-bottom: 80px;
                    }
                }
            }

            .page-title {
                margin-bottom: 10px;
                gap: 6px;

                h1 {
                    font-size: 18px;
                }

                .title-icon {
                    width: 20px;
                    height: 20px;
                }
            }

            .search-section {
                padding: 16px;
                margin-bottom: 16px;

                .search-box {
                    flex-direction: column;
                    gap: 8px;

                    :deep(.el-select) {
                        .el-input {
                            height: 38px;

                            .el-input__wrapper {
                                height: 38px;
                            }
                        }
                    }

                    .el-button {
                        width: 100%;
                        height: 38px;
                    }
                }
            }

            .audio-list-section {
                .list-header {
                    margin-bottom: 12px;
                    gap: 8px;

                    h2 {
                        font-size: 14px;
                    }

                    .pagination-wrapper {
                        min-width: 0;

                        :deep(.el-pagination) {
                            .el-pagination__total {
                                font-size: 11px;
                            }

                            .el-pagination__sizes {
                                .el-select {
                                    width: 70px;
                                }
                            }

                            .el-pager {
                                li {
                                    min-width: 24px;
                                    font-size: 11px;
                                }
                            }
                        }
                    }

                    :deep(.el-button) {
                        width: 28px;
                        height: 28px;
                    }
                }

                .audio-cards {
                    grid-template-columns: 1fr;
                    max-height: calc(100vh - 200px);
                    gap: 10px;
                    padding-bottom: 80px;
                }

                .audio-card {
                    padding: 10px;

                    .card-header {
                        gap: 6px;
                        margin-bottom: 6px;

                        .card-index {
                            width: 24px;
                            height: 24px;
                            font-size: 12px;
                        }

                        .card-label {
                            font-size: 13px;
                        }
                    }

                    .card-body {
                        .text-content {
                            padding: 8px;
                            margin-bottom: 6px;

                            .text-label {
                                font-size: 11px;
                            }

                            .text-value {
                                font-size: 12px;
                            }
                        }

                        .image-preview {
                            height: 100px;
                            margin-bottom: 6px;

                            img {
                                max-height: 100px;
                            }

                            .image-size-badge {
                                top: 4px;
                                right: 4px;
                                padding: 3px 8px;
                                font-size: 10px;
                                max-width: 130px;

                                .size-hint {
                                    font-size: 8px;
                                }
                            }
                        }

                        .empty-tip {
                            padding: 10px;
                            font-size: 11px;
                            margin-bottom: 6px;
                        }

                        .audio-player-wrapper {
                            margin-bottom: 6px;

                            audio {
                                height: 30px;
                            }
                        }

                        .audio-info {
                            gap: 10px;
                            padding: 6px;

                            .info-item {
                                font-size: 11px;
                            }
                        }
                    }
                }
            }

            .empty-state {
                padding: 32px 16px;
            }
        }
    }
</style>

<style lang="less">
    // 下拉框选项全局样式
    .session-select-dropdown {
        .el-select-dropdown__item {
            height: auto !important;
            padding: 10px 12px !important;
            line-height: 1.5 !important;
        }

        .option-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
            width: 100%;

            .option-id {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 14px;
                color: #303133;
            }

            .option-time {
                flex-shrink: 0;
                font-size: 12px;
                color: #909399;
                // font-family: 'Courier New', monospace;
                white-space: nowrap;
            }
        }
    }
</style>
