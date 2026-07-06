/**
 * 存储管理器接口
 * 为背包和仓库提供统一的接口
 */
import { IInventorySlot } from "./ItemTypes";

export interface IStorageManager {
    /**
     * 获取指定槽位
     */
    getSlot(slotId: number): IInventorySlot | undefined;

    /**
     * 获取所有槽位
     */
    getSlots(): IInventorySlot[];

    /**
     * 查找空槽位
     */
    findEmptySlot(): number;

    /**
     * 获取可用槽位数量（可选）
     */
    getAvailableSlots?(): number;

    /**
     * 获取已用槽位数量（可选）
     */
    getUsedSlots?(): number;
}