import { director, Node } from 'cc';
import { GuideLayer } from './GuideLayer';
import { HomeController } from '../../script/home/HomeController';
import { GameController } from '../../plays/play01/GameController';
import { SkillPanelController } from '../skill/controller/SkillPanelController';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';

export class GuideManager {
    private static _instance: GuideManager | null = null;
    
    public static get instance(): GuideManager {
        if (!this._instance) {
            this._instance = new GuideManager();
        }
        return this._instance;
    }

    private _guideLayer: GuideLayer | null = null;
    private _isHomeGuideRunning = false;
    private _isGameGuideRunning = false;
    
    private readonly STORAGE_KEYS = {
        HOME_GUIDE: 'guide_home_completed_v1',
        LEVEL1_GUIDE: 'guide_level1_completed_v1'
    };

    private isGuideSeen(storageKey: string): boolean {
        try {
            return localStorage.getItem(storageKey) === '1';
        } catch (error) {
            console.warn('[GuideManager] Failed to read guide flag:', storageKey, error);
            return false;
        }
    }

    private markGuideSeen(storageKey: string): void {
        try {
            localStorage.setItem(storageKey, '1');
        } catch (error) {
            console.warn('[GuideManager] Failed to write guide flag:', storageKey, error);
        }
    }

    /**
     * Get or create the GuideLayer component in the active scene's Canvas
     */
    private getOrCreateGuideLayer(): GuideLayer | null {
        const activeScene = director.getScene();
        if (!activeScene) return null;

        const canvas = activeScene.getChildByName('Canvas');
        if (!canvas) {
            console.warn('[GuideManager] Canvas not found in scene');
            return null;
        }

        let guideLayerNode = canvas.getChildByName('NewbieGuideLayer');
        if (!guideLayerNode) {
            guideLayerNode = new Node('NewbieGuideLayer');
            canvas.addChild(guideLayerNode);
        }

        // Set to top index
        guideLayerNode.setSiblingIndex(canvas.children.length - 1);

        let guideLayer = guideLayerNode.getComponent(GuideLayer);
        if (!guideLayer) {
            guideLayer = guideLayerNode.addComponent(GuideLayer);
        }

        this._guideLayer = guideLayer;
        return guideLayer;
    }

    // ==========================================
    // HOME SCENE GUIDE
    // ==========================================

    public checkAndStartHomeGuide(homeController: HomeController) {
        if (this.isGuideSeen(this.STORAGE_KEYS.HOME_GUIDE)) {
            console.log('[GuideManager] Home scene guide already completed');
            return;
        }

        console.log('[GuideManager] Starting Home scene guide...');
        this.markGuideSeen(this.STORAGE_KEYS.HOME_GUIDE);
        this._isHomeGuideRunning = true;
        
        // Wait slightly for UI to settle
        setTimeout(() => {
            this.startHomeGuideFlow(homeController);
        }, 300);
    }

    private startHomeGuideFlow(homeController: HomeController) {
        const guideLayer = this.getOrCreateGuideLayer();
        if (!guideLayer) return;

        // Step 1: Explain the threat, click Start Game button
        const startBtnNode = this.findNodeByPath('Canvas/Start');
        if (!startBtnNode) {
            console.error('[GuideManager] Start button node not found in Home scene');
            this.completeHomeGuide();
            return;
        }

        const gameName = EDM?.config?.gameName || '游戏';
        guideLayer.showStep({
            targetNode: startBtnNode,
            text: `欢迎来到${gameName}！怪物们正大举入侵，城堡防线岌岌可危！快点击开始游戏，筑起我们坚固的防线吧！`,
            direction: 'up',
            isClickTarget: true,
            callback: () => {
                console.log('[GuideManager] Start button clicked, completing Home guide');
                this.completeHomeGuide();
            }
        });
    }

    private completeHomeGuide() {
        this.markGuideSeen(this.STORAGE_KEYS.HOME_GUIDE);
        this._isHomeGuideRunning = false;
        if (this._guideLayer) {
            this._guideLayer.hide();
        }
    }

    // ==========================================
    // GAME SCENE GUIDE (LEVEL 1)
    // ==========================================

    public checkAndStartGameGuide(gameController: GameController) {
        if (this.isGuideSeen(this.STORAGE_KEYS.LEVEL1_GUIDE)) {
            console.log('[GuideManager] Level 1 battle guide already completed');
            this._isGameGuideRunning = false;
            return;
        }

        console.log('[GuideManager] Starting Level 1 game guide...');
        this.markGuideSeen(this.STORAGE_KEYS.LEVEL1_GUIDE);
        this._isGameGuideRunning = true;
    }

    /**
     * Called when the Skill Panel opens (usually at the very start of level 1)
     */
    public onSkillPanelOpened(skillPanelController: SkillPanelController) {
        if (!this._isGameGuideRunning) return;

        // Wait a frame for cards to populate
        setTimeout(() => {
            this.showSkillPanelGuideStep(skillPanelController);
        }, 100);
    }

    private showSkillPanelGuideStep(skillPanelController: SkillPanelController) {
        const guideLayer = this.getOrCreateGuideLayer();
        if (!guideLayer) return;

        // The skill panel contains skill cards inside Node named "Main"
        const mainNode = skillPanelController.node.getChildByName('Main');
        if (!mainNode || mainNode.children.length === 0) {
            console.warn('[GuideManager] Skill card containers/cards not found');
            return;
        }

        // Force select the first card
        const firstCardNode = mainNode.children[0];
        const allBtnNode = skillPanelController.getAllBtn?.node;

        guideLayer.showStep({
            targetNode: firstCardNode,
            targetNodes: allBtnNode ? [allBtnNode] : [],
            handTargetNode: allBtnNode,
            text: '选择你的第一个英雄卡牌！我们非常推荐点击下方的【全都要】免费获取全部卡牌，大幅增强战力！',
            direction: 'down',
            isClickTarget: true,
            callback: () => {
                console.log('[GuideManager] First skill/hero or all selected');
                this.showPostSkillSelectGuide();
            }
        });
    }

    private showPostSkillSelectGuide() {
        const guideLayer = this.getOrCreateGuideLayer();
        if (!guideLayer) return;

        // Step 2: Show the health bar / wall and explain it
        const wallNode = this.findNodeByPath('Canvas/Wall');
        
        guideLayer.showStep({
            targetNode: wallNode,
            text: '这是我们的城堡城墙！防守住怪物的进攻，不要让城墙的生命值归零！',
            direction: 'up',
            isClickTarget: false, // Click anywhere/Next to continue
            callback: () => {
                this.showExpBarGuideStep();
            }
        });
    }

    private showExpBarGuideStep() {
        const guideLayer = this.getOrCreateGuideLayer();
        if (!guideLayer) return;

        // Step 3: Explain HP/Exp and wrap up
        const expBarNode = this.findNodeByPath('Canvas/BottomUI/ExpBar') || this.findNodeByPath('Canvas/ExpBar');

        guideLayer.showStep({
            targetNode: expBarNode,
            text: '消灭怪物可以获得经验。经验条满时会升级并能选择更多强力技能！现在，祝你好运，战斗吧！',
            direction: 'up',
            isClickTarget: false, // Click anywhere to finish
            callback: () => {
                this.completeGameGuide();
            }
        });
    }

    private completeGameGuide() {
        this.markGuideSeen(this.STORAGE_KEYS.LEVEL1_GUIDE);
        this._isGameGuideRunning = false;
        if (this._guideLayer) {
            this._guideLayer.hide();
        }
        console.log('[GuideManager] Level 1 battle guide complete!');
    }

    // ==========================================
    // UTILITY METHODS
    // ==========================================

    private findNodeByPath(path: string): Node | null {
        const activeScene = director.getScene();
        if (!activeScene) return null;
        return activeScene.getChildByPath(path);
    }
}
