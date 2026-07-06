/**
 * 物资模块主入口
 * 统一管理所有物资相关功能
 */
import { Singleton } from "../../utils/common/Singleton";
import { IDM } from "./ItemDataManager";
import { IM } from "./InventoryManager";
import { WM } from "./WarehouseManager";
import { EM } from "./EquipmentManager";

export class MaterialModuleManager extends Singleton {
  /**
   * 初始化整个物资模块
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('[MaterialModuleManager] 初始化物资模块...');
      
      // 1. 初始化物品配置管理器
      const configSuccess = await IDM.initialize();
      if (!configSuccess) {
        throw new Error('物品配置管理器初始化失败');
      }
      
      // 2. 初始化背包管理器
      const inventorySuccess = await IM.initialize();
      if (!inventorySuccess) {
        throw new Error('背包管理器初始化失败');
      }
      
      // 3. 初始化仓库管理器
      const warehouseSuccess = await WM.initialize();
      if (!warehouseSuccess) {
        throw new Error('仓库管理器初始化失败');
      }
      
      // 4. 初始化装备管理器
      const equipmentSuccess = await EM.initialize();
      if (!equipmentSuccess) {
        throw new Error('装备管理器初始化失败');
      }
      
      console.log('[MaterialModuleManager] 物资模块初始化完成');
      return true;
    } catch (error) {
      console.error('[MaterialModuleManager] 初始化失败:', error);
      return false;
    }
  }
  
  /**
   * 获取物品配置管理器
   */
  getItemDataManager(): typeof IDM {
    return IDM;
  }
  
  /**
   * 获取背包管理器
   */
  getInventoryManager(): typeof IM {
    return IM;
  }
  
  /**
   * 获取仓库管理器
   */
  getWarehouseManager(): typeof WM {
    return WM;
  }
  
  /**
   * 获取装备管理器
   */
  getEquipmentManager(): typeof EM {
    return EM;
  }
  
  /**
   * 创建测试物品（开发用）
   */
  createTestItems(): void {
    // 创建一些测试物品
    const testItems = [
      { configId: 1001, quantity: 1 }, // 铁剑
      { configId: 2001, quantity: 5 }, // 治疗药水
      { configId: 3001, quantity: 10 }, // 铁矿石
      { configId: 4001, quantity: 3 }  // 英雄碎片
    ];
    
    for (const testItem of testItems) {
      const item = IDM.createItem(testItem.configId, testItem.quantity);
      if (item) {
        IM.addItem(item, testItem.quantity);
      }
    }
    
    console.log('[MaterialModuleManager] 创建了测试物品');
  }
}

// 导出单例
export const MMM = MaterialModuleManager.instance();