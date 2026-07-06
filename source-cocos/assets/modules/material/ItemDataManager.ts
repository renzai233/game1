/**
 * 物品配置管理器
 * 负责加载和管理所有物品配置
 */
import { Singleton } from "../../utils/common/Singleton";
import { EDM } from "../../utils/data/env/ConfigManager";
import { IItemConfig, IItem, ItemType, ItemRarity } from "./ItemTypes";

export class ItemDataManager extends Singleton {
    private _itemConfigs: Map<number, IItemConfig> = new Map();
    private _itemCache: Map<string, IItem> = new Map();
    private _typeIndex: Map<ItemType, Set<number>> = new Map();
    private _rarityIndex: Map<ItemRarity, Set<number>> = new Map();

    // 配置路径
    private readonly CONFIG_PATH = 'config/items';

    /**
     * 初始化物品配置
     */
    async initialize(): Promise<boolean> {
        try {
            console.log('[ItemDataManager] 初始化物品配置...');

            // 加载物品配置
            await this.loadItemConfigs();

            // 建立索引
            this.buildIndexes();

            console.log(`[ItemDataManager] 加载了 ${this._itemConfigs.size} 个物品配置`);
            return true;
        } catch (error) {
            console.error('[ItemDataManager] 初始化失败:', error);
            return false;
        }
    }

    /**
     * 加载物品配置
     */
    private async loadItemConfigs(): Promise<void> {
        // 这里可以从本地文件、远程服务器或数据库加载
        // 开发阶段使用模拟数据
        this.generateMockConfigs();

        if (EDM.isDev()) {
            console.log('[ItemDataManager] 使用模拟物品配置');
        }
    }

    /**
     * 根据配置创建物品实例
     */
    createItem(configId: number, quantity: number = 1): IItem | null {
        const config = this._itemConfigs.get(configId);
        if (!config) {
            console.warn(`[ItemDataManager] 物品配置不存在: ${configId}`);
            return null;
        }

        // 生成唯一ID
        const itemId = this.generateItemId(configId);

        // 检查缓存
        const cacheKey = `${configId}_${JSON.stringify(config)}`;
        if (this._itemCache.has(cacheKey)) {
            const cached = this._itemCache.get(cacheKey)!;
            return { ...cached, itemId };
        }

        // 根据类型创建具体物品
        let item: IItem;
        switch (config.type) {
            case ItemType.EQUIPMENT:
                item = this.createEquipment(config);
                break;
            case ItemType.CONSUMABLE:
                item = this.createConsumable(config);
                break;
            case ItemType.MATERIAL:
                item = this.createMaterial(config);
                break;
            case ItemType.HERO_FRAGMENT:
                item = this.createHeroFragment(config);
                break;
            default:
                item = this.createBasicItem(config);
        }

        // 设置数量和ID
        item.itemId = itemId;

        // 缓存（不包含唯一ID和数量）
        const cacheItem = { ...item, itemId: 'template' };
        this._itemCache.set(cacheKey, cacheItem);

        return item;
    }

    /**
     * 创建多个相同物品
     */
    createItems(configId: number, quantity: number): IItem[] {
        const items: IItem[] = [];
        for (let i = 0; i < quantity; i++) {
            const item = this.createItem(configId, 1);
            if (item) {
                items.push(item);
            }
        }
        return items;
    }

    /**
     * 获取物品配置
     */
    getItemConfig(configId: number): IItemConfig | undefined {
        return this._itemConfigs.get(configId);
    }

    /**
     * 获取所有配置
     */
    getAllConfigs(): Map<number, IItemConfig> {
        return new Map(this._itemConfigs);
    }

    /**
     * 根据类型筛选配置
     */
    getConfigsByType(type: ItemType): number[] {
        return Array.from(this._typeIndex.get(type) || []);
    }

    /**
     * 根据稀有度筛选配置
     */
    getConfigsByRarity(rarity: ItemRarity): number[] {
        return Array.from(this._rarityIndex.get(rarity) || []);
    }

    /**
     * 搜索物品配置
     */
    searchConfigs(keyword: string): number[] {
        const results: number[] = [];
        const lowerKeyword = keyword.toLowerCase();

        for (const [id, config] of this._itemConfigs) {
            if (config.name.toLowerCase().includes(lowerKeyword) ||
                config.description.toLowerCase().includes(lowerKeyword)) {
                results.push(id);
            }
        }

        return results;
    }

    /**
     * 建立索引
     */
    private buildIndexes(): void {
        // 按类型索引
        for (const [id, config] of this._itemConfigs) {
            // 类型索引
            if (!this._typeIndex.has(config.type)) {
                this._typeIndex.set(config.type, new Set());
            }
            this._typeIndex.get(config.type)!.add(id);

            // 稀有度索引
            if (!this._rarityIndex.has(config.rarity)) {
                this._rarityIndex.set(config.rarity, new Set());
            }
            this._rarityIndex.get(config.rarity)!.add(id);
        }
    }

    /**
     * 生成物品唯一ID
     */
    private generateItemId(configId: number): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `item_${configId}_${timestamp}_${random}`;
    }

    /**
     * 创建装备
     */
    private createEquipment(config: IItemConfig): any {
        // 这里实现具体的装备创建逻辑
        return {
            ...config,
            slot: 'weapon', // 示例
            attributes: {
                attack: 10,
                defense: 5,
                requiredLevel: 1
            },
            level: 1,
            upgradeLevel: 0,
            isEquipped: false
        };
    }

    /**
     * 创建消耗品
     */
    private createConsumable(config: IItemConfig): any {
        return {
            ...config,
            consumableType: 'potion',
            effects: [],
            useCount: 1
        };
    }

    /**
     * 创建材料
     */
    private createMaterial(config: IItemConfig): any {
        return {
            ...config,
            materialType: 'ore',
            tier: 1,
            isCraftable: true
        };
    }

    /**
     * 创建英雄碎片
     */
    private createHeroFragment(config: IItemConfig): any {
        return {
            ...config,
            heroId: 1,
            fragmentsNeeded: 10
        };
    }

    /**
     * 创建基础物品
     */
    private createBasicItem(config: IItemConfig): any {
        return config;
    }

    /**
     * 生成模拟配置（开发用）
     */
    private generateMockConfigs(): void {
        const mockConfigs: IItemConfig[] = [
            // 装备
            {
                id: 1001,
                name: "晶核短刃",
                type: ItemType.EQUIPMENT,
                rarity: ItemRarity.COMMON,
                maxStack: 1,
                icon: 'textures/skill/frostblade/icon/spriteFrame',
                sellPrice: 50,
                buyPrice: 100,
                isTradable: true,
                isDestroyable: true,
                isQuestItem: false,
                requiredLevel: 1
            },
            {
                id: 1002,
                name: "晶核利刃",
                type: ItemType.EQUIPMENT,
                rarity: ItemRarity.UNCOMMON,
                maxStack: 1,
                icon: 'textures/skill/holy/icon/spriteFrame',
                sellPrice: 200,
                buyPrice: 400,
                isTradable: true,
                isDestroyable: true,
                isQuestItem: false,
                requiredLevel: 5
            },
            // 消耗品
            {
                id: 2001,
                name: "能量药剂",
                type: ItemType.CONSUMABLE,
                rarity: ItemRarity.COMMON,
                maxStack: 99,
                icon: 'textures/icon/res/stamina/spriteFrame',
                sellPrice: 10,
                buyPrice: 20,
                isTradable: true,
                isDestroyable: true,
                isQuestItem: false,
                requiredLevel: 1
            },
            // 材料
            {
                id: 3001,
                name: "晶核材料",
                type: ItemType.MATERIAL,
                rarity: ItemRarity.COMMON,
                maxStack: 999,
                icon: 'textures/icon/res/treasure/spriteFrame',
                sellPrice: 5,
                buyPrice: 10,
                isTradable: true,
                isDestroyable: true,
                isQuestItem: false,
                requiredLevel: 1
            },
            // 英雄碎片
            {
                id: 4001,
                name: "晶核碎片",
                type: ItemType.HERO_FRAGMENT,
                rarity: ItemRarity.RARE,
                maxStack: 999,
                icon: 'textures/ui/popup/fragment/spriteFrame',
                sellPrice: 100,
                buyPrice: 200,
                isTradable: true,
                isDestroyable: false,
                isQuestItem: false,
                requiredLevel: 1
            }
        ];

        mockConfigs.forEach(config => {
            this._itemConfigs.set(config.id, config);
        });
    }
}

// 导出单例
export const IDM = ItemDataManager.instance();