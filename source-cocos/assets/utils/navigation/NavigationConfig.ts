/**
 * 底部导航栏配置类型定义
 */

export interface INavigationButton {
    /** 按钮唯一标识 */
    id: string;
    /** 按钮显示名称 */
    name: string;
    /** 是否显示名称 */
    showName: boolean;
    /** 跳转的面板路径 */
    panelPath: string;
    /** 按钮反馈类型 */
    feedbackType: 'scale' | 'color' | 'blink' | 'shake';
    /** 是否启用 */
    enabled: boolean;
}

export interface INavigationConfig {
    /** 导航栏高度 */
    height: number;
    /** 底部边距 */
    bottomMargin: number;
    /** 按钮间距 */
    buttonSpacing: number;
    /** 按钮大小 */
    buttonSize: number;
    /** 图标大小 */
    iconSize: number;
    /** 文字大小 */
    textSize: number;
    /** 背景颜色 */
    backgroundColor: string;
    /** 选中状态颜色 */
    selectedColor: string;
    /** 未选中状态颜色 */
    unselectedColor: string;
    /** 是否显示按钮名称 */
    showButtonNames: boolean;
    /** 导航按钮列表 */
    buttons: INavigationButton[];
}

export const defaultNavigationConfig: INavigationConfig = {
    height: 300,
    bottomMargin: 50,
    buttonSpacing: 20,
    buttonSize: 80,
    iconSize: 40,
    textSize: 24,
    backgroundColor: '#2C2C2C',
    selectedColor: '#4A90E2',
    unselectedColor: '#FFFFFF',
    showButtonNames: true,
    buttons: [
        {
            id: 'home',
            name: 'home.menu.menu',
            showName: true,
            panelPath: 'prefab/panel/HomePanel',
            feedbackType: 'scale',
            enabled: true
        },
        {
            id: 'shop',
            name: 'home.menu.shop',
            showName: true,
            panelPath: 'ui/shop/ShopPanel',
            feedbackType: 'scale',
            enabled: true
        },
        {
            id: 'bag',
            name: 'home.menu.bag',
            showName: true,
            panelPath: 'ui/bag/BagPanel',
            feedbackType: 'scale',
            enabled: false
        },
        {
            id: 'hero',
            name: 'home.menu.hero',
            showName: true,
            panelPath: 'ui/hero/HeroPanel',
            feedbackType: 'scale',
            enabled: true
        }
    ]
};
