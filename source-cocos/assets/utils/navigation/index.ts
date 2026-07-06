/**
 * 导航栏模块
 * 提供底部导航栏的完整功能
 */

// 导出配置相关
export type { INavigationConfig, INavigationButton } from './NavigationConfig';
export { defaultNavigationConfig } from './NavigationConfig';

// 导出管理器
export { NavigationManager } from './NavigationManager';
export { NavigationButton } from './NavigationButton';

// 导出控制器
export { NavigationController } from './NavigationController';

// 导出工具类
export { NavigationUtils } from './NavigationUtils'; 