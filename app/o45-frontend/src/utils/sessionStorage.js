/**
 * Session ID 存储管理工具
 */

const STORAGE_KEY = 'sessionIdList';

/**
 * 格式化时间为年月日时分秒
 */
export const formatDateTime = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 获取所有Session ID列表
 */
export const getSessionIdList = () => {
    try {
        const list = localStorage.getItem(STORAGE_KEY);
        return list ? JSON.parse(list) : [];
    } catch (error) {
        console.error('获取sessionIdList失败:', error);
        return [];
    }
};

/**
 * 保存Session ID到列表
 * @param {string} sessionId - Session ID
 * @param {string} createTime - 创建时间（可选，默认当前时间）
 */
export const saveSessionId = (sessionId, createTime = null) => {
    if (!sessionId) return;

    const list = getSessionIdList();

    // 检查是否已存在
    const exists = list.find(item => item.session_id === sessionId);
    if (exists) {
        return; // 已存在，不重复添加
    }

    // 添加新记录
    const newItem = {
        session_id: sessionId,
        createTime: createTime || formatDateTime()
    };

    // 插入到数组开头（最新的在最上面）
    list.unshift(newItem);

    // 限制存储数量（可选，防止列表过长）
    const MAX_COUNT = 100;
    if (list.length > MAX_COUNT) {
        list.length = MAX_COUNT;
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (error) {
        console.error('保存sessionId失败:', error);
    }
};

/**
 * 清空Session ID列表
 */
export const clearSessionIdList = () => {
    localStorage.removeItem(STORAGE_KEY);
};

/**
 * 删除指定的Session ID
 * @param {string} sessionId - 要删除的Session ID
 */
export const removeSessionId = sessionId => {
    const list = getSessionIdList();
    const filteredList = list.filter(item => item.session_id !== sessionId);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredList));
    } catch (error) {
        console.error('删除sessionId失败:', error);
    }
};
