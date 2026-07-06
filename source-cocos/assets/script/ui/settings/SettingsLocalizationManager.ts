/**
 * 管理福利面板中所有需要本地化的文本元素
 */

import { _decorator, Component, Label, Button } from 'cc';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';

const { ccclass, property } = _decorator;

@ccclass('SettingsLocalizationManager')
export class SettingsLocalizationManager extends Component {
    // 面板标题
    @property(Label)
    titleLabel: Label | null = null;

    // 本地化标签数组（只包含标题等固定元素）
    private localizedLabels: Array<{ label: Label | null; key: string }> = [];

    start() {
        this.initLocalizedElements();
        this.updateAllTexts();
    }

    /**
     * 初始化本地化元素
     */
    private initLocalizedElements(): void {
        // 初始化标签数组（只包含固定元素）
        this.localizedLabels = [
            { label: this.titleLabel, key: 'settings.title' }
        ];
    }

    /**
     * 更新所有文本
     */
    public updateAllTexts(): void {
        // 更新固定标签文本
        this.localizedLabels.forEach(item => {
            this.refreshLabel(item.label, item.key);
        });

        // 更新动态生成的设置项目文本
        this.refreshDynamicSettingsItems();

        console.log('✅ SettingsPanel 本地化更新完成');
    }

    /**
     * 刷新标签文本
     */
    private refreshLabel(label: Label | null, key: string): void {
        if (label) {
            const text = EDM.getText(key);
            if (text) {
                label.string = text;
            }
        }
    }

    /**
     * 刷新动态生成的设置项目文本
     */
    private refreshDynamicSettingsItems(): void {
        // 查找所有SettingsItemController组件
        const settingsItems = this.node.getComponentsInChildren('SettingsItemController');
        
        settingsItems.forEach(itemController => {
            // 调用每个设置项目的刷新方法
            if (typeof (itemController as any).refreshLocalization === 'function') {
                (itemController as any).refreshLocalization();
            }
        });

        console.log(`🔄 刷新了 ${settingsItems.length} 个设置项目`);
    }

    /**
     * 切换语言
     */
    public switchLanguage(lang: string): void {
        EDM.setLanguage(lang as any);
        this.updateAllTexts();
    }

    /**
     * 测试本地化功能
     */
    public testLocalization(): void {
        console.log('🧪 测试 SettingsPanel 本地化功能:');
        console.log(`  标题: ${EDM.getText('settings.title')}`);
        console.log(`  音乐: ${EDM.getText('settings.music')}`);
        console.log(`  音效: ${EDM.getText('settings.sound')}`);
        console.log(`  语言: ${EDM.getText('settings.language')}`);
        console.log(`  开: ${EDM.getText('settings.panel.on')}`);
        console.log(`  关: ${EDM.getText('settings.panel.off')}`);
    }

    /**
     * 手动刷新所有设置项目（供外部调用）
     */
    public refreshAllSettingsItems(): void {
        this.refreshDynamicSettingsItems();
    }
} 