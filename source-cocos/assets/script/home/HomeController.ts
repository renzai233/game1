// assets/scripts/controller/HomeController.ts
import { _decorator, Button, director, EventTouch, instantiate, Label, Node, Prefab, AudioSource, Vec3, Color, UITransform, Graphics } from 'cc';
import { MessageController } from '../../plays/panels/MessageController';
import { APM } from '../../utils/common/AudioPlayManager';
import { UIBase, UIGroup } from '../../utils/ui/UIBase';
import { UIManager } from '../../utils/ui/UIManager';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { NavigationUtils } from '../../utils/navigation/NavigationUtils';
import { CDM, CurrencyType } from 'db://assets/utils/common/CurrencyManager';
import { LevelHomeManager } from '../../modules/level/select/LevelHomeManager';
import { LevelConfiger } from '../../modules/level/select/LevelConfiger';
import { PDM } from '../../utils/data/config/player/PlayerDataManager';
import { ResourceManager } from '../../utils/data/config/manager/ResourceManager';
import { offlineRewardService } from '../../modules/offline/OfflineRewardService';
import { UnitDataLoader } from '../core/UnitDataLoader';
import { MonsterController } from '../core/prefab/MonsterController';
import { ensureHomeRuntime } from './shared/composition';
import {
    canAddShortcut,
    canShareAppMessage,
    canShowDouyinSidebarEntry,
    getPlatformTarget,
} from '../shared/sdk';
import { prepareGameSession } from '../../utils/game/prepareGameSession';
import { ShortcutRewardManager } from '../../modules/task/shortcut/ShortcutRewardManager';
import { gameBus } from '../../utils/signal/GameBus';
import { SIGNAL_TYPES } from '../../utils/signal/ISignal';
import { Skin1UIPolish } from '../../utils/ui/skin1/Skin1UIPolish';
import { GuideManager } from '../../utils/guide/GuideManager';

const { ccclass, property } = _decorator;

@ccclass('HomeController')
export class HomeController extends UIBase {
    // ------------- 预制体属性区 -------------
    @property(Label)
    gameName: Label;
    @property(Prefab)
    messagePrefab: Prefab;

    // ------------- 节点属性区 -------------
    @property(Node)
    levelNode: Node;

    @property(Node)
    dyBtnNode: Node | null = null;

    @property(Node)
    sharingBtnNode: Node | null = null;

    @property(Node)
    shortcutBtnNode: Node | null = null;

    @property(Node)
    restoreStaminaBtnNode: Node | null = null;

    private levelHomeManager: LevelHomeManager = new LevelHomeManager();
    private wxTools: any;
    private isGameDataInitialized: boolean = false;
    private _onCloseAllPopupsHandler: (() => void) | null = null;
    private _onShortcutRewardStateChangedHandler: (() => void) | null = null;
    private _onCurrencyChangedHandler: (() => void) | null = null;

    /**
     * 生命周期方法
     */
    async start() {
        ensureHomeRuntime(this.node);
        this.initUI();
        await this.initData();
        GuideManager.instance.checkAndStartHomeGuide(this);
        this.initListener();
    }

    // 初始化数据
    private async initData() {
        this.gameName.string = EDM.config.gameName;
        this.applyGameNameStyle();
        await this.initGameData();
    }

    private applyGameNameStyle() {
        if (!this.gameName) return;
        this.gameName.fontSize = 48;
        this.gameName.lineHeight = 58;
        this.gameName.overflow = Label.Overflow.SHRINK;
        this.gameName.enableOutline = true;
        this.gameName.outlineColor = new Color(17, 19, 32, 220);
        this.gameName.outlineWidth = 4;

        const transform = this.gameName.node.getComponent(UITransform);
        if (transform) {
            transform.setContentSize(420, 72);
        }
    }

    private createSkin1Panel(parent: Node, name: string, width: number, height: number, x: number, y: number, radius = 16): Node {
        const node = new Node(name);
        node.setPosition(x, y, 0);
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height);
        const graphics = node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = new Color(9, 12, 34, 126);
        graphics.strokeColor = new Color(67, 220, 255, 148);
        graphics.lineWidth = 2;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(176, 86, 255, 96);
        graphics.lineWidth = 1;
        graphics.roundRect(-width / 2 + 8, -height / 2 + 8, width - 16, height - 16, Math.max(4, radius - 8));
        graphics.stroke();
        return node;
    }

    private createSkin1Label(parent: Node, text: string, width: number, height: number, x: number, y: number, fontSize: number, color = new Color(234, 250, 255, 255), bold = false): Label {
        const node = new Node('Label');
        node.setPosition(x, y, 0);
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.25);
        label.color = color;
        label.isBold = bold;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 190);
        label.outlineWidth = bold ? 2 : 1;
        return label;
    }

    private applySkin1HomePolish(): void {
        if (this.node.getChildByName('Skin1HomeOverlay')) return;
    }



    // 初始化游戏数据
    private async initGameData() {
        if (EDM.isDev()) console.log('[HomeController] 开始初始化游戏数据');

        // 如果已经初始化过，直接返回
        if (this.isGameDataInitialized) {
            if (EDM.isDev()) console.log('[HomeController] 游戏数据已经初始化，跳过');
            return;
        }

        try {
            // 等待一帧确保节点完全初始化
            await new Promise(resolve => setTimeout(resolve, 0));

            // 检查必要节点
            if (!this.levelNode) {
                if (EDM.isDev()) console.error('[HomeController] levelNode 为空，无法初始化关卡管理器');
                return;
            }

            // 初始化LevelConfiger
            LevelConfiger.init();

            // 初始化关卡管理器
            this.levelHomeManager.init(this.levelNode);
            // 初始化关卡显示
            await this.initLevel(PDM.getCurrentLevel());
            // 标记为已初始化
            this.isGameDataInitialized = true;

            void this.initOfflineRewards();

        } catch (error) {
            if (EDM.isDev()) if (EDM.isDev()) console.error('[HomeController] 初始化游戏数据失败:', error);
            // 降级处理：显示错误信息但不中断游戏
            this.showErrorMessage('游戏数据初始化失败，但您可以继续游戏');
        }
    }

    private async initOfflineRewards() {
        try {
            await offlineRewardService.preparePreview();
            await this.initPatrolMonster();
        } catch (error) {
            if (EDM.isDev()) console.error('[HomeController] 初始化挂机收益失败:', error);
        }
    }

    private async initPatrolMonster() {
        try {
            const scene = director.getScene();
            const patrolNode = scene.getChildByName('Canvas')!.getChildByName('Patrol')!;

            const monster1Node = patrolNode.getChildByName('Monster1')!;
            const monster1Ctrl = monster1Node.getComponent(MonsterController)!;
            const monster1Data = await UnitDataLoader.loadUnitData(117, 'monster');
            await monster1Ctrl.init(monster1Data, true);
            const monster1Scale = monster1Node.scale;
            monster1Node.setScale(new Vec3(-Math.abs(monster1Scale.x || 1), monster1Scale.y, monster1Scale.z));
            monster1Node.getChildByName('Label')!.active = false;

            const monster2Node = patrolNode.getChildByName('Monster2')!;
            const monster2Ctrl = monster2Node.getComponent(MonsterController)!;
            const monster2Data = await UnitDataLoader.loadUnitData(103, 'monster');
            await monster2Ctrl.init(monster2Data, true);
            const monster2Scale = monster2Node.scale;
            monster2Node.setScale(new Vec3(-Math.abs(monster2Scale.x || 1), monster2Scale.y, monster2Scale.z));
            monster2Node.getChildByName('Label')!.active = false;

            const monster3Node = patrolNode.getChildByName('Monster3')!;
            const monster3Ctrl = monster3Node.getComponent(MonsterController)!;
            const monster3Data = await UnitDataLoader.loadUnitData(118, 'monster');
            await monster3Ctrl.init(monster3Data, true);
            const monster3Scale = monster3Node.scale;
            monster3Node.setScale(new Vec3(-Math.abs(monster3Scale.x || 1), monster3Scale.y, monster3Scale.z));
            monster3Node.getChildByName('Label')!.active = false;
        } catch (error) {
            if (EDM.isDev()) console.error('[HomeController] 初始化巡逻怪物失败:', error);
        }
    }

    // 初始化界面
    private initUI() {
        this.initAudio();
        this.initShortcutButton();
        this.initEnvironmentButtons();
        this.initSharingButton();
        Skin1UIPolish.applyHome(this.node);
        this.preloadPanelResources();
    }

    /**
     * 初始化环境配置相关的按钮
     */
    private initEnvironmentButtons(): void {
        if (this.dyBtnNode) {
            this.dyBtnNode.active = canShowDouyinSidebarEntry();
        }
        if (this.shortcutBtnNode) {
            this.shortcutBtnNode.active = this.canShowShortcutEntry();
        }
        if (this.sharingBtnNode) {
            this.sharingBtnNode.active = this.canShowSharingEntry();
        }
        this.refreshRestoreStaminaButton();
        EDM.initLanguage();
    }

    private initShortcutButton(): void {
        if (!this.shortcutBtnNode) {
            return;
        }

        this.shortcutBtnNode.active = this.canShowShortcutEntry();
    }

    private initSharingButton(): void {
        if (!this.sharingBtnNode) {
            return;
        }

        this.sharingBtnNode.active = this.canShowSharingEntry();
    }

    private canShowSharingEntry(): boolean {
        const templateId = EDM.config.platformFeatures?.douyinShare?.rewardTemplateId?.trim() || '';
        return getPlatformTarget() === 'douyin' && canShareAppMessage() && templateId.length > 0;
    }

    private canShowShortcutEntry(): boolean {
        return getPlatformTarget() === 'douyin'
            && canAddShortcut()
            && !ShortcutRewardManager.instance.hasClaimedReward();
    }

    private canShowRestoreStaminaButton(): boolean {
        if (!EDM.isDev()) {
            return false;
        }

        const currentStamina = CDM.getCurrency(CurrencyType.Stamina) || 0;
        const maxStamina = CDM.getCurrency(CurrencyType.MaxStamina) || 0;
        return maxStamina > 0 && currentStamina < maxStamina;
    }

    /**
     * 初始化音频
     */
    private initAudio() {
        let settingMusic = localStorage.getItem('setting_music');
        let settingEffect = localStorage.getItem('setting_effect');
        if (!settingMusic) localStorage.setItem('setting_music', '1');
        if (!settingEffect) localStorage.setItem('setting_effect', '1');

        // 如果 APM 已经成功初始化并且有常驻音频实例，只需播放 Home 音乐并清除新加载场景里的多余 AudioRoot
        if (APM.hasMusicAudio()) {
            const sceneAudioRoot = director.getScene().getChildByName('AudioRoot');
            if (sceneAudioRoot) {
                sceneAudioRoot.destroy();
            }
            APM.playMusic('audio/bgm/home');
            return;
        }

        let audioRoot = director.getScene().getChildByName('AudioRoot');
        if (!audioRoot) {
            audioRoot = new Node('AudioRoot');
            director.getScene().addChild(audioRoot);
        }

        let audioSource = audioRoot.getComponent(AudioSource);
        if (!audioSource) {
            audioSource = audioRoot.addComponent(AudioSource);
        }

        director.addPersistRootNode(audioRoot);
        APM.init(audioSource);
        APM.playMusic('audio/bgm/home');
    }

    /**
     * 预加载面板资源
     * 在主页加载完成后，异步预加载英雄面板、背包面板和商店面板的资源
     * 避免用户点击时出现加载延迟
     */
    private preloadPanelResources(): void {
        if (EDM.isDev()) console.log('[HomeController] 开始预加载面板资源...');

        this.scheduleOnce(async () => {
            try {
                const resourceManager = ResourceManager.getInstance();

                if (EDM.config.resourcePreload) {
                    resourceManager.initPreloadConfig(EDM.config.resourcePreload);
                }

                if (EDM.config.resourcePreload?.enableProgressDisplay?.enabled) {
                    resourceManager.onPreloadProgress((progress) => {
                        if (EDM.isDev()) console.log(`[HomeController] 预加载进度: ${progress.percentage}% (${progress.loaded}/${progress.total})`);
                        if (progress.currentTask) {
                            if (EDM.isDev()) console.log(`[HomeController] 当前任务: ${progress.currentTask}`);
                        }
                    });
                }

                await resourceManager.preloadPanelResources();
                if (EDM.isDev()) console.log('[HomeController] 面板资源预加载完成');
            } catch (error) {
                if (EDM.isDev()) console.error('[HomeController] 面板资源预加载失败:', error);
            }

            try {
                await UIManager.instance.preloadNavigationPanels();
                if (EDM.isDev()) console.log('[HomeController] 导航栏面板预制体预加载完成');
            } catch (error) {
                if (EDM.isDev()) console.error('[HomeController] 导航栏面板预制体预加载失败:', error);
            }
        }, 1.0);
    }

    /**
     * 初始化监听
     */
    private initListener() {
        this.listenUIEvents();
        this.listenShortcutRewardState();
        this.listenCurrencyChanges();
    }

    private listenUIEvents() {
        if (!this._onCloseAllPopupsHandler) {
            this._onCloseAllPopupsHandler = this.onCloseAllPopups.bind(this);
        }
        UIManager.instance.eventBus.on('closeAllPopups', this._onCloseAllPopupsHandler);
    }

    private listenShortcutRewardState(): void {
        if (!this._onShortcutRewardStateChangedHandler) {
            this._onShortcutRewardStateChangedHandler = this.refreshShortcutButton.bind(this);
        }
        gameBus.on(SIGNAL_TYPES.SHORTCUT_REWARD_STATE_CHANGED, this._onShortcutRewardStateChangedHandler);
    }

    private listenCurrencyChanges(): void {
        if (!this._onCurrencyChangedHandler) {
            this._onCurrencyChangedHandler = this.refreshRestoreStaminaButton.bind(this);
        }
        gameBus.on(SIGNAL_TYPES.CURRENCY_CHANGED, this._onCurrencyChangedHandler);
    }

    private refreshShortcutButton(): void {
        if (!this.shortcutBtnNode) {
            return;
        }

        this.shortcutBtnNode.active = this.canShowShortcutEntry();
    }

    private refreshRestoreStaminaButton(): void {
        if (!this.restoreStaminaBtnNode) {
            return;
        }

        this.restoreStaminaBtnNode.active = this.canShowRestoreStaminaButton();
    }

    /**
     * 初始化关卡信息
     */
    private async initLevel(levelIndex: number): Promise<void> {
        try {
            await this.levelHomeManager.initLevel(levelIndex);
        } catch (error) {
            if (EDM.isDev()) if (EDM.isDev()) console.error('[HomeController] 初始化关卡失败:', error);
            // 降级处理：显示错误信息但不中断游戏
            this.showErrorMessage(`初始化关卡 ${levelIndex + 1} 失败`);
        }
    }

    /**
     * 显示错误消息
     */
    private showErrorMessage(message: string): void {
        try {
            // 只在前台显示错误，不影响游戏流程
            if (EDM?.isDev()) {
                if (EDM.isDev()) if (EDM.isDev()) console.warn('[HomeController] 错误消息:', message);

                // 只在开发环境下显示UI错误提示
                const messagePrefab = instantiate(this.messagePrefab);
                if (messagePrefab && messagePrefab.getComponent(MessageController)) {
                    messagePrefab.getComponent(MessageController).init(`[调试] ${message}`);
                    this.node.addChild(messagePrefab);
                }
            }
        } catch (error) {
            if (EDM.isDev()) if (EDM.isDev()) console.warn('[HomeController] 显示错误消息失败:', error);
        }
    }

    /**
     * 切换关卡，处理上一关/下一关按钮逻辑
     */
    async onChangeLevel(evt: Event, type: string) {
        try {
            const currentLevel = PDM.getCurrentLevel();
            const newLevel = await this.levelHomeManager.changeLevel(currentLevel, type as 'prev' | 'next');
            if (newLevel !== currentLevel) {
                // 适配新关卡
                PDM.setCurrentLevel(newLevel);
                // 切换关卡后，开始异步预加载附近关卡
                LevelConfiger.startAsyncPreload();
            }
        } catch (error) {
            if (EDM.isDev()) if (EDM.isDev()) console.error('[HomeController] 切换关卡失败:', error);
        }
    }

    /**
     * 展示弹窗面板
     */
    showDyPopupPanel() {
        UIManager.instance.openUI('ui/popup/dy/DyPopup', null, true, UIGroup.Popup, 'prefabs');
    }

    /**
     * 展示设置面板
     */
    showSettingsPanel() {
        UIManager.instance.openUI('ui/popup/settings/SettingsPanel', null, true, UIGroup.Popup, 'prefabs');
    }

    /**
     * 开始游戏
     */
    gameStart() {
        const playerData = PDM.getPlayerData();
        if (!playerData) {
            if (EDM.isDev()) console.error('[HomeController] 玩家数据未初始化，无法开始游戏');
            let messagePrefab = instantiate(this.messagePrefab);
            messagePrefab.getComponent(MessageController).init('玩家数据未初始化，请重新加载游戏！');
            this.node.addChild(messagePrefab);
            return;
        }

        if (PDM.getCurrentLevel() > PDM.getLatestLevel()) {
            let messagePrefab = instantiate(this.messagePrefab);
            messagePrefab.getComponent(MessageController).init('完成上一关解锁！');
            this.node.addChild(messagePrefab);
            return;
        }

        const staminaCost = 6;
        if (!CDM.hasEnoughCurrency(CurrencyType.Stamina, staminaCost)) {
            let messagePrefab = instantiate(this.messagePrefab);
            messagePrefab.getComponent(MessageController).init('体力不足！');

            this.node.addChild(messagePrefab);
            return;
        }

        prepareGameSession();
        CDM.subtractCurrency(CurrencyType.Stamina, staminaCost, 'start_game');

        if (this.wxTools) this.wxTools.hideGameClubButton();

        director.loadScene('Game');
    }

    restoreStaminaToFull(): void {
        if (!EDM.isDev()) {
            this.refreshRestoreStaminaButton();
            return;
        }

        const currentStamina = CDM.getCurrency(CurrencyType.Stamina) || 0;
        const maxStamina = CDM.getCurrency(CurrencyType.MaxStamina) || 0;
        if (maxStamina <= 0 || currentStamina >= maxStamina) {
            this.refreshRestoreStaminaButton();
            return;
        }

        CDM.setCurrency(CurrencyType.Stamina, maxStamina, 'dev_restore_stamina');
        PDM.setLastLoginTime(new Date().toISOString());
        this.refreshRestoreStaminaButton();
    }

    /**
     * 关闭所有弹窗
     */
    onCloseAllPopups() {
        UIManager.instance.back();
    }

    /**
     * 组件销毁时清理
     */
    onDestroy() {
        try {
            if (this._onCloseAllPopupsHandler) {
                UIManager.instance.eventBus.off('closeAllPopups', this._onCloseAllPopupsHandler);
            }
            if (this._onShortcutRewardStateChangedHandler) {
                gameBus.off(SIGNAL_TYPES.SHORTCUT_REWARD_STATE_CHANGED, this._onShortcutRewardStateChangedHandler);
            }
            if (this._onCurrencyChangedHandler) {
                gameBus.off(SIGNAL_TYPES.CURRENCY_CHANGED, this._onCurrencyChangedHandler);
            }


            // 清理关卡管理器
            this.levelHomeManager.cleanup();
            // 清理星球预加载器缓存
            LevelConfiger.clearCache();
            // 重置初始化标志
            this.isGameDataInitialized = false;

            NavigationUtils.clearAllReferences();

            if (EDM?.isDev()) if (EDM.isDev()) if (EDM.isDev()) console.log('[HomeController] 组件已销毁，事件监听已清理');
        } catch (error) {
            if (EDM.isDev()) if (EDM.isDev()) console.warn('[HomeController] 销毁时发生错误:', error);
        }
    }

    showDailyTaskPanel(event: any) {
        UIManager.instance.openUI('task/DailyTask', null, true, UIGroup.Popup, 'prefabs');
    }

    showSignInTaskPanel(event: any) {
        UIManager.instance.openUI('task/SignInTask', null, true, UIGroup.Popup, 'prefabs');
    }

    showSharingPanel(event?: any) {
        UIManager.instance.openUI('task/SharingPanel', null, true, UIGroup.Popup, 'prefabs');
    }

    showShortcutPanel(event?: any) {
        if (!this.canShowShortcutEntry()) {
            this.refreshShortcutButton();
            return;
        }

        UIManager.instance.openUI('task/ShortcutPanel', null, true, UIGroup.Popup, 'prefabs');
    }

    showPatrolPanel() {
        UIManager.instance.openUI('game/PatrolPanel', null, true, UIGroup.Popup, 'prefabs');
    }
}
