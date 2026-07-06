/**
 * 数学计算相关工具函数
 */

/**
 * 计算数组之和
 * @param arr 数字数组
 * @returns 数组元素之和
 */
export const computedSum = (arr: number[]): number => {
    return arr.reduce((accumulator, currentValue) => {
        return accumulator + currentValue;
    }, 0);
};

/**
 * Fisher-Yates洗牌算法，随机排序数组
 * @param array 需要洗牌的数组
 * @returns 随机排序后的数组
 */
export const fisherYatesShuffle = <T>(array: T[]): T[] => {
    const shuffledArray = [...array]; // 创建副本避免修改原数组

    for (let i = shuffledArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
    }

    return shuffledArray;
};