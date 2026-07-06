import { Singleton } from "../../../common/Singleton"
import { EDM } from "../../env/ConfigManager"
import { getRemoteData } from "./DataManager"
import { resManager } from "./ResourceManager"

export const JsonConfigPath = {
    talent: 'talent',
    welfare: 'welfare'
}

// JSON 配置接口定义
interface IJsonConfigs {
    talent: any[]
    welfare: any[]
    item?: any[]
    level?: any[]
    [key: string]: any
}

/**
 * JSON数据管理器 - 专门负责从configs bundle加载和管理JSON配置数据
 */
export class JsonDataManager extends Singleton {
    private _configs: IJsonConfigs = {
        talent: [],
        welfare: []
    }

    private _isInitialized: boolean = false
    private readonly CONFIG_BUNDLE = 'configs' // JSON配置所在的Bundle

    /**
     * 初始化JSON配置数据
     */
    async init(): Promise<boolean> {
        if (this._isInitialized) return true

        try {
            console.log('[JsonDataManager] 开始加载JSON配置数据...')

            // 加载所有JSON配置
            await this.loadAllConfigs()

            // 如果配置了远程数据，可以尝试加载远程配置覆盖
            if (!EDM.config.useLocal) {
                await this.loadRemoteConfigs()
            }

            this._isInitialized = true
            console.log('[JsonDataManager] JSON配置数据初始化完成')
            return true
        } catch (error) {
            console.error('[JsonDataManager] 初始化失败:', error)
            return false
        }
    }

    /**
     * 加载所有JSON配置
     */
    private async loadAllConfigs(): Promise<void> {
        const configPromises = [
            this.loadConfig(JsonConfigPath.talent),
        ]

        const results = await Promise.allSettled(configPromises)

        // 处理加载结果
        const configNames = ['talent']
        results.forEach((result, index) => {
            const configName = configNames[index]
            if (result.status === 'fulfilled') {
                this._configs[configName] = result.value
                console.log(`[JsonDataManager] ${configName}配置加载成功，共${(result.value as any[]).length}条`)
            } else {
                console.warn(`[JsonDataManager] ${configName}配置加载失败:`, result.reason)
                this._configs[configName] = [] // 使用空数组作为默认值
            }
        })
    }

    /**
     * 加载单个JSON配置
     */
    private async loadConfig<T>(configName: string): Promise<T> {
        try {
            // 使用ResourceManager加载configs bundle中的JSON文件
            const config = await resManager().loadConfig<T>(
                configName, // 配置文件路径，不需要后缀
                this.CONFIG_BUNDLE // 从configs bundle加载
            )

            // 验证配置数据
            return this.validateConfig(config, configName)
        } catch (error) {
            console.error(`[JsonDataManager] 加载配置${configName}失败:`, error)
            throw error
        }
    }

    /**
     * 加载远程配置（可选）
     */
    private async loadRemoteConfigs(): Promise<void> {
        try {
            console.log('[JsonDataManager] 开始加载远程配置...')

            // 只加载需要远程更新的配置
            const [remoteHeroes] = await Promise.allSettled([
                getRemoteData('heroes').catch(() => [])
            ])

            // 合并远程数据和本地数据（远程数据优先）
            if (remoteHeroes.status === 'fulfilled' && remoteHeroes.value.length > 0) {
                console.log('[JsonDataManager] 远程英雄配置加载成功')
            }
        } catch (error) {
            console.warn('[JsonDataManager] 远程配置加载失败，使用本地配置', error)
        }
    }

    /**
     * 验证和转换配置数据
     */
    private validateConfig<T>(config: any, configName: string): T {
        if (!config) {
            console.warn(`[JsonDataManager] ${configName}配置为空`)
            return [] as any
        }

        return config as T
    }

    // ==================== 公共接口 ====================

    /**
     * 获取天赋列表
     */
    getTalentList(): any[] {
        return this._configs.talent || []
    }

    /**
     * 根据ID获取天赋配置
     */
    getTalentById(id: number): any {
        return this.getTalentList().find(talent => talent.id === id)
    }

    /**
     * 获取福利列表
     */
    getWelfareList(): any[] {
        return this._configs.welfare || []
    }

    /**
     * 根据ID获取福利配置
     */
    getWelfareById(id: number): any {
        return this.getWelfareList().find(welfare => welfare.id === id)
    }

    /**
     * 获取所有配置的统计信息
     */
    getConfigStats(): Record<string, number> {
        return {
            talent: this._configs.talent.length,
            welfare: this._configs.welfare.length
        }
    }

    /**
     * 动态加载其他配置（按需加载）
     */
    async loadAdditionalConfig<T>(configName: string): Promise<T> {
        try {
            if (this._configs[configName]) {
                return this._configs[configName] as T
            }

            const config = await this.loadConfig<T>(configName)
            this._configs[configName] = config
            return config
        } catch (error) {
            console.error(`[JsonDataManager] 加载额外配置${configName}失败:`, error)
            throw error
        }
    }

    /**
     * 重新加载配置（热更新时使用）
     */
    async reloadConfig(configName: string): Promise<void> {
        try {
            const config = await this.loadConfig(configName)
            this._configs[configName] = config
            console.log(`[JsonDataManager] 配置${configName}重新加载成功`)
        } catch (error) {
            console.error(`[JsonDataManager] 重新加载配置${configName}失败:`, error)
        }
    }
}

export const JDM = JsonDataManager.instance()
