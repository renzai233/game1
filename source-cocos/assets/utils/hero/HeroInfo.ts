// 英雄信息面板脚本
// 用于显示英雄的属性、技能、故事等详细信息
import { _decorator, Node, Button, Label, UITransform } from 'cc';
import { UIBase } from '../ui/UIBase';
import { IHero as IHeroData } from './IHero';
import { EDM } from '../data/env/ConfigManager';
import { EngineErrorFix } from './EngineErrorFix';
import { SDM } from '../data/config/skill/SkillDataManager';
import { Skin1UIPolish } from '../ui/skin1/Skin1UIPolish';

const { ccclass, property } = _decorator;

/**
 * 信息面板类型
 */
export type InfoPanelType = 'attributes' | 'skills' | 'story';

@ccclass('HeroInfo')
export class HeroInfo extends UIBase {
    @property({ type: Node, tooltip: '背景节点（可点击关闭）' })
    bgNode: Node = null!;

    @property({ type: Node, tooltip: '内容背景节点' })
    contentBgNode: Node = null!;

    @property({ type: Node, tooltip: '标题标签节点' })
    titleLabelNode: Node = null!;

    @property({ type: Node, tooltip: '内容文本节点' })
    contentLabelNode: Node = null!;

    @property({ type: Node, tooltip: '确定按钮节点' })
    sureButtonNode: Node = null!;

    private _currentHero: IHeroData | null = null;
    private _panelType: InfoPanelType = 'attributes';

    /**
     * 设置背景为全屏尺寸
     */
    private setBgFullScreen(): void {
        if (this.bgNode) {
            const transform = this.bgNode.getComponent(UITransform);
            if (transform) {
                transform.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);
            }
        }
    }

    onLoad() {
        // 设置背景为全屏尺寸
        this.setBgFullScreen();

        // 绑定背景点击关闭事件
        if (this.bgNode) {
            const button = this.bgNode.getComponent(Button);
            if (button) {
                EngineErrorFix.safeAddEventListener(button.node, Button.EventType.CLICK, () => {
                    this.onClose();
                }, this);
            }
        }

        // 绑定确定按钮事件
        if (this.sureButtonNode) {
            const button = this.sureButtonNode.getComponent(Button);
            if (button) {
                EngineErrorFix.safeAddEventListener(button.node, Button.EventType.CLICK, () => {
                    this.onClose();
                }, this);
            }
        }
    }

    /**
     * 显示英雄信息
     * @param hero 英雄数据
     * @param panelType 面板类型
     */
    public showHeroInfo(hero: IHeroData, panelType: InfoPanelType): void {
        this._currentHero = hero;
        this._panelType = panelType;

        // 每次显示英雄信息时都设置背景为全屏尺寸
        // 因为可能通过直接调用 showHeroInfo 而不是 show 方法来显示
        this.setBgFullScreen();
        Skin1UIPolish.applyPanel(this.node);

        // 更新标题
        this.updateTitle();

        // 更新内容
        this.updateContent();
    }

    /**
     * 更新标题
     */
    private updateTitle(): void {
        if (!this.titleLabelNode) return;

        const label = this.titleLabelNode.getComponent(Label);
        if (!label) return;

        let titleKey = '';
        switch (this._panelType) {
            case 'attributes':
                titleKey = 'hero.attributes.title';
                break;
            case 'skills':
                titleKey = 'hero.skills.title';
                break;
            case 'story':
                titleKey = 'hero.story.title';
                break;
        }

        const titleText = EDM.getText(titleKey) || this.getDefaultTitle();
        label.string = titleText;
    }

    /**
     * 获取默认标题
     */
    private getDefaultTitle(): string {
        switch (this._panelType) {
            case 'attributes':
                return '英雄属性';
            case 'skills':
                return '英雄技能';
            case 'story':
                return '英雄故事';
            default:
                return '英雄信息';
        }
    }

    /**
     * 更新内容
     */
    private updateContent(): void {
        if (!this.contentLabelNode || !this._currentHero) return;

        const label = this.contentLabelNode.getComponent(Label);
        if (!label) return;

        let content = '';
        switch (this._panelType) {
            case 'attributes':
                content = this.getAttributesContent();
                break;
            case 'skills':
                content = this.getSkillsContent();
                break;
            case 'story':
                content = this.getStoryContent();
                break;
        }

        label.string = content;
    }

    /**
     * 获取属性内容
     */
    private getAttributesContent(): string {
        if (!this._currentHero) return '';

        const attributes = [
            { key: 'hp', name: 'hero.panel.hp', value: this._currentHero.hp },
            { key: 'atk', name: 'hero.panel.attack', value: this._currentHero.atk },
            { key: 'defense', name: 'hero.panel.defense', value: this._currentHero.defense || 0 },
            { key: 'move_speed', name: 'hero.panel.speed', value: this._currentHero.move_speed }
        ];

        let content = '';
        attributes.forEach((attr) => {
            const localizedName = EDM.getText(attr.name) || attr.key;
            content += `${localizedName}: ${attr.value}\n`;
        });

        return content.trim();
    }

    /**
     * 获取技能内容
     */
    private getSkillsContent(): string {
        if (!this._currentHero) return '';

        const skillIds = this._currentHero.skills || [];
        if (skillIds.length === 0) {
            return EDM.getText('hero.skills.no_skills') || '暂无技能';
        }

        let content = '';
        skillIds.forEach((skillId, index) => {
            // 通过 skillId 获取技能数据
            const skillData = SDM.getSkillList().find(skill => skill.id === skillId);
            // 使用技能的英文名称（url字段）来构建本地化键
            const skillUrl = skillData?.url || String(skillId);
            const skillName = EDM.getText(`skill.${skillUrl}.name`) || skillData?.name || String(skillId);
            const skillDesc = EDM.getText(`skill.${skillUrl}.desc`) || skillData?.desc || '技能描述';
            content += `${skillName}(等级${skillData?.level}):\n${skillDesc}\n\n`;
        });

        return content.trim();
    }

    /**
     * 获取故事内容
     */
    private getStoryContent(): string {
        if (!this._currentHero) return '';

        const storyText = EDM.getText(`hero.${this._currentHero.id}.story`) ||
            this._currentHero.story ||
            EDM.getText('hero.story.default') ||
            '暂无故事';

        return storyText;
    }

    /**
     * 关闭按钮点击事件
     */
    private onClose(): void {
        this.hide();
    }

    /**
     * 重写show方法，确保每次显示时都设置背景为全屏尺寸
     */
    public async show(data?: any): Promise<void> {
        await super.show(data);
        // 在显示后立即设置背景为全屏尺寸，使用scheduleOnce确保在下一帧执行
        this.scheduleOnce(() => {
            this.setBgFullScreen();
        }, 0);
    }

    /**
     * 节点激活时回调（每次显示时都会调用）
     */
    protected onEnable(): void {
        // 每次节点激活时都设置背景为全屏尺寸
        this.setBgFullScreen();
    }

    /**
     * 自适应回调（每次显示时都会调用）
     */
    protected onResize(): void {
        // 每次自适应时都设置背景为全屏尺寸
        this.setBgFullScreen();
    }

    /**
     * UI显示时回调
     */
    protected onShow(data?: any): void {
        // 每次显示时都设置背景为全屏尺寸
        this.setBgFullScreen();

        // 如果传入了数据，更新当前英雄和面板类型
        if (data && (data as any).hero && (data as any).panelType) {
            const heroData = (data as any).hero as IHeroData;
            const panelType = (data as any).panelType as InfoPanelType;
            this.showHeroInfo(heroData, panelType);
        } else if (this._currentHero) {
            // 没有新数据但已有英雄数据时，刷新显示
            this.updateTitle();
            this.updateContent();
        }
    }

    /**
     * UI隐藏时回调
     */
    protected onHide(): void {
        this._currentHero = null;
        this._panelType = 'attributes';
    }
}
