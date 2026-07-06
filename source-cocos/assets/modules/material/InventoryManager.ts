/**
 * 背包管理器
 * 负责玩家背包物品的管理
 */
import { Singleton } from "../../utils/common/Singleton";
import { PDM } from "../../utils/data/config/player/PlayerDataManager";
import { EDM } from "../../utils/data/env/ConfigManager";
import { gameBus } from "../../utils/signal/GameBus";
import { SIGNAL_TYPES } from "../../utils/signal/ISignal";
import { IStorageManager } from "./IStorageManager";
import {
    IItem,
    IInventorySlot,
    IInventoryConfig,
    IItemFilter,
    IItemOperationResult,
    ItemType
} from "./ItemTypes";

export class InventoryManager extends Singleton implements IStorageManager {
    private _slots: IInventorySlot[] = [];
    private _config: IInventoryConfig;
    private _isInitialized: boolean = false;

    constructor() {
        super();

        // 默认配置
        this._config = {
            maxSlots: 100,
            unlockedSlots: 30,
            rows: 5,
            columns: 6,
            slotSize: 80
        };
    }

    /**
     * 初始化背包
     */
    async initialize(): Promise<boolean> {
        if (this._isInitialized) return true;

        try {
            console.log('[InventoryManager] 初始化背包...');

            // 初始化槽位
            this.initializeSlots();

            // 从玩家数据加载背包物品
            await this.loadFromPlayerData();

            // 发送初始化完成事件
            gameBus.emit(SIGNAL_TYPES.INVENTORY_INITIALIZED, {
                slots: this._slots,
                config: this._config
            });

            this._isInitialized = true;
            console.log(`[InventoryManager] 初始化完成，槽位: ${this._slots.length}`);
            return true;
        } catch (error) {
            console.error('[InventoryManager] 初始化失败:', error);
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
     * 从玩家数据加载背包
     */
    private async loadFromPlayerData(): Promise<void> {
        const playerData = PDM.getPlayerData();
        if (!playerData) return;

        // 加载背包列表
        if (playerData.bagList && Array.isArray(playerData.bagList)) {
            for (const bagItem of playerData.bagList) {
                // 这里需要将玩家数据的物品转换为背包物品
                // 暂时使用空实现
            }
        }

        console.log(`[InventoryManager] 从玩家数据加载了物品`);
    }

    /**
     * 添加物品到背包
     */
    addItem(item: IItem, quantity: number = 1): IItemOperationResult {
        if (quantity <= 0) {
            return {
                success: false,
                message: '数量必须大于0'
            };
        }

        // 检查物品是否可以堆叠
        if (item.maxStack > 1) {
            return this.addStackableItem(item, quantity);
        } else {
            return this.addNonStackableItem(item, quantity);
        }
    }

    /**
     * 添加可堆叠物品
     */
    private addStackableItem(item: IItem, quantity: number): IItemOperationResult {
        // 1. 尝试合并到现有堆叠
        for (const slot of this._slots) {
            if (slot.item &&
                slot.item.id === item.id &&
                slot.quantity < slot.item.maxStack) {

                const canAdd = Math.min(
                    slot.item.maxStack - slot.quantity,
                    quantity
                );

                slot.quantity += canAdd;
                quantity -= canAdd;

                this.saveToPlayerData();
                this.notifySlotChanged(slot.slotId);

                if (quantity === 0) {
                    return {
                        success: true,
                        item: slot.item,
                        oldQuantity: slot.quantity - canAdd,
                        newQuantity: slot.quantity
                    };
                }
            }
        }

        // 2. 放入新的槽位
        return this.addNonStackableItem(item, quantity);
    }

    /**
     * 添加不可堆叠物品
     */
    private addNonStackableItem(item: IItem, quantity: number): IItemOperationResult {
        // 需要多个槽位
        const slotsNeeded = quantity;
        const emptySlots = this.findEmptySlots(slotsNeeded);

        if (emptySlots.length < slotsNeeded) {
            return {
                success: false,
                message: '背包空间不足'
            };
        }

        // 放入物品
        for (let i = 0; i < slotsNeeded; i++) {
            const slot = this._slots[emptySlots[i]];
            slot.item = { ...item, itemId: this.generateUniqueItemId(item) };
            slot.quantity = 1;

            this.notifySlotChanged(slot.slotId);
        }

        this.saveToPlayerData();

        return {
            success: true,
            message: `添加了 ${quantity} 个物品`
        };
    }

    /**
     * 从背包移除物品
     */
    removeItem(slotId: number, quantity: number = 1): IItemOperationResult {
        const slot = this._slots[slotId];
        if (!slot || !slot.item) {
            return {
                success: false,
                message: '槽位为空'
            };
        }

        if (slot.quantity < quantity) {
            return {
                success: false,
                message: '数量不足'
            };
        }

        const oldQuantity = slot.quantity;
        slot.quantity -= quantity;

        if (slot.quantity === 0) {
            slot.item = null;
        }

        this.saveToPlayerData();
        this.notifySlotChanged(slotId);

        return {
            success: true,
            oldQuantity,
            newQuantity: slot.quantity
        };
    }

    /**
     * 移除指定物品（按ID）
     */
    removeItemById(itemId: string, quantity: number = 1): IItemOperationResult {
        let remaining = quantity;

        for (const slot of this._slots) {
            if (slot.item && slot.item.itemId === itemId) {
                const toRemove = Math.min(slot.quantity, remaining);
                slot.quantity -= toRemove;
                remaining -= toRemove;

                if (slot.quantity === 0) {
                    slot.item = null;
                }

                this.notifySlotChanged(slot.slotId);

                if (remaining === 0) break;
            }
        }

        if (remaining > 0) {
            return {
                success: false,
                message: `物品数量不足，还缺少 ${remaining} 个`
            };
        }

        this.saveToPlayerData();

        return {
            success: true,
            message: `移除了 ${quantity} 个物品`
        };
    }

    /**
     * 移动物品
     */
    moveItem(fromSlotId: number, toSlotId: number): IItemOperationResult {
        if (fromSlotId === toSlotId) {
            return { success: true };
        }

        const fromSlot = this._slots[fromSlotId];
        const toSlot = this._slots[toSlotId];

        if (!fromSlot || !fromSlot.item) {
            return {
                success: false,
                message: '源槽位为空'
            };
        }

        // 如果目标槽位为空，直接移动
        if (!toSlot.item) {
            toSlot.item = fromSlot.item;
            toSlot.quantity = fromSlot.quantity;

            fromSlot.item = null;
            fromSlot.quantity = 0;
        }
        // 如果物品相同且可堆叠，尝试合并
        else if (toSlot.item.id === fromSlot.item.id &&
            toSlot.item.maxStack > 1) {

            const canMerge = Math.min(
                toSlot.item.maxStack - toSlot.quantity,
                fromSlot.quantity
            );

            if (canMerge > 0) {
                toSlot.quantity += canMerge;
                fromSlot.quantity -= canMerge;

                if (fromSlot.quantity === 0) {
                    fromSlot.item = null;
                }
            } else {
                // 不能合并，交换位置
                [fromSlot.item, toSlot.item] = [toSlot.item, fromSlot.item];
                [fromSlot.quantity, toSlot.quantity] = [toSlot.quantity, fromSlot.quantity];
            }
        }
        // 交换物品
        else {
            [fromSlot.item, toSlot.item] = [toSlot.item, fromSlot.item];
            [fromSlot.quantity, toSlot.quantity] = [toSlot.quantity, fromSlot.quantity];
        }

        this.saveToPlayerData();
        this.notifySlotChanged(fromSlotId);
        this.notifySlotChanged(toSlotId);

        return {
            success: true,
            fromSlot: fromSlotId,
            toSlot: toSlotId
        };
    }

    /**
     * 使用物品
     */
    useItem(slotId: number, quantity: number = 1): IItemOperationResult {
        const slot = this._slots[slotId];
        if (!slot || !slot.item) {
            return {
                success: false,
                message: '物品不存在'
            };
        }

        // 根据物品类型执行不同的使用逻辑
        switch (slot.item.type) {
            case ItemType.CONSUMABLE:
                return this.useConsumable(slot, quantity);
            case ItemType.EQUIPMENT:
                return this.useEquipment(slot);
            default:
                return {
                    success: false,
                    message: '此物品无法使用'
                };
        }
    }

    /**
     * 使用消耗品
     */
    private useConsumable(slot: IInventorySlot, quantity: number): IItemOperationResult {
        // 这里实现消耗品使用逻辑
        // 比如恢复生命值、添加增益等

        // 移除物品
        return this.removeItem(slot.slotId, quantity);
    }

    /**
     * 使用装备（装备/卸下）
     */
    private useEquipment(slot: IInventorySlot): IItemOperationResult {
        // 这里实现装备逻辑
        // 需要与装备管理器交互

        return {
            success: true,
            message: '装备已使用'
        };
    }

    /**
     * 拆分堆叠
     */
    splitStack(slotId: number, splitQuantity: number): IItemOperationResult {
        const slot = this._slots[slotId];
        if (!slot || !slot.item || slot.quantity <= 1) {
            return {
                success: false,
                message: '无法拆分'
            };
        }

        if (splitQuantity <= 0 || splitQuantity >= slot.quantity) {
            return {
                success: false,
                message: '拆分数量无效'
            };
        }

        // 找到空槽位
        const emptySlot = this.findEmptySlot();
        if (emptySlot === -1) {
            return {
                success: false,
                message: '没有空槽位'
            };
        }

        // 拆分
        const newSlot = this._slots[emptySlot];
        newSlot.item = { ...slot.item, itemId: this.generateUniqueItemId(slot.item) };
        newSlot.quantity = splitQuantity;

        slot.quantity -= splitQuantity;

        this.saveToPlayerData();
        this.notifySlotChanged(slotId);
        this.notifySlotChanged(emptySlot);

        return {
            success: true,
            fromSlot: slotId,
            toSlot: emptySlot
        };
    }

    /**
     * 排序背包
     */
    sortInventory(filter?: IItemFilter): void {
        // 1. 分离有物品的槽位和空槽位
        const filledSlots = this._slots.filter(slot => slot.item);
        const emptySlots = this._slots.filter(slot => !slot.item);

        // 2. 排序有物品的槽位
        filledSlots.sort((a, b) => {
            if (!a.item || !b.item) return 0;

            // 按类型排序
            if (a.item.type !== b.item.type) {
                return a.item.type.localeCompare(b.item.type);
            }

            // 按稀有度排序
            if (a.item.rarity !== b.item.rarity) {
                return b.item.rarity.localeCompare(a.item.rarity); // 稀有度高的在前
            }

            // 按ID排序
            return a.item.id - b.item.id;
        });

        // 3. 重新分配槽位
        const sortedSlots: IInventorySlot[] = [];

        // 有物品的槽位在前
        filledSlots.forEach((slot, index) => {
            slot.slotId = index;
            sortedSlots.push(slot);
        });

        // 空槽位在后
        emptySlots.forEach((slot, index) => {
            slot.slotId = filledSlots.length + index;
            sortedSlots.push(slot);
        });

        this._slots = sortedSlots;

        // 4. 通知所有槽位变化
        this.notifyAllSlotsChanged();
        this.saveToPlayerData();
    }

    /**
     * 搜索物品
     */
    searchItems(filter: IItemFilter): IInventorySlot[] {
        return this._slots.filter(slot => {
            if (!slot.item) return false;

            const item = slot.item;

            // 按类型筛选
            if (filter.types && filter.types.length > 0) {
                if (!filter.types.includes(item.type)) return false;
            }

            // 按稀有度筛选
            if (filter.rarities && filter.rarities.length > 0) {
                if (!filter.rarities.includes(item.rarity)) return false;
            }

            // 按等级筛选
            if (filter.minLevel !== undefined && item.requiredLevel < filter.minLevel) {
                return false;
            }
            if (filter.maxLevel !== undefined && item.requiredLevel > filter.maxLevel) {
                return false;
            }

            // 按搜索文本筛选
            if (filter.searchText) {
                const searchText = filter.searchText.toLowerCase();
                if (!item.name.toLowerCase().includes(searchText) &&
                    !item.description.toLowerCase().includes(searchText)) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * 获取物品数量
     */
    getItemCount(itemId: number): number {
        return this._slots.reduce((total, slot) => {
            if (slot.item && slot.item.id === itemId) {
                return total + slot.quantity;
            }
            return total;
        }, 0);
    }

    /**
     * 检查是否有足够数量的物品
     */
    hasEnoughItems(itemId: number, quantity: number): boolean {
        return this.getItemCount(itemId) >= quantity;
    }

    /**
     * 获取背包配置
     */
    getConfig(): IInventoryConfig {
        return { ...this._config };
    }

    /**
     * 获取所有槽位
     */
    getSlots(): IInventorySlot[] {
        return [...this._slots];
    }

    /**
     * 获取指定槽位
     */
    getSlot(slotId: number): IInventorySlot | undefined {
        return this._slots[slotId];
    }

    /**
     * 获取可用槽位数量
     */
    getAvailableSlots(): number {
        return this._slots.filter(slot => !slot.item).length;
    }

    /**
     * 获取已用槽位数量
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
        this.saveToPlayerData();

        gameBus.emit(SIGNAL_TYPES.INVENTORY_SLOTS_UNLOCKED, {
            unlockedCount: count,
            totalSlots: this._config.unlockedSlots
        });

        return true;
    }

    // IStorageManager 接口实现

    /**
     * 查找空槽位
     */
    findEmptySlot(): number {
        return this._slots.findIndex(slot => !slot.item);
    }

    // 辅助方法


    /**
     * 查找多个空槽位
     */
    private findEmptySlots(count: number): number[] {
        const emptySlots: number[] = [];
        for (let i = 0; i < this._slots.length && emptySlots.length < count; i++) {
            if (!this._slots[i].item) {
                emptySlots.push(i);
            }
        }
        return emptySlots;
    }

    /**
     * 生成唯一物品ID
     */
    private generateUniqueItemId(item: IItem): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `${item.id}_${timestamp}_${random}`;
    }

    /**
     * 保存到玩家数据
     */
    private saveToPlayerData(): void {
        // 这里需要将背包数据保存到 PlayerDataManager
        // 暂时只发送事件，具体的保存逻辑由上层处理
        gameBus.emit(SIGNAL_TYPES.INVENTORY_CHANGED, {
            slots: this._slots,
            config: this._config
        });

        if (EDM.isDev()) {
            console.log('[InventoryManager] 背包数据已更新');
        }
    }

    /**
     * 通知槽位变化
     */
    private notifySlotChanged(slotId: number): void {
        gameBus.emit(SIGNAL_TYPES.INVENTORY_SLOT_CHANGED, {
            slotId,
            slot: this._slots[slotId]
        });
    }

    /**
     * 通知所有槽位变化
     */
    private notifyAllSlotsChanged(): void {
        gameBus.emit(SIGNAL_TYPES.INVENTORY_SORTED, {
            slots: this._slots
        });
    }
}

// 导出单例
export const IM = InventoryManager.instance();