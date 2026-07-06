/**
 * 装备管理器
 * 负责玩家装备的穿戴、卸下、强化等
 */
import { CurrencyType } from "../../utils/common/CurrencyManager";
import { Singleton } from "../../utils/common/Singleton";
import { PDM } from "../../utils/data/config/player/PlayerDataManager";
import { gameBus } from "../../utils/signal/GameBus";
import { SIGNAL_TYPES } from "../../utils/signal/ISignal";
import { IM } from "./InventoryManager";
import {
    IItem,
    IEquipment,
    EquipmentSlot,
    IItemAttributes,
    IItemOperationResult
} from "./ItemTypes";

export class EquipmentManager extends Singleton {
    private _equippedItems: Map<EquipmentSlot, IEquipment> = new Map();
    private _totalAttributes: IItemAttributes = {};
    private _isInitialized: boolean = false;

    /**
     * 初始化装备管理器
     */
    async initialize(): Promise<boolean> {
        if (this._isInitialized) return true;

        try {
            console.log('[EquipmentManager] 初始化装备管理器...');

            // 从玩家数据加载已装备的物品
            await this.loadFromPlayerData();

            // 计算总属性
            this.calculateTotalAttributes();

            this._isInitialized = true;
            console.log(`[EquipmentManager] 初始化完成，已装备 ${this._equippedItems.size} 件装备`);
            return true;
        } catch (error) {
            console.error('[EquipmentManager] 初始化失败:', error);
            return false;
        }
    }

    /**
     * 装备物品
     */
    equipItem(inventorySlotId: number): IItemOperationResult {
        const slot = IM.getSlot(inventorySlotId);
        if (!slot || !slot.item) {
            return {
                success: false,
                message: '物品不存在'
            };
        }

        // 检查是否为装备
        if (slot.item.type !== 'equipment') {
            return {
                success: false,
                message: '此物品不是装备'
            };
        }

        const equipment = slot.item as IEquipment;

        // 检查是否已装备
        if (equipment.isEquipped) {
            return {
                success: false,
                message: '此装备已装备'
            };
        }

        // 检查等级要求
        const playerLevel = PDM.getPlayerLevel();
        if (equipment.requiredLevel > playerLevel) {
            return {
                success: false,
                message: `需要等级 ${equipment.requiredLevel}`
            };
        }

        // 检查该部位是否已有装备
        const currentEquipped = this._equippedItems.get(equipment.slot);
        if (currentEquipped) {
            // 先卸下当前装备
            this.unequipItem(equipment.slot);
        }

        // 装备新装备
        equipment.isEquipped = true;
        this._equippedItems.set(equipment.slot, equipment);

        // 从背包移除
        IM.removeItem(inventorySlotId, 1);

        // 重新计算属性
        this.calculateTotalAttributes();

        // 保存数据
        this.saveToPlayerData();

        // 发送事件
        gameBus.emit(SIGNAL_TYPES.EQUIPMENT_CHANGED, {
            slot: equipment.slot,
            equipment,
            oldEquipment: currentEquipped,
            attributes: this._totalAttributes
        });

        return {
            success: true,
            item: equipment,
            message: '装备成功'
        };
    }

    /**
     * 卸下装备
     */
    unequipItem(slot: EquipmentSlot): IItemOperationResult {
        const equipment = this._equippedItems.get(slot);
        if (!equipment) {
            return {
                success: false,
                message: '该部位没有装备'
            };
        }

        // 检查背包是否有空间
        if (IM.getAvailableSlots() === 0) {
            return {
                success: false,
                message: '背包空间不足'
            };
        }

        // 卸下装备
        equipment.isEquipped = false;
        this._equippedItems.delete(slot);

        // 添加到背包
        IM.addItem(equipment, 1);

        // 重新计算属性
        this.calculateTotalAttributes();

        // 保存数据
        this.saveToPlayerData();

        // 发送事件
        gameBus.emit(SIGNAL_TYPES.EQUIPMENT_CHANGED, {
            slot,
            equipment: null,
            oldEquipment: equipment,
            attributes: this._totalAttributes
        });

        return {
            success: true,
            item: equipment,
            message: '卸下成功'
        };
    }

    /**
     * 一键卸下所有装备
     */
    unequipAll(): IItemOperationResult {
        const slots = Array.from(this._equippedItems.keys());
        let successCount = 0;
        let failCount = 0;

        for (const slot of slots) {
            const result = this.unequipItem(slot);
            if (result.success) {
                successCount++;
            } else {
                failCount++;
            }
        }

        return {
            success: successCount > 0,
            message: `卸下了 ${successCount} 件装备，失败 ${failCount} 件`
        };
    }

    /**
     * 强化装备
     */
    upgradeEquipment(slot: EquipmentSlot): IItemOperationResult {
        const equipment = this._equippedItems.get(slot);
        if (!equipment) {
            return {
                success: false,
                message: '没有装备可以强化'
            };
        }

        // 检查强化等级上限
        const maxUpgradeLevel = this.getMaxUpgradeLevel(equipment);
        if (equipment.upgradeLevel >= maxUpgradeLevel) {
            return {
                success: false,
                message: '已达到最大强化等级'
            };
        }

        // 计算强化消耗
        const upgradeCost = this.calculateUpgradeCost(equipment);

        // 检查货币是否足够
        const hasGold = PDM.hasEnoughCurrency(CurrencyType.Gold, upgradeCost.gold);
        const hasMaterials = IM.hasEnoughItems(upgradeCost.materialId, upgradeCost.materialCount);

        if (!hasGold || !hasMaterials) {
            return {
                success: false,
                message: '强化材料不足'
            };
        }

        // 扣除消耗
        PDM.subtractCurrency(CurrencyType.Gold, upgradeCost.gold, 'equipment_upgrade');
        IM.removeItemById(upgradeCost.materialId.toString(), upgradeCost.materialCount);

        // 执行强化
        equipment.upgradeLevel++;
        this.upgradeEquipmentAttributes(equipment);

        // 重新计算属性
        this.calculateTotalAttributes();

        // 保存数据
        this.saveToPlayerData();

        // 发送事件
        gameBus.emit(SIGNAL_TYPES.EQUIPMENT_UPGRADED, {
            slot,
            equipment,
            newLevel: equipment.upgradeLevel,
            attributes: equipment.attributes
        });

        return {
            success: true,
            item: equipment,
            message: `强化成功！等级: ${equipment.upgradeLevel}`
        };
    }

    /**
     * 获取指定部位的装备
     */
    getEquipment(slot: EquipmentSlot): IEquipment | undefined {
        return this._equippedItems.get(slot);
    }

    /**
     * 获取所有已装备的物品
     */
    getAllEquipped(): Map<EquipmentSlot, IEquipment> {
        return new Map(this._equippedItems);
    }

    /**
     * 获取总属性
     */
    getTotalAttributes(): IItemAttributes {
        return { ...this._totalAttributes };
    }

    /**
     * 计算总属性
     */
    private calculateTotalAttributes(): void {
        const attributes: IItemAttributes = {};

        for (const equipment of this._equippedItems.values()) {
            this.mergeAttributes(attributes, equipment.attributes);

            // 添加附魔属性
            if (equipment.enchantment) {
                this.mergeAttributes(attributes, equipment.enchantment.attributes);
            }

            // 添加镶嵌宝石属性
            if (equipment.attributes.sockets) {
                for (const socket of equipment.attributes.sockets) {
                    this.mergeAttributes(attributes, socket.attributes);
                }
            }
        }

        this._totalAttributes = attributes;
    }

    /**
     * 合并属性
     */
    private mergeAttributes(target: IItemAttributes, source: IItemAttributes): void {
        for (const [key, value] of Object.entries(source)) {
            if (typeof value === 'number') {
                // @ts-ignore
                target[key] = (target[key] || 0) + value;
            }
        }
    }

    /**
     * 获取最大强化等级
     */
    private getMaxUpgradeLevel(equipment: IEquipment): number {
        const baseLevel = 10; // 基础最大等级
        const rarityBonus: Record<string, number> = {
            'common': 0,
            'uncommon': 2,
            'rare': 4,
            'epic': 6,
            'legendary': 8,
            'mythic': 10
        };

        return baseLevel + (rarityBonus[equipment.rarity] || 0);
    }

    /**
     * 计算强化消耗
     */
    private calculateUpgradeCost(equipment: IEquipment): {
        gold: number;
        materialId: number;
        materialCount: number;
    } {
        const baseGold = 100;
        const goldMultiplier = Math.pow(2, equipment.upgradeLevel);

        const materialId = 3001; // 强化石
        const materialCount = equipment.upgradeLevel + 1;

        return {
            gold: baseGold * goldMultiplier,
            materialId,
            materialCount
        };
    }

    /**
     * 强化装备属性
     */
    private upgradeEquipmentAttributes(equipment: IEquipment): void {
        const upgradeRate = 0.1; // 10% 提升

        for (const [key, value] of Object.entries(equipment.attributes)) {
            if (typeof value === 'number' && value > 0) {
                // @ts-ignore
                equipment.attributes[key] = Math.round(value * (1 + upgradeRate));
            }
        }
    }

    private loadFromPlayerData(): Promise<void> {
        // 从玩家数据加载已装备的物品
        return Promise.resolve();
    }

    private saveToPlayerData(): void {
        gameBus.emit(SIGNAL_TYPES.EQUIPMENT_SAVED, {
            equippedItems: Array.from(this._equippedItems.entries()),
            attributes: this._totalAttributes
        });
    }
}

// 导出单例
export const EM = EquipmentManager.instance();