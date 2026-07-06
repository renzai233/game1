/**
 * 仓库管理器
 * 负责玩家仓库（扩展存储）的管理
 */
import { CurrencyType } from "../../utils/common/CurrencyManager";
import { Singleton } from "../../utils/common/Singleton";
import { PDM } from "../../utils/data/config/player/PlayerDataManager";
import { gameBus } from "../../utils/signal/GameBus";
import { SIGNAL_TYPES } from "../../utils/signal/ISignal";
import { IM } from "./InventoryManager";
import { IStorageManager } from "./IStorageManager";
import {
    IItem,
    IInventorySlot,
    IWarehouseConfig,
    IItemOperationResult
} from "./ItemTypes";

export class WarehouseManager extends Singleton implements IStorageManager {
    private _slots: IInventorySlot[] = [];
    private _config: IWarehouseConfig;
    private _isInitialized: boolean = false;

    constructor() {
        super();

        // 默认配置
        this._config = {
            maxSlots: 500,
            unlockedSlots: 50,
            upgradeCosts: [
                { level: 1, costGold: 1000, costGem: 10 },
                { level: 2, costGold: 2000, costGem: 20 },
                { level: 3, costGold: 5000, costGem: 50 }
            ]
        };
    }

    /**
     * 初始化仓库
     */
    async initialize(): Promise<boolean> {
        if (this._isInitialized) return true;

        try {
            console.log('[WarehouseManager] 初始化仓库...');

            // 初始化槽位
            this.initializeSlots();

            // 从玩家数据加载仓库物品
            await this.loadFromPlayerData();

            this._isInitialized = true;
            console.log(`[WarehouseManager] 初始化完成，槽位: ${this._slots.length}`);
            return true;
        } catch (error) {
            console.error('[WarehouseManager] 初始化失败:', error);
            return false;
        }
    }

    /**
     * 初始化槽位
     */
    private initializeSlots(): void {
        this._slots = [];
        for (let i = 0; i < this._config.unlockedSlots; i++) {
            this._slots.push({
                slotId: i,
                item: null,
                quantity: 0,
                locked: false
            });
        }
    }

    /**
     * 从玩家数据加载仓库物品
     */
    private async loadFromPlayerData(): Promise<void> {
        const playerData = PDM.getPlayerData();
        if (!playerData) return;

        // 这里实现从玩家数据加载仓库的逻辑
        // 暂时为空实现

        console.log(`[WarehouseManager] 从玩家数据加载仓库物品`);
    }

    /**
     * 转移物品（背包 ↔ 仓库）
     */
    transferItem(
        sourceType: 'inventory' | 'warehouse',
        sourceSlotId: number,
        targetType: 'inventory' | 'warehouse',
        targetSlotId?: number
    ): IItemOperationResult {
        const sourceManager = sourceType === 'inventory' ? IM as IStorageManager : this as IStorageManager;
        const targetManager = targetType === 'inventory' ? IM as IStorageManager : this as IStorageManager;

        const sourceSlot = sourceManager.getSlot(sourceSlotId);
        if (!sourceSlot || !sourceSlot.item) {
            return {
                success: false,
                message: '源槽位为空'
            };
        }

        // 如果指定了目标槽位
        if (targetSlotId !== undefined) {
            const targetSlot = targetManager.getSlot(targetSlotId);

            // 如果目标槽位为空，直接移动
            if (!targetSlot || !targetSlot.item) {
                return this.performTransfer(
                    sourceManager,
                    sourceSlotId,
                    targetManager,
                    targetSlotId
                );
            }
            // 如果物品相同且可堆叠，尝试合并
            else if (targetSlot.item.id === sourceSlot.item.id &&
                targetSlot.item.maxStack > 1) {

                const canMerge = Math.min(
                    targetSlot.item.maxStack - targetSlot.quantity,
                    sourceSlot.quantity
                );

                if (canMerge > 0) {
                    targetSlot.quantity += canMerge;
                    sourceSlot.quantity -= canMerge;

                    if (sourceSlot.quantity === 0) {
                        sourceSlot.item = null;
                    }

                    this.saveData();
                    return { success: true };
                }
            }
        }

        // 自动寻找空槽位
        const emptySlot = targetManager.findEmptySlot();
        if (emptySlot === -1) {
            return {
                success: false,
                message: '目标空间不足'
            };
        }

        return this.performTransfer(
            sourceManager,
            sourceSlotId,
            targetManager,
            emptySlot
        );
    }

    /**
     * 执行转移
     */
    private performTransfer(
        sourceManager: IStorageManager,
        sourceSlotId: number,
        targetManager: IStorageManager,
        targetSlotId: number
    ): IItemOperationResult {
        const sourceSlot = sourceManager.getSlot(sourceSlotId);
        const targetSlot = targetManager.getSlot(targetSlotId);

        if (!sourceSlot || !sourceSlot.item || !targetSlot) {
            return { success: false, message: '转移失败' };
        }

        // 执行转移
        targetSlot.item = sourceSlot.item;
        targetSlot.quantity = sourceSlot.quantity;

        sourceSlot.item = null;
        sourceSlot.quantity = 0;

        this.saveData();

        return {
            success: true,
            fromSlot: sourceSlotId,
            toSlot: targetSlotId
        };
    }

    /**
     * 一键转移所有指定类型的物品
     */
    transferAllByType(
        sourceType: 'inventory' | 'warehouse',
        targetType: 'inventory' | 'warehouse',
        itemType: string
    ): IItemOperationResult {
        const sourceManager = sourceType === 'inventory' ? IM as IStorageManager : this as IStorageManager;
        const targetManager = targetType === 'inventory' ? IM as IStorageManager : this as IStorageManager;

        const sourceSlots = sourceManager.getSlots();
        const itemsToTransfer = sourceSlots.filter(
            slot => slot.item && slot.item.type === itemType
        );

        if (itemsToTransfer.length === 0) {
            return {
                success: false,
                message: '没有符合条件的物品'
            };
        }

        let transferred = 0;
        let failed = 0;

        for (const slot of itemsToTransfer) {
            const result = this.transferItem(
                sourceType,
                slot.slotId,
                targetType
            );

            if (result.success) {
                transferred++;
            } else {
                failed++;
            }
        }

        return {
            success: transferred > 0,
            message: `转移了 ${transferred} 个物品，失败 ${failed} 个`
        };
    }

    /**
     * 升级仓库容量
     */
    upgradeCapacity(): IItemOperationResult {
        const currentLevel = Math.floor(this._config.unlockedSlots / 50);
        const nextLevel = currentLevel + 1;

        const upgradeCost = this._config.upgradeCosts.find(
            cost => cost.level === nextLevel
        );

        if (!upgradeCost) {
            return {
                success: false,
                message: '已达到最大等级'
            };
        }

        // 检查货币是否足够
        const hasGold = PDM.hasEnoughCurrency(CurrencyType.Gold, upgradeCost.costGold);
        const hasGem = PDM.hasEnoughCurrency(CurrencyType.Gem, upgradeCost.costGem);

        if (!hasGold || !hasGem) {
            return {
                success: false,
                message: '货币不足'
            };
        }

        // 扣除货币
        PDM.subtractCurrency('gold' as CurrencyType, upgradeCost.costGold, 'warehouse_upgrade');
        PDM.subtractCurrency('gem' as CurrencyType, upgradeCost.costGem, 'warehouse_upgrade');

        // 解锁槽位
        this.unlockSlots(50);

        return {
            success: true,
            message: `仓库已升级到等级 ${nextLevel}`
        };
    }

    // IStorageManager 接口实现

    /**
     * 获取指定槽位
     */
    getSlot(slotId: number): IInventorySlot | undefined {
        return this._slots[slotId];
    }

    /**
     * 获取所有槽位
     */
    getSlots(): IInventorySlot[] {
        return [...this._slots];
    }

    /**
     * 查找空槽位
     */
    findEmptySlot(): number {
        return this._slots.findIndex(slot => !slot.item);
    }

    /**
     * 获取可用槽位数量（可选实现）
     */
    getAvailableSlots(): number {
        return this._slots.filter(slot => !slot.item).length;
    }

    /**
     * 获取已用槽位数量（可选实现）
     */
    getUsedSlots(): number {
        return this._slots.filter(slot => slot.item).length;
    }

    /**
     * 解锁更多槽位
     */
    unlockSlots(count: number): boolean {
        if (this._config.unlockedSlots + count > this._config.maxSlots) {
            return false;
        }

        for (let i = 0; i < count; i++) {
            this._slots.push({
                slotId: this._slots.length,
                item: null,
                quantity: 0,
                locked: false
            });
        }

        this._config.unlockedSlots += count;
        this.saveData();

        gameBus.emit(SIGNAL_TYPES.WAREHOUSE_UPGRADED, {
            newCapacity: this._config.unlockedSlots
        });

        return true;
    }

    /**
     * 保存数据
     */
    private saveData(): void {
        gameBus.emit(SIGNAL_TYPES.WAREHOUSE_CHANGED, {
            slots: this._slots
        });
    }
}

// 导出单例
export const WM = WarehouseManager.instance();