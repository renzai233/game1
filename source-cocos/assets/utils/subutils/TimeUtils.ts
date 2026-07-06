/**
 * 时间相关工具函数
 */

/**
 * 判断两个日期是否相差至少一天
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns 是否相差至少一天
 */
export const isNextDay = (date1: Date, date2: Date): boolean => {
    // 将两个日期都转换为当天的0点（即午夜）
    const startOfDay1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const startOfDay2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());

    // 计算两个日期的差值（以毫秒为单位）
    const diffInMs = Number(startOfDay2) - Number(startOfDay1);

    // 一天的毫秒数
    const oneDayInMs = 24 * 60 * 60 * 1000;

    // 判断两个日期是否至少相差一天
    return diffInMs >= oneDayInMs;
};