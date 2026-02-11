<template>
    <div class="inference-services-page">
        <div class="dashboard-container">
            <!-- 极简顶部导航 -->
            <header class="dashboard-header">
                <div class="header-left">
                    <h1 class="title">推理服务看板</h1>
                    <div class="status-indicator">
                        <span class="pulse-dot"></span>
                        <span class="status-text">实时监控中</span>
                    </div>
                </div>

                <div class="header-right">
                    <div class="control-group">
                        <span class="label">当前区域</span>
                        <el-select
                            v-model="selectedRegion"
                            @change="handleRegionChange"
                            class="modern-select"
                            :disabled="loading"
                            :suffix-icon="ArrowDown"
                        >
                            <el-option
                                v-for="region in REGIONS"
                                :key="region.value"
                                :label="region.label"
                                :value="region.value"
                            />
                        </el-select>
                    </div>
                    <el-divider direction="vertical" />
                    <el-button type="primary" :loading="loading" @click="fetchServices" class="sync-btn">
                        <el-icon v-if="!loading" style="margin-right: 6px"><Refresh /></el-icon>
                        同步数据
                    </el-button>
                </div>
            </header>

            <main class="dashboard-content">
                <!-- 统计卡片 -->
                <section class="stats-grid" v-if="!loading || services.length > 0">
                    <div
                        class="stat-card total"
                        :class="{ active: statusFilter === 'all' }"
                        @click="toggleFilter('all')"
                    >
                        <div class="stat-icon">
                            <el-icon><DataAnalysis /></el-icon>
                        </div>
                        <div class="stat-main">
                            <div class="stat-label">服务总数</div>
                            <div class="stat-value">{{ services.length }}</div>
                        </div>
                    </div>
                    <div
                        class="stat-card available"
                        :class="{ active: statusFilter === 'available' }"
                        @click="toggleFilter('available')"
                    >
                        <div class="stat-icon">
                            <el-icon><CircleCheck /></el-icon>
                        </div>
                        <div class="stat-main">
                            <div class="stat-label">空闲可用</div>
                            <div class="stat-value">{{ availableCount }}</div>
                        </div>
                    </div>
                    <div
                        class="stat-card busy"
                        :class="{ active: statusFilter === 'busy' }"
                        @click="toggleFilter('busy')"
                    >
                        <div class="stat-icon">
                            <el-icon><VideoPause /></el-icon>
                        </div>
                        <div class="stat-main">
                            <div class="stat-label">忙碌占用</div>
                            <div class="stat-value">{{ busyCount }}</div>
                        </div>
                    </div>
                    <div
                        class="stat-card offline"
                        :class="{ active: statusFilter === 'offline' }"
                        @click="toggleFilter('offline')"
                    >
                        <div class="stat-icon">
                            <el-icon><Warning /></el-icon>
                        </div>
                        <div class="stat-main">
                            <div class="stat-label">异常掉线</div>
                            <div class="stat-value">{{ offlineCount }}</div>
                        </div>
                    </div>
                </section>

                <!-- 数据表格看板 -->
                <section class="data-section">
                    <div class="section-header">
                        <h2 class="section-title">活跃实例列表</h2>
                        <div class="section-meta">
                            <span v-if="statusFilter === 'all'">共计 {{ services.length }} 个节点实例</span>
                            <span v-else
                                >筛选出 {{ filteredServices.length }} 个{{ getStatusText(statusFilter) }}节点 (共
                                {{ services.length }} 个)</span
                            >
                        </div>
                    </div>

                    <div class="table-container">
                        <div v-if="loading && services.length === 0" class="skeleton-loader">
                            <el-skeleton :rows="8" animated />
                        </div>

                        <el-alert v-else-if="error" :title="error" type="error" :closable="false" show-icon />

                        <el-table
                            v-else
                            :data="filteredServices"
                            height="100%"
                            class="modern-table"
                            highlight-current-row
                        >
                            <el-table-column type="index" label="#" width="60" align="center" />
                            <el-table-column prop="service_id" label="节点地址" min-width="200">
                                <template #default="{ row }">
                                    <span class="mono-text">{{ row.service_id || '-' }}</span>
                                </template>
                            </el-table-column>
                            <el-table-column prop="service_name" label="实例名称" min-width="150" />
                            <el-table-column prop="model_type" label="模式" width="100" align="center">
                                <template #default="{ row }">
                                    <span class="type-text">{{ row.model_type === 'duplex' ? '双工' : '单工' }}</span>
                                </template>
                            </el-table-column>
                            <el-table-column prop="status" label="当前状态" width="120" align="center">
                                <template #default="{ row }">
                                    <div :class="['status-chip', row.status]">
                                        <span class="chip-dot"></span>
                                        <span class="chip-text">{{ getStatusText(row.status) }}</span>
                                    </div>
                                </template>
                            </el-table-column>

                            <el-table-column label="协议" width="120" align="center">
                                <template #default="{ row }">
                                    <el-tag
                                        v-if="row.session_type === 'audio'"
                                        type="success"
                                        size="small"
                                        effect="light"
                                        >语音</el-tag
                                    >
                                    <el-tag
                                        v-else-if="row.session_type === 'omni' || row.session_type === 'release'"
                                        type="primary"
                                        size="small"
                                        effect="light"
                                        >视频</el-tag
                                    >
                                    <span v-else class="secondary-text">{{ row.session_type || '-' }}</span>
                                </template>
                            </el-table-column>

                            <el-table-column prop="heartbeat_time" label="心跳上报时间" width="220" align="right">
                                <template #default="{ row }">
                                    <span class="time-text">{{ formatHeartbeatTime(row.heartbeat_time) }}</span>
                                </template>
                            </el-table-column>

                            <el-table-column label="操作" width="80" align="center" fixed="right">
                                <template #default="{ row }">
                                    <el-button link type="primary" @click="handleViewDetail(row)">详情</el-button>
                                </template>
                            </el-table-column>
                        </el-table>
                    </div>
                </section>
            </main>
        </div>

        <el-dialog
            v-model="dialogVisible"
            title="实例详细参数"
            width="550px"
            class="modern-dialog"
            :lock-scroll="false"
        >
            <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="节点地址"
                    ><span class="mono-text">{{ currentService?.service_id }}</span></el-descriptions-item
                >
                <el-descriptions-item label="实例名称">{{ currentService?.service_name }}</el-descriptions-item>
                <el-descriptions-item label="模式">{{
                    currentService?.model_type === 'duplex' ? '双工' : '单工'
                }}</el-descriptions-item>
                <el-descriptions-item label="协议">
                    <el-tag v-if="currentService?.session_type === 'audio'" type="success" size="small">语音</el-tag>
                    <el-tag
                        v-else-if="
                            currentService?.session_type === 'omni' || currentService?.session_type === 'release'
                        "
                        type="primary"
                        size="small"
                        >视频</el-tag
                    >
                    <span v-else>{{ currentService?.session_type || '-' }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="实时状态">
                    <div :class="['status-chip', currentService?.status]">
                        <span class="chip-dot"></span>
                        <span class="chip-text">{{ getStatusText(currentService?.status) }}</span>
                    </div>
                </el-descriptions-item>
                <el-descriptions-item label="最后活跃">{{
                    formatHeartbeatTime(currentService?.heartbeat_time)
                }}</el-descriptions-item>
            </el-descriptions>
            <div class="payload-box">
                <div class="payload-header">完整 JSON 数据</div>
                <pre><code>{{ JSON.stringify(currentService, null, 2) }}</code></pre>
            </div>
        </el-dialog>
    </div>
</template>

<script setup>
    import { ref, onMounted, computed } from 'vue';
    import useHttp from '@/hooks/useHttp';
    import { ElMessage } from 'element-plus';
    import {
        Refresh,
        Check,
        Close,
        DataAnalysis,
        CircleCheck,
        VideoPause,
        Warning,
        ArrowDown
    } from '@element-plus/icons-vue';
    import { REGIONS, getRegionApiPath } from './config.js';

    const loading = ref(false);
    const error = ref('');
    const services = ref([]);
    const dialogVisible = ref(false);
    const currentService = ref(null);
    const selectedRegion = ref('region1');
    const statusFilter = ref('all'); // 新增：过滤状态管理

    const availableCount = computed(() => services.value.filter(s => s.status === 'available').length);
    const busyCount = computed(() => services.value.filter(s => s.status === 'busy').length);
    const offlineCount = computed(() => services.value.filter(s => s.status === 'offline').length);

    // 新增：过滤后的数据流
    const filteredServices = computed(() => {
        if (statusFilter.value === 'all') return services.value;
        return services.value.filter(s => s.status === statusFilter.value);
    });

    const isMediaType = list => list?.some(s => s.session_type === 'omni' || s.session_type === 'audio');

    const fetchServices = async () => {
        loading.value = true;
        error.value = '';
        statusFilter.value = 'all'; // 每次同步数据时重置过滤器为“服务总数”
        try {
            const apiPath = getRegionApiPath(selectedRegion.value);
            const response = await useHttp.get(apiPath);
            if (response.code === 0) {
                const data = response.data;
                services.value = Array.isArray(data) ? data : data?.list || data?.services || (data ? [data] : []);
                ElMessage.success('数据已同步');
            } else {
                error.value = response.message || '获取列表失败';
            }
        } catch (err) {
            error.value = '网络请求异常';
        } finally {
            loading.value = false;
        }
    };

    // 新增：切换过滤
    const toggleFilter = status => {
        statusFilter.value = statusFilter.value === status ? 'all' : status;
    };

    const getModelTypeText = type => ({ duplex: '全双工', simplex: '半单工' })[type] || type || '-';
    const getStatusText = s => ({ available: '空闲可用', busy: '占用中', offline: '掉线/异常' })[s] || s || '未知';

    const formatHeartbeatTime = timestamp => {
        if (!timestamp) return '-';
        try {
            const date =
                typeof timestamp === 'number'
                    ? timestamp < 1e10
                        ? new Date(timestamp * 1000)
                        : new Date(timestamp)
                    : new Date(timestamp);
            if (isNaN(date.getTime())) return '-';
            const pad = n => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
        } catch (e) {
            return '-';
        }
    };

    const handleRegionChange = () => fetchServices();
    const handleViewDetail = row => {
        currentService.value = row;
        dialogVisible.value = true;
    };

    onMounted(() => fetchServices());
</script>

<style scoped>
    .inference-services-page {
        height: 100vh;
        background-color: #f8fafc;
        color: #1e293b;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        overflow: hidden;
    }

    .dashboard-container {
        max-width: 1400px;
        height: 100%;
        margin: 0 auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
    }

    /* Header Styles */
    .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        background: #fff;
        padding: 18px 24px;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        flex-shrink: 0;
    }

    .header-left .title {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 4px 0;
        letter-spacing: -0.5px;
    }

    .status-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .pulse-dot {
        width: 8px;
        height: 8px;
        background-color: #10b981;
        border-radius: 50%;
        position: relative;
    }

    .pulse-dot::after {
        content: '';
        position: absolute;
        width: 100%;
        height: 100%;
        background-color: #10b981;
        border-radius: 50%;
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0% {
            transform: scale(1);
            opacity: 0.8;
        }
        100% {
            transform: scale(3);
            opacity: 0;
        }
    }

    .status-text {
        font-size: 12px;
        color: #64748b;
        font-weight: 500;
    }

    .header-right {
        display: flex;
        align-items: center;
        gap: 20px;
    }

    .control-group {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .control-group .label {
        font-size: 13px;
        color: #64748b;
        font-weight: 500;
    }

    .modern-select {
        width: 150px;
    }

    :deep(.modern-select .el-input__wrapper) {
        box-shadow: none !important;
        background-color: #f1f5f9;
        border: 1px solid transparent;
        transition: all 0.2s;
        border-radius: 8px;
        padding: 2px 12px;
        cursor: pointer;
    }

    :deep(.modern-select .el-input__inner) {
        cursor: pointer;
    }

    :deep(.modern-select .el-input__suffix) {
        color: #64748b;
        font-size: 14px;
    }

    :deep(.modern-select .el-input__wrapper.is-focus) {
        background-color: #fff;
        border-color: #3b82f6;
    }

    .sync-btn {
        font-weight: 600;
        padding: 10px 24px;
        border-radius: 8px;
        background: linear-gradient(to bottom right, #3b82f6, #2563eb);
        border: none;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
        transition: all 0.2s;
    }

    .sync-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
        background: linear-gradient(to bottom right, #4f46e5, #3b82f6);
    }

    .sync-btn:active {
        transform: translateY(0);
    }

    .dashboard-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 12px;
        margin: -12px;
    }

    /* Stats Cards */
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
        margin-bottom: 24px;
        flex-shrink: 0;
    }

    .stat-card {
        background: #fff;
        padding: 24px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 16px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
        border: 2px solid transparent;
    }

    .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }

    .stat-card.active {
        border-color: #3b82f6;
        background: #f0f7ff;
    }

    .stat-card.available.active {
        border-color: #10b981;
        background: #ecfdf5;
    }
    .stat-card.busy.active {
        border-color: #f59e0b;
        background: #fffbeb;
    }
    .stat-card.offline.active {
        border-color: #ef4444;
        background: #fef2f2;
    }

    .stat-icon {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
    }

    .total .stat-icon {
        background: #eff6ff;
        color: #3b82f6;
    }
    .available .stat-icon {
        background: #ecfdf5;
        color: #10b981;
    }
    .busy .stat-icon {
        background: #fffbeb;
        color: #f59e0b;
    }
    .offline .stat-icon {
        background: #fef2f2;
        color: #ef4444;
    }

    .stat-label {
        font-size: 13px;
        color: #64748b;
        margin-bottom: 4px;
        font-weight: 500;
    }

    .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #1e293b;
    }

    /* Data Section */
    .data-section {
        background: #fff;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .section-header {
        margin-bottom: 16px;
        flex-shrink: 0;
    }

    .section-title {
        font-size: 18px;
        font-weight: 700;
        margin: 0 0 4px 0;
    }

    .section-meta {
        font-size: 13px;
        color: #64748b;
    }

    .table-container {
        border: 1px solid #f1f5f9;
        border-radius: 8px;
        overflow: hidden;
        flex: 1;
    }

    /* Table Customization */
    .modern-table :deep(.el-table__header) th {
        background-color: #f8fafc !important;
        color: #475569;
        font-weight: 600;
        height: 48px;
    }

    /* 彻底移除按钮点击后的焦点样式 */
    .modern-table :deep(.el-button):focus,
    .modern-table :deep(.el-button):focus-visible,
    .modern-table :deep(.el-button):active {
        outline: none !important;
        box-shadow: none !important;
    }

    .modern-table :deep(.el-button--primary.is-link):focus,
    .modern-table :deep(.el-button--primary.is-link):focus-visible {
        color: var(--el-color-primary);
        outline: none !important;
    }

    .mono-text {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        font-size: 13px;
        color: #3b82f6;
        background: #f0f7ff;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .status-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
    }

    .status-chip.available {
        background: #ecfdf5;
        color: #065f46;
    }
    .status-chip.busy {
        background: #fffbeb;
        color: #92400e;
    }
    .status-chip.offline {
        background: #fef2f2;
        color: #991b1b;
    }

    .chip-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
    }

    .available .chip-dot {
        background: #10b981;
    }
    .busy .chip-dot {
        background: #f59e0b;
    }
    .offline .chip-dot {
        background: #ef4444;
    }

    .icon-success {
        color: #10b981;
        font-size: 18px;
    }
    .icon-disabled {
        color: #cbd5e1;
        font-size: 16px;
    }

    .time-text {
        font-size: 12px;
        color: #64748b;
        font-family: monospace;
    }

    /* Dialog Styles */
    .modern-dialog :deep(.el-descriptions__cell) {
        padding: 8px 16px !important;
        height: 46px;
    }

    .modern-dialog :deep(.el-descriptions__content),
    .modern-dialog :deep(.el-descriptions__label) {
        vertical-align: middle !important;
    }

    .payload-box {
        margin-top: 20px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
    }

    .payload-header {
        background: #f8fafc;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        border-bottom: 1px solid #e2e8f0;
    }

    .payload-box pre {
        margin: 0;
        padding: 12px;
        background: #1e293b;
        color: #e2e8f0;
        font-size: 12px;
        max-height: 230px;
        overflow: auto;
    }

    @media (max-width: 1024px) {
        .stats-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    @media (max-width: 640px) {
        .stats-grid {
            grid-template-columns: 1fr;
        }
        .dashboard-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
        }
        .header-right {
            width: 100%;
            flex-direction: column;
        }
    }
</style>
