import { _decorator, Color, Component, instantiate, Label, Node, Prefab, ProgressBar, SpriteFrame, Vec3, view, UIOpacity, Sprite, UITransform, director, tween } from 'cc';
import { LDM } from '../../modules/level/config/LevelDataManager';
import { levelService } from '../../modules/level/play/LevelService';
import { UnitFactory } from '../../script/core/UnitFactory';
import { HeroController } from '../../script/core/prefab/HeroController';
import { popupManager } from '../../script/ui/popup/PopupManager';
import { GAME_PAUSE_REASONS, gameBus } from '../../utils/signal/GameBus';
import { MapManager, MapTheme } from '../../script/ui/background/Map/MapManager';
import { ObjectPool } from '../../utils/common/ObjectPool';
import { UnitDataLoader } from '../../script/core/UnitDataLoader';
import { CDM, CurrencyType } from '../../utils/common/CurrencyManager';
import { UNIT_TYPE } from '../../utils/data/dict/base/UnitAttrList';
import { UIAnimationManager } from '../../utils/ui/UIAnimationManager';
import { ISkill, SkillIconController, SkillManager, SkillPanelController } from 'db://assets/utils/skill';
import { SpeedBoostManager } from '../../utils/common/SpeedBoostManager';
import { DamageBoostManager } from '../../utils/common/DamageBoostManager';
import { loadResSingleAsset } from '../../utils/utils';
import { EDM } from '../../utils/data/env/ConfigManager';
import { SIGNAL_TYPES } from '../../utils/signal/ISignal';
import { PDM } from '../../utils/data/config/player/PlayerDataManager';
import { MDM } from '../../utils/data/config/monster/MonsterDataManager';
import { HDM } from '../../utils/data/config/hero/HeroDataManager';
import { applySpeedScale, GameData } from '../../utils/data/config/manager/GameDataManager';
import { SDM } from '../../utils/data/config/skill/SkillDataManager';
import { VictoryPanelController } from '../panels/VictoryPanelController';
import { ExitPanelController } from '../panels/ExitPanelController';
import { LosePanelController } from '../panels/LosePanelController';
import { MonsterRarity } from '../../modules/level/config/ILevel';
import { HelpLayerController } from '../../utils/guide/HelpLayerController';
import { GuideManager } from '../../utils/guide/GuideManager';
import { getLaunchContext } from '../../script/shared/sdk';
import { safeDisablePhysics2D } from '../../utils/physics/SafePhysics2D';
// OPS_JIANJIAN_2026_05: temporary hero-7 operation rule import.
import { JianjianBattleRule } from './ops/JianjianBattleRule';
import { APM } from '../../utils/common/AudioPlayManager';
const { ccclass, property } = _decorator;
const JIANJIAN_OPS_FLEE_FADE_SECONDS = 2;
const BATTLE_PROGRESS_WIDTH = 560;
const BATTLE_PROGRESS_TOTAL = 532;
const BATTLE_PROGRESS_BG_HEIGHT = 54;
const BATTLE_PROGRESS_BAR_HEIGHT = 40;
const BATTLE_PROGRESS_BG_PATH = 'textures/ui/progress/pb-bg/spriteFrame';
const BATTLE_EXP_BAR_PATH = 'textures/ui/progress/pb-exp/spriteFrame';
const BATTLE_HP_BAR_PATH = 'textures/ui/progress/pb-health/spriteFrame';

/**
 * GameController 游戏主控制器
 * 负责整个游戏场景的初始化、主流程控制、英雄与怪物的生成、经验与血量管理等。
 * 本脚本挂载在Game场景主节点。
 * 
 * 主要功能：
 * - 初始化游戏场景的所有内容（英雄、怪物、道具栏、经验条、血量条等）
 * - 控制怪物的生成与波次推进
 * - 处理玩家升级、胜利、失败等核心流程
 * - 管理游戏内的各种UI和数据
 */
@ccclass('GameController')
export class GameController extends Component {
    // ------------- 预制体属性区 -------------
    // 这些是在编辑器里拖拽赋值的资源引用，比如英雄、怪物、道具等模板
    @property(Prefab)
    heroPrefab: Prefab; // 英雄预制体（玩家操控的主角）
    @property(Prefab)
    monsterPrefab: Prefab; // 怪物预制体（敌人）
    @property(Prefab)
    skillEffectPrefab: Prefab; // 子弹预制体（攻击用的子弹）
    @property(Prefab)
    skillPanelPrefab: Prefab; // 技能面板预制体（升级时弹出的技能选择）
    @property(Prefab)
    victoryPanelPrefab: Prefab; // 胜利结算面板预制体
    @property(Prefab)
    losePanelPrefab: Prefab; // 游戏失败面板预制体
    @property(Prefab)
    exitPanelPrefab: Prefab; // 退出游戏面板预制体
    @property(Prefab)
    skillIconPrefab: Prefab;

    // ------------- 重要节点属性区 -------------
    // 这些节点用于显示英雄、怪物、经验条、血量等UI
    @property(Node)
    fightAreaNode: Node; // 战斗区域节点（怪物会被加到这里）
    @property(Node)
    expBarNode: Node; // 经验条节点（显示等级和经验进度）
    @property(Node)
    HPNode: Node; // HP节点（显示血量）
    @property(Node)
    wallNode: Node; // 城墙节点
    @property(Node)
    skillBarNode: Node;
    @property(Node)
    hero01Node: Node;
    @property(Node)
    hero02Node: Node;
    @property(Node)
    hero03Node: Node;
    @property(Node)
    hero04Node: Node;
    @property(Node)
    hero05Node: Node;
    @property(Node)
    bgNode: Node;

    // ------------- UI组件引用 -------------
    private _hpBar: ProgressBar;
    private _hpLabel: Label;
    private _expBarPolished = false;
    private _hpBarPolished = false;

    // --- Event Handlers ---
    private _gameOverHandler: (result: string) => void;
    private _wallHpUpdateHandler: (data: { currentHp: number; maxHp: number }) => void;
    private _skillLearnedHandler: (data: { skill: ISkill, heroId: number }) => void;

    // ------------- 游戏运行时数据区 -------------
    _playTime: number = 0; // 游玩时间（单位：秒）
    _playTimeInter: number = 0; // 游玩时间间隔（用于计时）

    levelData: object = {}; // 当前关卡数据（包括怪物、波次等信息）
    monsters = []; // 当前波次待生成的怪物id数组
    heroData: object = {}; // 当前英雄数据
    curWave: number = 1; // 当前波次，默认从1开始
    _monsterGenTime: number = 0; // 生成怪物的时间间隔计数
    _intervalTime: number = 0; // 每波之间的间隔计数
    _fightAreaW: number = 750; // 战斗区域宽度
    _fightAreaH: number = 1100; // 战斗区域高度

    canNormalAttack: boolean = false; // 是否可以进行普通攻击
    _normalAttackGenTime: number = 0; // 普通攻击生成间隔
    _cooldownLeft: object = {}; // 记录所有子弹的技能冷却

    _heroNodesMap: { [key: number]: Node } = {}; // 用于记录heroId到节点的映射
    private _skillIcons: { [key: string]: Node } = {};
    private _allSkills: any[]; // 用于缓存远程技能列表
    private _heroPositionMap: { [heroId: number]: number } = {}; // 记录英雄的位置索引
    private _monsterPool: ObjectPool<Node>;
    private _victoryShown: boolean = false; // 防止重复显示胜利面板
    private _monsterDeathTracker: Set<string> = new Set(); // 跟踪已死亡的怪物，防止重复计数
    private _monsterIdCounter: number = 0; // 怪物ID计数器
    private _helpLayerController: HelpLayerController | null = null;
    // OPS_JIANJIAN_2026_05: visual-only fade state after logical FLEE removal.
    private _jianjianOpsFadingHeroIds = new Set<number>();
    // OPS_JIANJIAN_2026_05: GameController owns this battle-local operation state.
    private _jianjianBattleRule = new JianjianBattleRule({
        removeJianjianOpsHeroFromField: (heroId: number) => this.removeJianjianOpsHeroFromField(heroId),
    });

    // 战斗开始时的货币状态记录
    private _battleStartCurrencies: any = {}; // 记录战斗开始时的货币状态
    private _gameResPath: string = 'textures/ui/game/levels/';
    private _runtimeManagersInitialized: boolean = false;

    async start() {
        APM.playMusic('audio/bgm/game');
        this.initHelpLayerController();
        await this.initData();
        await this.initUI();
        this.initListener();
        GuideManager.instance.checkAndStartGameGuide(this);
    }

    /** 数据相关初始化 */
    async initData() {
        await this.ensureRuntimeManagers();
        this.initGameData();
        this.initObjectPools();
        await this.initHeroesData();
        this.getMonsterData();

        // 初始化经济系统集成器
        try {
            // 初始化经济系统 - 使用统一的CurrencyManager
            console.log('[GameController] 经济系统已通过CurrencyManager统一管理');

            // 在经济系统初始化完成后记录战斗开始时的货币状态
            this.recordBattleStartCurrencies();
        } catch (error) {
            console.error('[GameController] 经济系统集成器初始化失败:', error);
            // 即使初始化失败也要记录货币状态（使用默认值）
            this.recordBattleStartCurrencies();
        }
    }

    private async ensureRuntimeManagers(): Promise<void> {
        if (this._runtimeManagersInitialized) return;

        try {
            await EDM.init();
            await MDM.initialize();
            await HDM.initialize();
            await SDM.initialize();
            await PDM.initialize();
            await LDM.initialize();
            await CDM.init();
            this._runtimeManagersInitialized = true;
            console.log('[GameController] 运行时数据管理器初始化完成');
        } catch (error) {
            console.error('[GameController] 运行时数据管理器初始化失败:', error);
        }
    }

    private getSafeCurrentLevel(): number {
        const levelIndex = Number(PDM.getCurrentLevel());
        if (Number.isFinite(levelIndex) && levelIndex >= 1) {
            return levelIndex;
        }
        console.warn('[GameController] 当前关卡无效，使用第1关兜底:', levelIndex);
        return 1;
    }

    /** UI相关初始化 */
    async initUI() {
        this.loadGameMapBackground();  // 加载游戏地图背景  
        // this.renderGameMapBackground();  // 柏林噪声渲染游戏地图背景
        this.initExpBar();
        this.initHPBar();
        await this.initHeroesUI();
        this.initUIAnimationManager(); // 初始化UI动画管理器
    }

    /** 监听相关初始化 */
    initListener() {
        this.bindEvents();
    }

    /**
     * 初始化UI动画管理器
     */
    private initUIAnimationManager() {
        // 确保UIAnimationManager被添加到当前节点
        if (!this.node.getComponent(UIAnimationManager)) {
            this.node.addComponent(UIAnimationManager);
            console.log('[GameController] UIAnimationManager 已添加到场景');
        } else {
            console.log('[GameController] UIAnimationManager 已存在');
        }
    }

    private initHelpLayerController() {
        const scene = director.getScene();
        const canvas = scene?.getChildByName('Canvas') ?? this.node;
        const helpLayer = canvas?.getChildByName('HelpLayer') ?? null;
        if (!helpLayer) {
            this._helpLayerController = null;
        } else {
            this._helpLayerController = helpLayer.getComponent(HelpLayerController) ?? helpLayer.addComponent(HelpLayerController);
            this._helpLayerController?.hide();
        }

    }

    /**
     * 从英雄列表中随机抽取指定数量的不重复英雄
     * @param list 原始英雄列表
     * @param count 要抽取的数量
     * @returns 随机抽取的英雄数组
     */
    private randomPickHeroes(list: any[], count: number) {
        // 1. 创建原数组的副本，避免修改原始数据
        const copyList = [...list];
        // 2. Fisher-Yates 洗牌算法：随机打乱数组
        for (let i = copyList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copyList[i], copyList[j]] = [copyList[j], copyList[i]];
        }
        if (EDM.isDev()) console.log("randomPickHeroes ========= ", copyList.slice(0, count));
        // 3. 截取前count个元素（若数组长度不足count，则返回全部）
        return copyList.slice(0, count);
    };

    /** 游戏数据初始化（如GameData.heroes等） */
    initGameData() {
        // OPS_JIANJIAN_2026_05: reset battle-local operation state.
        this._jianjianBattleRule.reset();
        this._jianjianOpsFadingHeroIds.clear();
        if (!GameData.heroes || GameData.heroes.length === 0) {
            GameData.heroes = this.randomPickHeroes(HDM.getHeroList(), 5).map(h => h);
        }
        GameData.heroOnField = [];
        this.curWave = 1;
        this._playTime = 0;
        this._playTimeInter = 0;
        this._victoryShown = false; // 重置胜利显示标志
        this._monsterDeathTracker.clear(); // 清空死亡跟踪器
        this._monsterIdCounter = 0; // 重置怪物ID计数器
        // ...其它数据初始化...
        SpeedBoostManager.init(); // 初始化游戏加速管理器
        DamageBoostManager.init(); // 初始化游戏伤害加成管理器
    }

    /** 对象池初始化，预生成一批对象 */
    initObjectPools() {
        // 怪物对象池
        this._monsterPool = new ObjectPool<Node>(() => instantiate(this.monsterPrefab), 50);
        for (let i = 0; i < 20; i++) this._monsterPool.put(instantiate(this.monsterPrefab));
        // 技能特效对象池
        SkillManager.initObjectPools(this.skillEffectPrefab, this.skillEffectPrefab);
        // 可在SkillEffectController里也预生成一批
    }

    /** 英雄数据初始化（如节点映射、位置等） */
    async initHeroesData() {
        this._heroNodesMap = {};
        this._heroPositionMap = {};
        this._jianjianOpsFadingHeroIds.clear();
        // ...如有其它数据初始化...
    }

    /** 英雄UI初始化（创建节点、挂载到场景） */
    async initHeroesUI() {
        // 清理旧节点
        this.fightAreaNode.children.forEach(node => {
            if (node.getComponent(HeroController)) {
                safeDisablePhysics2D(node, true);
                node.destroy();
            }
        });
        if (!GameData.heroes || GameData.heroes.length === 0) return;
        for (const hero of GameData.heroes) {
            const heroNode = await UnitFactory.createUnit(hero.id, UNIT_TYPE.HERO, this.heroPrefab, this.skillEffectPrefab);
            if (!heroNode) continue;
            heroNode.active = false;
            let uiOpacity = heroNode.getComponent(UIOpacity) || heroNode.addComponent(UIOpacity);
            uiOpacity.opacity = 0;
            this.fightAreaNode.addChild(heroNode);
            this._heroNodesMap[hero.id] = heroNode;
        }
        this.updateHeroNodesOnField();
    }

    private loadGameMapBackground() {
        // 1. 获取当前关卡index（确保loadData方法能正确返回关卡数，如0/1/2...）
        let levelIndex = this.getSafeCurrentLevel();

        // 2. 计算对应的背景图片索引（循环使用5张图）
        const bgImageCount = 5;
        const bgImageNumber = (levelIndex % bgImageCount) + 1;

        // 替代padStart：手动实现补零（兼容低版本ES）
        const bgImageNumberStr = bgImageNumber < 10 ? `0${bgImageNumber}` : `${bgImageNumber}`;
        const bgImagePath = `${this._gameResPath}bg-level-${bgImageNumberStr}/spriteFrame`; // 生成 bg/bg-level-01 格式

        // 3. 获取Sprite组件（确保Bg节点已添加Sprite组件）
        let bgSprite = this.bgNode.getComponent(Sprite);
        if (!bgSprite) {
            console.error('背景节点缺少 Sprite 组件，自动添加');
            bgSprite = this.bgNode.addComponent(Sprite);
        }

        // 4. 加载本地背景图片并设置
        loadResSingleAsset(bgImagePath, (data) => {

            // 5. 设置背景图片到Sprite组件
            bgSprite.spriteFrame = data;

            // 6. 适配屏幕尺寸（保持背景图覆盖整个屏幕）
            const winSize = view.getVisibleSize();
            // 设置背景节点尺寸为屏幕尺寸（可根据需求调整是否缩放）
            this.bgNode.getComponent(UITransform).setContentSize(winSize);
            // 可选：设置Sprite的填充模式为拉伸/平铺（根据你的需求选择）
            // bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            // bgSprite.trim = false;

            // 根据需要调整图片尺寸和显示方式
            // const winSize = view.getVisibleSize();
            // const nodeSize = this.bgNode.getContentSize();

            // // 根据屏幕尺寸调整图片缩放
            // if (nodeSize.width > 0 && nodeSize.height > 0) {
            //     const scaleX = (winSize.width + 200) / nodeSize.width;
            //     const scaleY = (winSize.height + 200) / nodeSize.height;
            //     this.bgNode.setScale(scaleX, scaleY);
            // }

        })
    }

    /**
     * 渲染游戏地图背景（与关卡风格一致，自动复用/生成）
     */
    private renderGameMapBackground() {
        // 1. 获取当前关卡index
        let levelIndex = this.getSafeCurrentLevel();
        const themes: MapTheme[] = ['ice', 'fire', 'forest', 'ocean', 'desert'];
        const theme: MapTheme = themes[levelIndex % themes.length];
        // 读取关卡颜色配置
        const levelData = LDM.getLevelByIndexCompatible(levelIndex) as any;
        const bgColors = levelData?.bgColors || levelData?.bgColor;
        const bgNode = this.node.getChildByName('Bg');
        if (bgNode) {
            const winSize = view.getVisibleSize();
            const mapData = MapManager.generateMapData(theme, Date.now() + Math.random(), { width: winSize.width + 200, height: winSize.height + 200 }, bgColors);
            MapManager.renderMap(bgNode, mapData, { width: winSize.width + 200, height: winSize.height + 200 });
        }
    }

    /**
     * 初始化主流程，依次初始化英雄、道具栏、怪物、经验条、血量条
     * 这是游戏开始时最重要的步骤，确保所有内容都已准备好。
     */
    init() {
        this.initHeroes(); // 初始化英雄
        this.initSkill(); // 初始化技能配置
        this.getMonsterData(); // 获取怪物数据
        this.initExpBar(); // 初始化经验条
        this.initHPBar(); // 初始化血量条
        // this.initPet();
        // this.initDemons();
        // 绑定事件监听
        this.bindEvents();
    }

    /**
     * 绑定所有gameBus事件
     */
    bindEvents() {
        // 使用箭头函数确保`this`指向GameController实例
        this._gameOverHandler = (result: string) => this.handleGameOver(result);
        gameBus.on('game-over', this._gameOverHandler);

        this._wallHpUpdateHandler = (data: { currentHp: number, maxHp: number }) => this.updateWallHpUI(data);
        gameBus.on('wall-hp-updated', this._wallHpUpdateHandler);

        this._skillLearnedHandler = (data: { skill: ISkill, heroId: number }) => this.learnNewSkill(data);
        gameBus.on('skill-learned', this._skillLearnedHandler);

        // 弹出技能选择面板时暂停游戏
        gameBus.pause(GAME_PAUSE_REASONS.SKILL_PANEL);
        this.onShowSkillPanel();
    }

    /**
     * 生命周期方法，组件销毁时调用
     */
    onDestroy() {
        // 对于GameController这种常驻节点，最安全的做法是让gameBus在场景切换时统一处理
        // 或者使用 targetOff，但鉴于之前的问题，我们暂时保持为空以确保稳定
        if (this._gameOverHandler) {
            gameBus.off('game-over', this._gameOverHandler);
        }
        if (this._wallHpUpdateHandler) {
            gameBus.off('wall-hp-updated', this._wallHpUpdateHandler);
        }
        if (this._skillLearnedHandler) {
            gameBus.off('skill-learned', this._skillLearnedHandler);
        }
        // OPS_JIANJIAN_2026_05: restore temporary skill overrides on scene teardown.
        this._jianjianBattleRule.dispose();
        gameBus.clearPauseReasons();
    }

    /**
     * 游戏结束处理
     * @param result 
     */
    private handleGameOver(result: string) {
        console.log('[GC] handleGameOver', result, result === 'lose');
        if (result === 'lose') {
            this.showLosePanel();
        }
    }

    /**
     * 初始化技能配置
     * 加载技能配置文件，并将其存储在 SkillConfig 中。
     */
    initSkill() {
        // 可根据需要缓存远程技能列表
        this._allSkills = SDM.getSkillList();
    }

    /**
     * 初始化英雄节点：
     * 1. 一次性创建GameData.heroes中所有可上场英雄节点，全部挂fightAreaNode下，初始不激活不显示。
     * 2. 记录heroId到节点的映射。
     * 3. 后续通过updateHeroNodesOnField()激活/显示上场英雄。
     */
    async initHeroes() {
        // 用于记录heroId到节点的映射
        if (!this._heroNodesMap) {
            this._heroNodesMap = {};
        }
        // 初始化位置映射
        if (!this._heroPositionMap) {
            this._heroPositionMap = {};
        }
        // 清理旧节点
        this.fightAreaNode.children.forEach(node => {
            if (node.getComponent(HeroController)) {
                node.destroy();
            }
        });
        this._heroNodesMap = {};
        this._heroPositionMap = {};
        if (!GameData.heroes || GameData.heroes.length === 0) return;
        // 创建所有可上场英雄节点，初始不激活不显示
        for (const hero of GameData.heroes) {
            const heroNode = await UnitFactory.createUnit(hero.id, UNIT_TYPE.HERO, this.heroPrefab, this.skillEffectPrefab);
            if (!heroNode) {
                console.error('[GameController][initHeroes] 英雄节点创建失败', hero);
                continue;
            }
            heroNode.active = false;
            // 设置透明度为0（隐藏），需挂载UIOpacity组件
            let uiOpacity = heroNode.getComponent(UIOpacity);
            if (!uiOpacity) {
                uiOpacity = heroNode.addComponent(UIOpacity);
            }
            uiOpacity.opacity = 0;
            this.fightAreaNode.addChild(heroNode);
            this._heroNodesMap[hero.id] = heroNode;
        }
        // 初始化时根据当前上场英雄调整显示
        this.updateHeroNodesOnField();
    }

    private getHeroAnchorNodesInPriority(): Node[] {
        return [this.hero03Node, this.hero02Node, this.hero04Node, this.hero01Node, this.hero05Node];
    }

    private getHeroAnchorPosition(positionIndex: number): Vec3 | null {
        const anchors = this.getHeroAnchorNodesInPriority();
        const anchorNode = anchors[positionIndex];
        const fightAreaTransform = this.fightAreaNode?.getComponent(UITransform);
        if (!anchorNode || !anchorNode.isValid || !fightAreaTransform) {
            return null;
        }

        const worldPos = anchorNode.getWorldPosition();
        return fightAreaTransform.convertToNodeSpaceAR(worldPos);
    }

    private getFallbackHeroPosition(positionIndex: number): Vec3 {
        const baseY = -EDM.config.viewHeight + 128 + 64;
        let posX = 75 + 300;
        switch (positionIndex) {
            case 0:
                posX = 75 + 300;
                break;
            case 1:
                posX = 75 + 150;
                break;
            case 2:
                posX = 75 + 450;
                break;
            case 3:
                posX = 75;
                break;
            case 4:
                posX = 75 + 600;
                break;
        }
        return new Vec3(posX, baseY, 0);
    }

    /**
     * 根据GameData.heroOnField激活/显示上场英雄节点，并调整位置。
     * 不在heroOnField的节点隐藏。
     */
    updateHeroNodesOnField() {
        const heroOnField = GameData.heroOnField || [];

        // 为新的上场英雄分配位置索引（优先中间位置）
        for (const hero of heroOnField) {
            if (this._heroPositionMap[hero.id] === undefined) {
                // 优先分配中间位置，然后左右交替
                const positionPriority = [0, 1, 2, 3, 4]; // 0=中间, 1=左1, 2=右1, 3=左2, 4=右2
                let positionIndex = -1;

                for (const priority of positionPriority) {
                    const existingPositions = Object.keys(this._heroPositionMap)
                        .filter(key => !this._jianjianOpsFadingHeroIds.has(Number(key)))
                        .map(key => this._heroPositionMap[parseInt(key)]);
                    if (existingPositions.indexOf(priority) === -1) {
                        positionIndex = priority;
                        break;
                    }
                }

                if (positionIndex !== -1) {
                    this._heroPositionMap[hero.id] = positionIndex;
                }
            }
        }

        // 更新所有英雄节点的显示状态和位置
        for (const heroId in this._heroNodesMap) {
            const node = this._heroNodesMap[heroId];
            if (!node || !node.isValid) {
                console.warn('[GameController] Hero node is invalid:', heroId);
                delete this._heroNodesMap[heroId];
                delete this._heroPositionMap[heroId];
                this._jianjianOpsFadingHeroIds.delete(Number(heroId));
                continue;
            }
            try {
                let uiOpacity = node.getComponent(UIOpacity);
                if (!uiOpacity) uiOpacity = node.addComponent(UIOpacity);

                const hero = heroOnField.find(h => h.id == heroId);
                if (hero) {
                    node.active = true;
                    uiOpacity.opacity = 255;

                    // 使用记录的位置索引计算位置
                    const positionIndex = this._heroPositionMap[hero.id];
                    const anchorPosition = this.getHeroAnchorPosition(positionIndex);
                    const targetPosition = anchorPosition || this.getFallbackHeroPosition(positionIndex);
                    if (typeof node.setPosition === 'function') {
                        node.setPosition(targetPosition);
                    } else {
                        console.warn('[GameController] Hero node setPosition 无效:', heroId);
                    }

                    // OPS_JIANJIAN_2026_05: roll the hero-7 branch on first visible entry.
                    this._jianjianBattleRule.onHeroVisible(Number(hero.id), node);

                    // 首次上场时，广播技能学习事件
                    const heroCtrl = node.getComponent(HeroController);
                    if (heroCtrl && heroCtrl.hadSkills.length > 0) {
                        for (const skill of heroCtrl.hadSkills) {
                            const key = `${heroId}-${skill.skillId}`;
                            if (!this._skillIcons[key]) {
                                gameBus.emit('skill-learned', { skill, heroId });
                            }
                        }
                        // 新技能系统已自动处理技能效果更新
                    }
                } else {
                    if (this._jianjianOpsFadingHeroIds.has(Number(heroId))) {
                        node.active = true;
                        continue;
                    }

                    node.active = false;
                    uiOpacity.opacity = 0;
                    // 英雄下场时，保留位置索引，以便重新上场时位置不变
                }
            } catch (error) {
                console.error('[GameController] Error updating hero node:', heroId, error);
                delete this._heroNodesMap[heroId];
                delete this._heroPositionMap[heroId];
            }
        }

        // 在方法的最后，广播上场英雄列表
        gameBus.emit('hero-field-updated', GameData.heroOnField);
    }

    /**
     * 初始化经验条，显示当前等级和经验进度
     * 经验条用于展示玩家当前等级和升级进度。
     */
    initExpBar() {
        if (!this._expBarPolished) {
            this.polishBattleProgressBar(this.expBarNode, BATTLE_EXP_BAR_PATH, 36);
            this._expBarPolished = true;
        }
        this.expBarNode.getChildByName('Label').getComponent(Label).string = `Lv ${GameData.gameLevel}`;
        this.expBarNode.getChildByName('ProgressBar').getComponent(ProgressBar).progress =
            GameData.exp / (GameData.gameLevel * GameData.lvExpMultiple);
    }

    /**
     * 初始化血量条，显示当前HP和进度
     * 血量条用于展示玩家当前生命值。
     */
    initHPBar() {
        if (!this._hpBarPolished) {
            this.polishBattleProgressBar(this.HPNode, BATTLE_HP_BAR_PATH, 0);
            this._hpBarPolished = true;
        }
        this._hpBar = this.HPNode.getChildByName('ProgressBar').getComponent(ProgressBar);
        this._hpLabel = this.HPNode.getChildByName('Label').getComponent(Label);
        // 初始化时，血量可以先用一个默认值，后续由WallController的事件来更新
        this._hpLabel.string = `1000 / 1000`;
        this._hpBar.progress = 1;
    }

    private polishBattleProgressBar(root: Node, barPath: string, labelY: number) {
        if (!root || !root.isValid) return;

        const rootTransform = root.getComponent(UITransform) || root.addComponent(UITransform);
        rootTransform.setContentSize(BATTLE_PROGRESS_WIDTH, BATTLE_PROGRESS_BG_HEIGHT + 30);

        const progressNode = root.getChildByName('ProgressBar');
        if (progressNode && progressNode.isValid) {
            const progressTransform = progressNode.getComponent(UITransform) || progressNode.addComponent(UITransform);
            progressTransform.setContentSize(BATTLE_PROGRESS_WIDTH, BATTLE_PROGRESS_BG_HEIGHT);

            const progressSprite = progressNode.getComponent(Sprite) || progressNode.addComponent(Sprite);
            progressSprite.type = Sprite.Type.SLICED;
            progressSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            progressSprite.color = new Color(255, 255, 255, 255);
            loadResSingleAsset(BATTLE_PROGRESS_BG_PATH, (asset) => {
                if (progressNode.isValid && progressSprite.isValid && asset) {
                    progressSprite.spriteFrame = asset as SpriteFrame;
                }
            });

            const progressBar = progressNode.getComponent(ProgressBar);
            if (progressBar) progressBar.totalLength = BATTLE_PROGRESS_TOTAL;

            const bar = progressNode.getChildByName('Bar');
            if (bar && bar.isValid) {
                bar.active = true;
                bar.setPosition(-BATTLE_PROGRESS_TOTAL / 2, 0, 0);

                const barTransform = bar.getComponent(UITransform) || bar.addComponent(UITransform);
                barTransform.setContentSize(0, BATTLE_PROGRESS_BAR_HEIGHT);

                const barSprite = bar.getComponent(Sprite) || bar.addComponent(Sprite);
                barSprite.type = Sprite.Type.SLICED;
                barSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                barSprite.color = new Color(255, 255, 255, 255);
                loadResSingleAsset(barPath, (asset) => {
                    if (bar.isValid && barSprite.isValid && asset) {
                        barSprite.spriteFrame = asset as SpriteFrame;
                    }
                });
            }
        }

        const labelNode = root.getChildByName('Label');
        if (labelNode && labelNode.isValid) {
            labelNode.setPosition(0, labelY, 0);
            const label = labelNode.getComponent(Label);
            if (label) {
                label.fontSize = 24;
                label.lineHeight = 30;
                label.color = new Color(238, 250, 255, 255);
            }
        }
    }

    /**
     * 更新城墙血量UI
     * @param data 包含currentHp和maxHp的对象
     */
    updateWallHpUI({ currentHp, maxHp }: { currentHp: number, maxHp: number }) {
        // OPS_JIANJIAN_2026_05: wall HP crossing gates the potential branch.
        this._jianjianBattleRule.onWallHpUpdated(currentHp, maxHp);
        if (this._hpBar) {
            this._hpBar.progress = currentHp > 0 ? currentHp / maxHp : 0;
        }
        if (this._hpLabel) {
            this._hpLabel.string = `${Math.round(currentHp)} / ${Math.round(maxHp)}`;
        }
    }

    /**
     * 获取当前关卡的怪物数据
     * 包括每一波要生成哪些怪物、总怪物数等。
     */
    getMonsterData() {
        let levelIndex = this.getSafeCurrentLevel();
        // 关卡数据
        this.levelData = LDM.getLevelByIndexCompatible(levelIndex);
        if (!this.levelData || !Array.isArray(this.levelData['monster'])) {
            console.error('[GameController] 关卡怪物数据无效，使用空关卡兜底:', levelIndex, this.levelData);
            this.levelData = {
                monster: [],
                wave: 1,
                monsterGenTime: 1,
                intervalTime: 1,
                reward: [],
            };
        }
        let monsters = [];
        let allMonsters = 0;

        // 设置关卡掉落配置 - 使用统一的CurrencyManager
        console.log('[GameController] 怪物掉落系统已通过CurrencyManager统一管理');

        // 计算当前波次的怪物
        this.levelData['monster'].forEach((v) => {
            let number = v['number'][this.curWave - 1];
            if (number !== 0) {
                for (let i = 0; i < number; i++) {
                    monsters.push(v['id']);
                }
            }
        });

        // 计算整个关卡的总怪物数（所有波次）
        this.levelData['monster'].forEach((v) => {
            v['number'].forEach((waveNumber) => {
                allMonsters += waveNumber || 0;
            });
        });

        this.monsters = monsters;
        GameData.allNumbers = allMonsters;
        console.log(`[GameController] 第${this.curWave}波怪物数据: 当前波次怪物=${monsters.length}, 总怪物数=${allMonsters}, 关卡=${levelIndex}`);

        // 显示每个怪物的详细信息
        this.levelData['monster'].forEach((v, index) => {
            console.log(`[GameController] 怪物${index}: id=${v.id}, 各波次数量=${v.number.join(',')}`);
        });
    }

    /**
     * 生成怪物
     * 按照设定的时间间隔和波次，依次生成怪物到战斗区域。
     */
    generateMonster(deltaTime) {
        // 游戏未初始化或暂停时不生成怪物
        if (gameBus.paused || !this.levelData || !this.levelData['monster']) return;
        if (this.monsters.length > 0) {
            if (this._monsterGenTime < this.levelData['monsterGenTime']) {
                this._monsterGenTime += deltaTime;
            } else {
                // 初始化怪物
                this.initMonster();
                // 调整怪物图层顺序
                this.adjustMonsterLayer();

                // 重置间隔时间
                this._monsterGenTime = 0;
            }
        } else {
            // 检查是否完成波次
            if (this.curWave < this.levelData['wave']) {
                if (this._intervalTime <= this.levelData['intervalTime']) {
                    this._intervalTime += deltaTime;
                } else {
                    this.curWave++;
                    this.getMonsterData();
                    console.log(`第${this.curWave}波马上来袭`);
                    this._intervalTime = 0;
                }
            } else {
                // 检查是否清除所有魔物
                // TODO: 不是用MonsterContoller检查，应该是Unit的非本阵营camp进行检查
                const aliveMonsters = this.fightAreaNode.children.filter(
                    node => node.getComponent('MonsterController') && node.active
                );

                // 简化胜利判定：所有波次完成且没有存活怪物
                if (aliveMonsters.length === 0 && !this._victoryShown) {
                    console.log(`[GameController] 胜利判定: 存活怪物=${aliveMonsters.length}, 当前波次=${this.curWave}, 总波次=${this.levelData['wave']}`);
                    this.showVictoryPanel();
                }
            }
        }
    }

    /**
     * 初始化怪物
     * 随机生成一个怪物，并将其添加到战斗区域。
     */
    async initMonster() {
        let index = Math.floor(Math.random() * this.monsters.length);
        let id = this.monsters[index];
        // 获取完整怪物数据
        const data = await UnitDataLoader.loadUnitData(id, 'monster');
        // 怪物节点
        let monsterNode = this._monsterPool.get();
        // 防御：如果节点无效，重新取
        if (!monsterNode || !monsterNode.isValid) {
            monsterNode = instantiate(this.monsterPrefab);
        }

        // 为怪物分配唯一ID
        this._monsterIdCounter++;
        const monsterUniqueId = `monster_${this._monsterIdCounter}_${Date.now()}`;
        (monsterNode as any)._monsterUniqueId = monsterUniqueId;

        // 标记对象池引用
        (monsterNode as any)._poolRef = this._monsterPool;

        // 重新初始化怪物数据
        const monsterCtrl = monsterNode.getComponent('MonsterController') as any;
        if (monsterCtrl && typeof monsterCtrl.init === 'function') {
            await monsterCtrl.init(data);
        }

        monsterNode.active = true;
        let posX = Math.floor(Math.random() * (this._fightAreaW - 100)) + 50;
        monsterNode.setPosition(posX, 0, 0);
        // 不显示单位名称
        const nameLabel = monsterNode.getChildByName('Label');
        nameLabel.active = false;
        // 添加到战斗区域
        this.fightAreaNode.addChild(monsterNode);
        this.monsters.splice(index, 1);

        // 统一的事件绑定
        monsterNode.on('monster_damage', this.onUpdateHP, this);
        monsterNode.on('monster_die', () => {
            this.handleMonsterDeath(monsterNode, monsterUniqueId);
        }, this);

        // console.log(`[GameController] 生成怪物: ID=${monsterUniqueId}, 类型=${id}`);
    }

    /**
     * 调整怪物图层顺序
     * 让先生成的怪物显示在上面，后生成的在下面，避免遮挡。
     */
    adjustMonsterLayer() {
        this.fightAreaNode.children.forEach((v, i) => {
            v.setSiblingIndex(1000 - i);
        });
    }

    /**
     * 检查怪物是否进入攻击范围
     * 用于判断玩家是否可以进行普通攻击。
     */
    checkMonsterInto() {
        let arr = this.fightAreaNode.children.filter((v) => Math.abs(v.position.y) > 20);
        if (arr.length > 0) {
            this.canNormalAttack = true;
        } else {
            this.canNormalAttack = false;
        }
    }


    /**
     * 弹出技能面板
     * 玩家升级或开局时弹出，供玩家选择新技能或首位英雄。
     */
    onShowSkillPanel() {
        // 生成技能列表
        let skills = SkillPanelController.onGenerateSkillLogic(
            this._heroNodesMap,
            // OPS_JIANJIAN_2026_05: hide fled hero 7 from future new-hero offers.
            (heroId: number) => this._jianjianBattleRule.canOfferHero(heroId),
        );
        if (!skills || skills.length === 0) {
            // 没有可选技能，直接恢复游戏
            gameBus.resume(GAME_PAUSE_REASONS.SKILL_PANEL);
            popupManager.closeCurrentPopup(); // 保证弹窗队列继续
            return false;
        }
        let skillPanelPrefab = instantiate(this.skillPanelPrefab);
        const skillPanelController = skillPanelPrefab.getComponent(SkillPanelController);
        this.hideHelpLayerGuide();
        skillPanelController?.initWithItemCard(skills, this);
        this.node.addChild(skillPanelPrefab);
        return true;
    }

    hideHelpLayerGuide() {
        this._helpLayerController?.hide();
    }

    /**
     * 更新HP
     * 玩家受到伤害时减少血量，血量为0时判定失败。
     */
    onUpdateHP(damage) {
        GameData.hp -= damage;

        this.HPNode.getChildByName('Label').getComponent(Label).string = `${GameData.hp}`;
        this.HPNode.getChildByName('ProgressBar').getComponent(ProgressBar).progress =
            GameData.hp / GameData.maxHp;

        if (GameData.hp <= 0) {
            // 游戏失败
            this.showLosePanel();
            // console.log("游戏失败")
        }
    }

    /**
     * 游戏胜利
     * 所有怪物消灭后弹出胜利结算面板。
     */
    showVictoryPanel() {
        if (this._victoryShown) {
            console.log('[GameController] 胜利面板已显示，跳过重复显示');
            return; // 防止重复显示
        }

        // 检查胜利条件：所有波次完成且没有存活怪物
        const aliveMonsters = this.fightAreaNode.children.filter(
            node => node.getComponent('MonsterController') && node.active
        );

        if (aliveMonsters.length === 0 && this.curWave >= this.levelData['wave']) {
            this._victoryShown = true;
            console.log('[GameController] 显示胜利面板');

            const currentLevel = PDM.getCurrentLevel();
            // 触发游戏胜利事件
            gameBus.emit(SIGNAL_TYPES.GAME_VICTORY, {
                level: currentLevel,
                killCount: GameData.killNumbers,
                playTime: this._playTime
            });

            let victoryPanelPrefab = instantiate(this.victoryPanelPrefab);
            let levelData = LDM.getLevelByIndexCompatible(currentLevel);

            // 获取战斗奖励数据
            const battleRewards = this.getBattleCurrencyRewards();

            // 传递关卡奖励数据和战斗奖励数据
            victoryPanelPrefab.getComponent(VictoryPanelController).init(levelData['reward'], battleRewards);
            this.node.addChild(victoryPanelPrefab);
            console.log('[GameController] 胜利面板已添加到场景');
        } else {
            console.log('[GameController] 胜利条件不满足: 存活怪物=', aliveMonsters.length, '当前波次=', this.curWave, '总波次=', this.levelData['wave']);
        }
    }

    /**
     * 游戏失败
     * 血量为0时弹出失败面板。
     */
    showLosePanel() {
        // 只有怪物总数大于0且HP<=0才判定失败
        if (GameData.allNumbers > 0 && GameData.hp <= 0) {
            // 触发游戏失败事件
            gameBus.emit(SIGNAL_TYPES.GAME_DEFEAT, {
                level: PDM.getCurrentLevel(),
                killCount: GameData.killNumbers,
                playTime: this._playTime
            });

            let losePanelPrefab = instantiate(this.losePanelPrefab);

            // 获取战斗奖励数据
            const battleRewards = this.getBattleCurrencyRewards();

            // 传递战斗奖励数据
            losePanelPrefab.getComponent(LosePanelController).init(battleRewards);
            this.node.addChild(losePanelPrefab);
        }
    }

    /**
     * 退出游戏
     * 弹出退出确认面板。
     */
    showExitPanel() {
        let exitPanelPrefab = instantiate(this.exitPanelPrefab);
        const rewards = this.getBattleCurrencyRewards();
        exitPanelPrefab.getComponent(ExitPanelController).init(rewards);
        this.node.addChild(exitPanelPrefab);
    }

    /**
     * 每帧更新方法
     * 控制游戏主循环，包括计时、怪物生成、攻击判定等。
     */
    update(deltaTime: number) {
        if (gameBus.paused) return;
        // 不在暂停状态时才进行操作
        const scaledDelta = applySpeedScale(deltaTime);
        // OPS_JIANJIAN_2026_05: operation timers follow active battle time only.
        this._jianjianBattleRule.tick(scaledDelta);
        this.generateMonster(scaledDelta);
        this.checkMonsterInto();

        // 每10秒输出一次调试信息
        if (this._playTime % 10 === 0 && this._playTime > 0) {
            const aliveMonsters = this.fightAreaNode.children.filter(
                node => node.getComponent('MonsterController') && node.active
            );
            console.log(`[GameController] 游戏状态: 击杀数=${GameData.killNumbers}, 总数=${GameData.allNumbers}, 存活怪物=${aliveMonsters.length}, 当前波次=${this.curWave}, 总波次=${this.levelData['wave']}`);
        }

        // 胜利检查由generateMonster方法统一处理，避免重复调用
        // 英雄自动释放技能
        // SkillManager.heroAutoReleaseSkill(this.node, this.fightAreaNode, scaledDelta, this._cooldownLeft);
    }

    /**
     * 学习新技能
     * @param data 
     */
    learnNewSkill(data: { skill: ISkill, heroId: number }) {
        const { skill, heroId } = data;
        const key = `${heroId}-${skill.skillId}`;
        if (this._skillIcons[key]) return;

        // 触发技能学习事件
        gameBus.emit('skill_learned', {
            skill: skill,
            heroId: heroId
        });

        const iconNode = instantiate(this.skillIconPrefab);
        this.skillBarNode.addChild(iconNode);
        iconNode.getComponent(SkillIconController).init(skill, heroId);
        this._skillIcons[key] = iconNode;
    }

    public markJianjianOpsSelectAllAdCompleted(): void {
        // OPS_JIANJIAN_2026_05: "全都要" ad completion is a potential precondition.
        this._jianjianBattleRule.markSelectAllAdCompleted();
    }

    public notifyJianjianOpsSkillEffectApplied(heroId: number, effectData: any): void {
        // OPS_JIANJIAN_2026_05: keep temporary potential values after skill upgrades.
        this._jianjianBattleRule.onSkillEffectApplied(heroId, effectData);
    }

    private removeJianjianOpsHeroFromField(heroId: number): void {
        // OPS_JIANJIAN_2026_05: host-owned direct GameData/node mutation for flee.
        const normalizedHeroId = Number(heroId);
        const heroNode = this._heroNodesMap[normalizedHeroId];
        GameData.heroOnField = (GameData.heroOnField || []).filter(hero => Number(hero.id) !== normalizedHeroId);
        this.removeJianjianOpsSkillIconsForHero(heroId);

        if (!heroNode || !heroNode.isValid) {
            delete this._heroPositionMap[normalizedHeroId];
            this._jianjianOpsFadingHeroIds.delete(normalizedHeroId);
            this.updateHeroNodesOnField();
            return;
        }

        const heroCtrl = heroNode.getComponent(HeroController);
        if (heroCtrl) {
            heroCtrl.canAttack = false;
            heroCtrl.canSkill = false;
        }

        const uiOpacity = heroNode.getComponent(UIOpacity) || heroNode.addComponent(UIOpacity);
        heroNode.active = true;
        uiOpacity.opacity = 255;
        this._jianjianOpsFadingHeroIds.add(normalizedHeroId);
        this.updateHeroNodesOnField();

        tween(uiOpacity)
            .to(JIANJIAN_OPS_FLEE_FADE_SECONDS, { opacity: 0 })
            .call(() => this.finishJianjianOpsFleeFade(normalizedHeroId))
            .start();
    }

    private finishJianjianOpsFleeFade(heroId: number): void {
        this._jianjianOpsFadingHeroIds.delete(heroId);
        delete this._heroPositionMap[heroId];

        const heroNode = this._heroNodesMap[heroId];
        if (heroNode && heroNode.isValid) {
            const uiOpacity = heroNode.getComponent(UIOpacity);
            if (uiOpacity) {
                uiOpacity.opacity = 0;
            }
            heroNode.active = false;
        }

        this.updateHeroNodesOnField();
    }

    private removeJianjianOpsSkillIconsForHero(heroId: number): void {
        const prefix = `${heroId}-`;
        for (const key of Object.keys(this._skillIcons)) {
            if (!key.startsWith(prefix)) continue;

            const iconNode = this._skillIcons[key];
            if (iconNode && iconNode.isValid) {
                iconNode.destroy();
            }
            delete this._skillIcons[key];
        }
    }

    /**
     * 统一处理怪物死亡
     * @param monsterNode 怪物节点
     * @param monsterUniqueId 怪物唯一ID
     */
    handleMonsterDeath(monsterNode: Node, monsterUniqueId: string) {
        // 检查是否已经处理过这个怪物的死亡
        if (this._monsterDeathTracker.has(monsterUniqueId)) {
            console.log(`[GameController] 怪物死亡重复处理，跳过: ${monsterUniqueId}`);
            return;
        }

        // 标记为已死亡
        this._monsterDeathTracker.add(monsterUniqueId);

        // 更新游戏数据
        GameData.exp++;
        GameData.killNumbers++;
        // console.log(`[GameController] 怪物死亡: ID=${monsterUniqueId}, 击杀数=${GameData.killNumbers}, 总数=${GameData.allNumbers}`);

        // 执行掉落判定与发放（使用关卡配置）
        const monsterCtrl = monsterNode.getComponent('MonsterController') as any;
        const monsterRarity = monsterCtrl?.rarity || MonsterRarity.NORMAL;
        levelService.giveMonsterKillRewards(PDM.getCurrentLevel(), monsterRarity);

        // 触发经济系统怪物死亡事件
        gameBus.emit('monster_die', {
            monsterNode: monsterNode,
            monsterUniqueId: monsterUniqueId,
            killCount: GameData.killNumbers
        });

        // 检查是否升级
        let levelUpCount = 0;
        while (GameData.exp >= GameData.gameLevel * GameData.lvExpMultiple) {
            GameData.gameLevel++;
            GameData.exp = 0;
            levelUpCount++;
        }

        // 多级连升时，入队多次弹窗请求
        for (let i = 0; i < levelUpCount; i++) {
            gameBus.pause(GAME_PAUSE_REASONS.SKILL_PANEL);
            popupManager.addPopup('skillPanel', () => {
                this.onShowSkillPanel();
            });
        }

        this.initExpBar();

        // 对象池回收
        if (monsterNode && monsterNode.isValid) {
            safeDisablePhysics2D(monsterNode, true);
            monsterNode.off('monster_damage', this.onUpdateHP, this);
            monsterNode.off('monster_die');
            monsterNode.removeFromParent();
            monsterNode.active = false;
            (monsterNode as any)._poolRef = null;
            this._monsterPool.put(monsterNode);
        }

        // 检查是否完成当前关卡
        if (GameData.killNumbers >= GameData.allNumbers) {
            console.log(`[GameController] 击杀数达到总数: 击杀数=${GameData.killNumbers}, 总数=${GameData.allNumbers}`);
            // 胜利检查由generateMonster方法统一处理，避免重复调用
        }
    }

    /**
     * 记录战斗开始时的货币状态
     */
    private recordBattleStartCurrencies(): void {
        try {
            // 使用CurrencyManager获取当前货币状态
            this._battleStartCurrencies = {
                coin: CDM.getCurrency(CurrencyType.Gold) || 0,
                gem: CDM.getCurrency(CurrencyType.Gem) || 0,
                heroFragment: CDM.getCurrency(CurrencyType.HeroFragment) || 0,
                stamina: CDM.getCurrency(CurrencyType.Stamina) || 0
            };
            // 仅开发环境输出
            // console.log('[GameController] 记录战斗开始时的货币状态:', this._battleStartCurrencies);
        } catch (error) {
            console.error('[GameController] 记录战斗开始时的货币状态失败:', error);
            this._battleStartCurrencies = {
                coin: 0,
                gem: 0,
                heroFragment: 0,
                stamina: 0
            };
        }
    }

    /**
     * 获取战斗过程中的货币奖励（当前状态 - 开始状态）
     */
    public getBattleCurrencyRewards(): any {
        try {
            // 使用CurrencyManager获取当前货币状态
            const currentCurrencies = {
                coin: CDM.getCurrency(CurrencyType.Gold) || 0,
                gem: CDM.getCurrency(CurrencyType.Gem) || 0,
                heroFragment: CDM.getCurrency(CurrencyType.HeroFragment) || 0,
                stamina: CDM.getCurrency(CurrencyType.Stamina) || 0
            };

            const rewards = {
                coin: Math.max(0, (currentCurrencies.coin || 0) - (this._battleStartCurrencies.coin || 0)),
                gem: Math.max(0, (currentCurrencies.gem || 0) - (this._battleStartCurrencies.gem || 0)),
                heroFragment: Math.max(0, (currentCurrencies.heroFragment || 0) - (this._battleStartCurrencies.heroFragment || 0)),
                stamina: Math.max(0, (currentCurrencies.stamina || 0) - (this._battleStartCurrencies.stamina || 0))
            };

            // 仅开发环境输出
            // console.log('[GameController] 计算战斗货币奖励:', { start: this._battleStartCurrencies, current: currentCurrencies, rewards });

            return rewards;
        } catch (error) {
            console.error('[GameController] 计算战斗货币奖励失败:', error);
            return {
                coin: 0,
                gem: 0,
                heroFragment: 0,
                stamina: 0
            };
        }
    }
}
