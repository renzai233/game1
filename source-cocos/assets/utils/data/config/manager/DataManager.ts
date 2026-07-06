import { EDM } from "../../env/ConfigManager";


// ==================== 本地存储操作 ====================

/**
 * 保存数据到本地存储
 */
export const saveData = (key: string, data: string) => {
    try {
        // 如果 data 已经是字符串，直接存储; 如果是对象，则序列化
        const dataToSave = typeof data === 'string' ? data : JSON.stringify(data);
        localStorage.setItem(key, dataToSave);
    } catch (e) {
        console.error('保存到本地存储失败:', e);
    }
}

/**
 * 从本地存储读取数据
 */
export const loadData = (key: string): any => {
    try {
        const data = localStorage.getItem(key)
        if (!data) return null
        
        try {
            return JSON.parse(data)
        } catch {
            return data
        }
    } catch (e) {
        console.error('[DataManager] 读取本地存储失败:', e)
        return null
    }
}

/**
 * 删除本地存储中的数据
 */
export const removeData = (key: string): void => {
    try {
        localStorage.removeItem(key)
    } catch (e) {
        console.error('[DataManager] 删除本地存储失败:', e)
    }
}

/**
 * 清空所有本地存储数据（慎用）
 */
export const clearLocalCache = (): void => {
    localStorage.clear()
    console.log('[DataManager] 本地缓存已清空')
}

// ==================== Map类型处理 ====================

/**
 * 恢复Map类型
 */
export const restoreMap = (data: any): Map<any, any> | null => {
    if (!data) return null
    if (data instanceof Map) return data
    if (Array.isArray(data)) return new Map(data)
    if (typeof data === 'object') {
        try {
            return new Map(Object.entries(data))
        } catch {
            return null
        }
    }
    return null
}

/**
 * Map转JSON可序列化格式
 */
export const mapToSerializable = (map: Map<any, any>): any[] => {
    return Array.from(map.entries())
}

// ==================== 远程数据获取 ====================

export const GlobalRemoteConfig = {
    user: "user",
    hero: "unit_hero",
    monster: "unit_monster",
    unit: "unit",
    unitBasicValue: "unit_basic_value",
    unitSprite: "unit_sprite",
    skill: "unit_skill",
    skillEffect: "unit_skill_effect",
}


/**
 * 获取远程数据
 */
export const getRemoteData = async (key: string, options?: {
    id?: string | number,
    query?: Record<string, any>
}): Promise<any> => {
    const table = GlobalRemoteConfig[key] || key
    let url = `${EDM.config.apiUrl}${table}`

    // 构建查询参数
    const params = new URLSearchParams()

    if (options?.id) {
        params.append('id', `eq.${options.id}`)
    } else {
        params.append('select', '*')
    }

    // 添加额外查询参数
    if (options?.query) {
        Object.entries(options.query).forEach(([key, value]) => {
            params.append(key, value)
        })
    }

    url += `?${params.toString()}`

    const headers: Record<string, string> = {
        apikey: EDM.config.apiKey,
        Authorization: EDM.config.authorization,
        'Content-Type': 'application/json'
    }

    try {
        console.log(`[DataManager] 请求远程数据: ${url}`)
        const response = await fetch(url, { headers })

        if (!response.ok) {
            throw new Error(`网络请求失败: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        console.log(`[DataManager] 远程数据获取成功: ${key}, 数量: ${Array.isArray(data) ? data.length : 1}`)
        return data
    } catch (error) {
        console.error('[DataManager] 远程数据获取失败:', error)
        throw error
    }
}

/**
 * 发送数据到远程服务器（POST/PUT等）
 */
export const sendRemoteData = async (
    key: string,
    data: any,
    method: 'POST' | 'PUT' | 'PATCH' = 'POST'
): Promise<any> => {
    const table = GlobalRemoteConfig[key] || key
    const url = `${EDM.config.apiUrl}${table}`

    const headers: Record<string, string> = {
        apikey: EDM.config.apiKey,
        Authorization: EDM.config.authorization,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal' // 对于Supabase，减少返回数据
    }

    try {
        console.log(`[DataManager] 发送数据到远程: ${url}`)
        const response = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(data)
        })

        if (!response.ok) {
            throw new Error(`网络请求失败: ${response.status} ${response.statusText}`)
        }

        // 如果是POST，Supabase可能会返回创建的数据
        if (method === 'POST' && response.status === 201) {
            return await response.json()
        }

        return { success: true }
    } catch (error) {
        console.error('[DataManager] 发送数据失败:', error)
        throw error
    }
}

// ==================== 缓存管理 ====================

/**
 * 带缓存的远程数据获取（先检查本地缓存）
 */
export const getCachedRemoteData = async (
    key: string,
    options?: { id?: string | number },
    cacheDuration: number = 3600000 // 默认缓存1小时
): Promise<any> => {
    const cacheKey = `cache_${key}${options?.id ? `_${options.id}` : ''}`
    const cacheTimestampKey = `${cacheKey}_timestamp`

    // 检查缓存是否有效
    const cachedData = loadData(cacheKey)
    const cachedTimestamp = loadData(cacheTimestampKey)

    if (cachedData && cachedTimestamp) {
        const cacheAge = Date.now() - cachedTimestamp
        if (cacheAge < cacheDuration) {
            console.log(`[DataManager] 使用缓存数据: ${cacheKey}, 缓存年龄: ${cacheAge}ms`)
            return cachedData
        }
    }

    // 缓存无效或不存在，从远程获取
    try {
        const remoteData = await getRemoteData(key, options)

        // 保存到缓存
        saveData(cacheKey, remoteData)
        saveData(cacheTimestampKey, String(Date.now()))

        return remoteData
    } catch (error) {
        // 远程获取失败，如果有缓存数据则返回缓存
        if (cachedData) {
            console.warn(`[DataManager] 远程获取失败，使用过期缓存: ${cacheKey}`)
            return cachedData
        }
        throw error
    }
}

/**
 * 清除特定键的缓存
 */
export const clearCache = (key: string): void => {
    const cacheKey = `cache_${key}`
    const cacheTimestampKey = `${cacheKey}_timestamp`

    removeData(cacheKey)
    removeData(cacheTimestampKey)

    console.log(`[DataManager] 清除缓存: ${key}`)
}