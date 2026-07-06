/**
 * 配置合并工具
 */
export class ConfigUtils {
    /**
     * 深度合并对象
     */
    static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
        const result = { ...target };

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                const sourceValue = source[key];
                const targetValue = target[key];

                if (this.isObject(sourceValue) && this.isObject(targetValue)) {
                    // 递归合并对象
                    result[key] = this.deepMerge(targetValue, sourceValue);
                } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
                    // 数组处理：使用源数组（直接替换）
                    result[key] = sourceValue as any;
                } else if (sourceValue !== undefined) {
                    // 直接赋值
                    result[key] = sourceValue as any;
                }
            }
        }

        return result;
    }

    /**
     * 检查是否为普通对象
     */
    private static isObject(value: any): boolean {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * 合并配置，处理嵌套对象
     */
    static mergeConfig<T extends Record<string, any>>(defaultConfig: T, envConfig: Partial<T>): T {
        return this.deepMerge(defaultConfig, envConfig);
    }
}