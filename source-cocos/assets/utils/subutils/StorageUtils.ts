/**
 * 本地存储相关工具函数
 */

/**
 * 保存广告统计数据到本地
 * @param adStats 广告统计数据对象
 */
export const saveAdStats = (adStats: any): void => {
    try {
        localStorage.setItem('ad_stats', JSON.stringify(adStats));
    } catch (e) {
        console.warn('保存广告统计数据失败', e);
    }
};

/**
 * 从本地加载广告统计数据
 * @returns 广告统计数据对象或空对象
 */
export const loadAdStats = (): any => {
    try {
        const str = localStorage.getItem('ad_stats');
        if (str) return JSON.parse(str);
    } catch (e) {
        console.warn('加载广告统计数据失败', e);
    }
    return {};
};