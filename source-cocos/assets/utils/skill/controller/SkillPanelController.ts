import {
  _decorator,
  Component,
  instantiate,
  Node,
  Prefab,
  director,
  tween,
  Vec2,
  Vec3,
  UIOpacity,
  UITransform,
  Button,
  Label,
  Color,
  Graphics,
  Sprite,
} from "cc";
import { SkillCardController } from "./SkillCardController";
import { ItemCardController } from "./ItemCardController";
import { GameController } from "db://assets/plays/play01/GameController";
import { HeroController } from "db://assets/script/core/prefab/HeroController";
import { popupManager } from "db://assets/script/ui/popup/PopupManager";
import { GAME_PAUSE_REASONS, gameBus } from "db://assets/utils/signal/GameBus";
import { AdManager } from "db://assets/utils/common/AdManager";
import { EDM } from "../../data/env/ConfigManager";
import { SkillFactory } from "../SkillFactory";
import { HDM } from "../../data/config/hero/HeroDataManager";
import { GameData } from "../../data/config/manager/GameDataManager";
import { SDM } from "../../data/config/skill/SkillDataManager";
import { loadResSingleAsset } from "db://assets/utils/utils";
import { GuideManager } from "../../guide/GuideManager";
const { ccclass, property } = _decorator;
const HERO_ON_FIELD_LIMIT = 5;
const UI_CYAN = new Color(64, 218, 255, 230);
const UI_VIOLET = new Color(145, 84, 255, 230);
const UI_TEXT = new Color(232, 250, 255, 255);
const UI_MUTED = new Color(154, 202, 230, 235);
const UI_DARK = new Color(9, 10, 30, 206);
const GET_ALL_BUTTON_Y = -548;
const GET_ALL_BUTTON_WIDTH = 610;
const GET_ALL_BUTTON_HEIGHT = 172;

function pickSkillEffect(skillId: number): any | null {
  const effects = SDM.getSkillEffectBySkillId(skillId);
  if (!effects || effects.length === 0) return null;
  return effects[0];
}

@ccclass("SkillPanelController")
export class SkillPanelController extends Component {
  @property(Prefab)
  skillCardPrefab: Prefab; // 技能预制体

  @property(Prefab)
  itemCardPrefab: Prefab; // ItemCard预制体

  @property(Button)
  getAllBtn: Button = null!; // "全都要"按钮

  private _gameController: GameController | null = null;
  private _allSkillsData: any[] = []; // 保存所有技能数据，用于"全都要"功能
  private _isProcessingSelectAll: boolean = false; // 防止连点"全都要"按钮
  private _isClosed: boolean = false;
  private _isGuideMode: boolean = false;

  start() {}

  setGuideMode(enabled: boolean): void {
    this._isGuideMode = enabled;
    this.updateGetAllButtonVisible();
  }

  /**
   * 初始化技能面板
   * @param skills 技能数据
   * @param gameController GameController实例（可选）
   */
  async init(skills, gameController?) {
    this._gameController = gameController;

    // 保存所有技能数据，用于"全都要"功能
    if (Array.isArray(skills)) {
      this._allSkillsData = skills.slice();
    } else {
      this._allSkillsData = [];
      console.warn("[SkillPanelController][init] skills 参数不是数组", skills);
    }
    this.updateGetAllButtonVisible();

    // 设置缩放
    this.node
      .getChildByName("Bg")
      ?.getComponent(UITransform)
      ?.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);
    // console.log('[SkillPanelController][init]', EDM.config.viewWidth, EDM.config.viewHeight);
    // 先设置透明度为0和缩放
    let uiOpacity = this.node.getComponent(UIOpacity);
    if (!uiOpacity) {
      uiOpacity = this.node.addComponent(UIOpacity);
    }
    uiOpacity.opacity = 0;
    // 设置缩放
    // this.node.scale = new Vec3(0.7, 0.7, 1);
    // 生成内容
    const mainNode = this.node.getChildByName("Main");
    if (mainNode) {
      mainNode.setPosition(new Vec3(0, -50, 0));
    }
    skills.forEach((v) => {
      let skillCardPrefab = instantiate(this.skillCardPrefab);
      skillCardPrefab.getComponent(SkillCardController).init(v);
      if (mainNode) mainNode.addChild(skillCardPrefab);
      skillCardPrefab.on("skill_data", this.onSelect, this);
    });
    // 最后执行动画
    await this.playShowAnim();
  }

  /**
   * 弹入动画
   */
  playShowAnim(): Promise<void> {
    return new Promise<void>((resolve) => {
      tween(this.node)
        .to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: "backOut" })
        .call(() => {
          let uiOpacity = this.node.getComponent(UIOpacity);
          if (!uiOpacity) {
            uiOpacity = this.node.addComponent(UIOpacity);
          }
          uiOpacity.opacity = 255;
          resolve();
        })
        .start();
      // 同步渐显
      tween(this.node.getComponent(UIOpacity))
        .to(0.5, { opacity: 255 })
        .start();
    });
  }

  /**
   * 弹出动画
   */
  playHideAnim(): Promise<void> {
    if (!this.node) {
      console.warn("[SkillPanelController][playHideAnim] node is null");
      return Promise.resolve();
    }

    let uiOpacity = this.node.getComponent(UIOpacity);
    if (!uiOpacity) {
      uiOpacity = this.node.addComponent(UIOpacity);
    }
    return new Promise<void>((resolve) => {
      tween(this.node)
        .to(0.5, { scale: new Vec3(0.7, 0.7, 1) }, { easing: "backIn" })
        .call(() => {
          if (uiOpacity) {
            uiOpacity.opacity = 0;
          }
          resolve();
        })
        .start();
    });
  }

  /**
   * 技能卡牌被选择
   * 1. 判断是新技能还是已学技能
   * 2. 新技能则初始化属性，已学技能则升级属性
   * 3. 更新 GameData.heroSkills 结构，保证每个英雄每个技能独立存储属性、等级、星级
   * 4. 刷新英雄节点技能
   * 5. 详细注释每一步
   */
  async onSelect(data: any) {
    this._gameController?.hideHelpLayerGuide?.();

    // 首次上场：有use_unit_id且没有skill_id
    const isSkill =
      data.use_unit_id !== undefined && data.skill_id === undefined;
    // 技能效果升级：有effect_unit_id且有skill_id
    const isEffect =
      data.effect_unit_id !== undefined &&
      (data.skill_id !== undefined || data.skillId !== undefined);
    // console.log('[SkillPanelController][onSelect]', data, isSkill, isEffect);

    let handled = false;
    if (isSkill) {
      handled = await this.handleFirstSkillSelect(data);
    } else if (isEffect) {
      handled = await this.handleSkillEffectUpgrade(data);
    } else {
      console.warn("[SkillPanelController][onSelect] 未能识别卡牌类型", data);
      this.closePanel();
      return;
    }
    if (!handled || this._isClosed) {
      this.closePanel();
      return;
    }
    // 6. 刷新英雄节点技能
    if (
      this._gameController &&
      typeof this._gameController.updateHeroNodesOnField === "function"
    ) {
      this._gameController.updateHeroNodesOnField();
    }
    await this.hideAndClosePanel();
  }

  /**
   * 首次选择技能卡，英雄上场并初始化技能
   */
  async handleFirstSkillSelect(data: any): Promise<boolean> {
    const heroId = data.use_unit_id;
    if (heroId === undefined) {
      console.warn(
        "[SkillPanelController][handleFirstSkillSelect] 首次上场未能确定英雄ID",
        data,
      );
      return false;
    }

    GameData.heroOnField = GameData.heroOnField || [];

    // 判断英雄是否已上场
    let heroObj = GameData.heroOnField.find((h) => h.id === heroId);
    if (heroObj) {
      // 已上场不重复处理
      return true;
    }

    if (GameData.heroOnField.length >= HERO_ON_FIELD_LIMIT) {
      console.warn(
        "[SkillPanelController][handleFirstSkillSelect] 上场英雄已达上限，跳过新英雄",
        heroId,
      );
      return true;
    }

    heroObj = HDM.getHeroList().find((u) => u.id === heroId);
    if (heroObj) {
      GameData.heroOnField.push(heroObj);
      if (!heroObj.skills) heroObj.skills = [];
      if (!heroObj.skills.includes(data.id)) {
        heroObj.skills.push(data.id);
      }

      // 为英雄创建技能实例，确保每个英雄拥有独立的技能
      const skillId = data.id;
      const skillConfig = SDM.getSkillById(skillId);
      if (skillConfig) {
        const skillData = {
          ...skillConfig,
          skillId: skillId,
          heroId: heroId,
          id: skillId,
          level: 1,
          damage: skillConfig.atk || 10,
          cooldown: skillConfig.cooldown || 1,
          range: skillConfig.atk_range || 500,
          attackSpeed: skillConfig.cooldown || 1,
          pierce: skillConfig.pierce || 1,
          scatterAngle: (skillConfig as any).scatterAngle ?? (skillConfig as any).scatter_angle,
          duration: skillConfig.duration || 1,
          group: skillConfig.group || "ballistic",
          releaseType: skillConfig.type || "auto",
          effectType: skillConfig.effect_type || "damage",
        };

        // 预创建技能实例，确保技能与英雄正确关联
        await SkillFactory.createSkill(skillId, skillData);
      }
    } else {
      console.warn(
        "[SkillPanelController][handleFirstSkillSelect] 首次上场未找到英雄数据",
        heroId,
      );
      return false;
    }

    return true;
  }

  /**
   * 技能升级（已上场英雄）
   */
  async handleSkillEffectUpgrade(data: any): Promise<boolean> {
    const heroId = data.effect_unit_id;
    if (heroId === undefined) {
      console.warn(
        "[SkillPanelController][handleSkillEffectUpgrade] 技能升级未找到英雄ID",
        data,
      );
      return false;
    }
    let heroObj = (GameData.heroOnField || []).find((h) => h.id === heroId);
    if (!heroObj) {
      console.warn(
        "[SkillPanelController][handleSkillEffectUpgrade] 技能升级未找到英雄数据",
        data,
      );
      return false;
    }
    const scene = director.getScene();
    const canvas =
      scene && scene.getChildByName && scene.getChildByName("Canvas");
    let fightArea =
      canvas && canvas.getChildByName && canvas.getChildByName("FightArea");
    if (!fightArea) {
      console.warn(
        "[SkillPanelController][handleSkillEffectUpgrade] 未找到FightArea节点，无法升级技能",
      );
      return false;
    }
    // 只升级对应英雄的技能，确保技能效果只会应用到对应的英雄身上
    let targetHeroNode = null;
    for (const node of fightArea.children) {
      let heroCtrl = node.getComponent(HeroController);
      if (
        heroCtrl &&
        heroCtrl.id === heroId &&
        typeof heroCtrl.levelUpSkill === "function"
      ) {
        targetHeroNode = node;
        break;
      }
    }
    if (targetHeroNode) {
      const heroCtrl = targetHeroNode.getComponent(HeroController);
      if (heroCtrl && typeof heroCtrl.levelUpSkill === "function") {
        // 使用技能ID直接升级技能
        const skillId = data.skill_id || data.skillId || data.id;
        heroCtrl.levelUpSkill(skillId);
        const effectData = data.effectData || pickSkillEffect(skillId);
        if (effectData && typeof (heroCtrl as any).applySkillEffect === "function") {
          (heroCtrl as any).applySkillEffect(effectData);
          // OPS_JIANJIAN_2026_05: sync skill upgrades during the temporary potential window.
          this._gameController?.notifyJianjianOpsSkillEffectApplied?.(
            heroId,
            effectData,
          );
        }
      }
    } else {
      console.warn(
        "[SkillPanelController][handleSkillEffectUpgrade] 未找到对应英雄节点，无法升级技能",
        heroId,
      );
    }

    return true;
  }

  /**
   * 随机生成可选技能（3选1）
   * 支持多英雄，优先推荐未上场英雄的专属技能
   * OPS_JIANJIAN_2026_05: optional filter hides fled hero 7 from new-hero offers.
   */
  static onGenerateSkillLogic(
    heroNodesMap: { [key: number]: Node },
    canOfferHero?: (heroId: number) => boolean,
  ) {
    const newHeroOptions: any[] = [];
    const upgradeOptions: any[] = [];
    // 1. 获取所有可上场英雄
    const allHeroes = GameData.heroes || [];
    const onFieldHeroes = GameData.heroOnField || [];
    const onFieldIds = onFieldHeroes.map((h) => h.id);
    const remainHeroSlots = Math.max(
      0,
      HERO_ON_FIELD_LIMIT - onFieldIds.length,
    );
    // 2. 未上场英雄直接推送其默认技能（首个技能）
    const notOnField = allHeroes.filter(
      (h) =>
        !(onFieldIds as any[]).some((id) => id === h.id) &&
        (!canOfferHero || canOfferHero(Number(h.id))),
    );
    const availableNewHeroList =
      remainHeroSlots > 0 ? notOnField.slice(0, remainHeroSlots) : [];
    // 获取技能列表
    const allSkills = SDM.getSkillList();
    // console.log('[SkillPanelController][onGenerateSkillLogic] begin', allHeroes, onFieldIds, notOnField, allSkills);
    for (const heroObj of availableNewHeroList) {
      // 查找英雄的首个技能
      if (Array.isArray(heroObj.skills) && heroObj.skills.length > 0) {
        const defaultSkillId =
          typeof heroObj.skills[0] === "object"
            ? (heroObj.skills[0].skillId ??
              heroObj.skills[0].id ??
              heroObj.skills[0].skill_id)
            : heroObj.skills[0];
        const skillCfg = allSkills.find((s) => s.id === defaultSkillId);
        if (skillCfg) {
          newHeroOptions.push({
            ...skillCfg,
            use_unit_id: heroObj.id,
            avatar: heroObj.url, // 英雄头像
            url: skillCfg.url, // 技能图标
            card_type: "new_hero",
          });
        }
      }
    }
    // 3. 已上场英雄推送可升级技能效果
    onFieldHeroes.forEach((heroObj) => {
      const node = heroNodesMap[heroObj.id];
      if (!node || !node.isValid) return; // 增加有效性检查
      let heroCtrl = node.getComponent(HeroController);
      if (heroCtrl) {
        // 获取可升级技能（使用新技能系统的hadSkills）
        for (const skill of heroCtrl.hadSkills) {
          // 检查技能是否可以升级
          if (skill.level < skill.maxLevel) {
            const skillId = skill.skillId || skill.id;
            const skillCfg = allSkills.find((s) => s.id === skillId);
            const effectData = pickSkillEffect(skillId);
            const cardName = effectData?.name || skillCfg?.name || "技能";
            const cardDesc = effectData?.desc || skillCfg?.desc || "技能描述";
            // 技能卡加effect_unit_id
            upgradeOptions.push({
              id: skillId,
              skill_id: skillId,
              name: cardName,
              desc: cardDesc,
              level: skill.level,
              maxLevel: skill.maxLevel,
              effect_unit_id: heroObj.id,
              url: skillCfg?.url,
              effectData,
              card_type: "skill_upgrade",
            });
          }
        }
      }
    });

    const pickedKeys = new Set<string>();
    const getOptionKey = (item: any) => {
      if (item?.use_unit_id !== undefined) return `hero:${item.use_unit_id}`;
      return `skill:${item?.effect_unit_id}:${item?.skill_id ?? item?.skillId ?? item?.id}`;
    };
    const pickRandom = (source: any[], count: number): any[] => {
      const picked: any[] = [];
      const pool = source.filter((item) => !pickedKeys.has(getOptionKey(item)));
      while (picked.length < count && pool.length > 0) {
        const index = Math.floor(Math.random() * pool.length);
        const item = pool.splice(index, 1)[0];
        pickedKeys.add(getOptionKey(item));
        picked.push(item);
      }
      return picked;
    };

    // 4. 随机抽取3个，但保留玩法语义：
    // - 开局无上场英雄时，优先给3张新角色入阵卡。
    // - 还有空位时，至少保留1张新角色卡，避免界面看起来全是技能强化。
    // - 没有角色空位时，只给已上场角色的技能强化。
    const result: any[] = [];
    if (newHeroOptions.length > 0) {
      const heroPickCount = onFieldIds.length === 0
        ? Math.min(3, newHeroOptions.length)
        : 1;
      result.push(...pickRandom(newHeroOptions, heroPickCount));
    }
    result.push(...pickRandom(upgradeOptions, 3 - result.length));
    if (result.length < 3) {
      result.push(...pickRandom(newHeroOptions, 3 - result.length));
    }
    // console.log('[SkillPanelController][onGenerateSkillLogic] end', allHeroes, onFieldIds, notOnField, result);
    return result.slice(0, 3);
  }

  /**
   * 关闭技能选择面板
   */
  closePanel() {
    if (this._isClosed) return;

    this._isClosed = true;
    gameBus.resume(GAME_PAUSE_REASONS.SKILL_PANEL); // 动画播放完毕后再恢复游戏
    // 通知弹窗管理器当前面板已关闭
    popupManager.closeCurrentPopup();
    // 销毁面板
    if (this.node && this.node.isValid) {
      this.node.destroy();
    }
  }

  private async hideAndClosePanel() {
    if (this._isClosed) return;

    try {
      await this.playHideAnim();
    } finally {
      this.closePanel();
    }
  }

  onClose() {
    this.closePanel();
  }

  // ==================== 新增 ItemCard 相关方法 ====================

  private createChromePanel(
    parent: Node,
    name: string,
    width: number,
    height: number,
    x: number,
    y: number,
    radius = 18,
    fill: Color = UI_DARK,
    stroke: Color = UI_CYAN,
  ): Node {
    const node = new Node(name);
    node.setPosition(x, y, 0);
    parent.addChild(node);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.strokeColor = stroke;
    graphics.lineWidth = 2;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    graphics.stroke();
    return node;
  }

  private createChromeLabel(
    parent: Node,
    text: string,
    width: number,
    height: number,
    x: number,
    y: number,
    fontSize = 24,
    color: Color = UI_TEXT,
    bold = false,
  ): Label {
    const node = new Node("Label");
    node.setPosition(x, y, 0);
    parent.addChild(node);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.overflow = Label.Overflow.SHRINK;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = color;
    label.isBold = bold;
    label.enableOutline = true;
    label.outlineColor = new Color(5, 8, 22, 210);
    label.outlineWidth = fontSize >= 30 ? 3 : 2;
    return label;
  }

  private createChromeSprite(
    parent: Node,
    name: string,
    path: string,
    width: number,
    height: number,
    x: number,
    y: number,
    siblingIndex?: number,
  ): Sprite {
    const node = new Node(name);
    node.setPosition(x, y, 0);
    parent.addChild(node);
    if (siblingIndex !== undefined) {
      node.setSiblingIndex(siblingIndex);
    }

    node.addComponent(UITransform).setContentSize(width, height);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadResSingleAsset(path, (asset) => {
      if (asset && sprite && sprite.isValid) {
        sprite.spriteFrame = asset;
      }
    });
    return sprite;
  }

  private createGetAllVisual(frameNode: Node): void {
    const oldVisual = frameNode.getChildByName("GetAllVisualGroup");
    if (oldVisual) {
      oldVisual.destroy();
    }

    const group = new Node("GetAllVisualGroup");
    group.setPosition(0, 0, 0);
    frameNode.addChild(group);
    group.addComponent(UITransform).setContentSize(EDM.config.viewWidth, 211);
    const sprite = group.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadResSingleAsset("textures/ui/skin1/get_all_button_baked/spriteFrame", (asset) => {
      if (asset && sprite && sprite.isValid) {
        sprite.spriteFrame = asset;
      }
    });
  }

  private styleGetAllButton(): void {
    const buttonNode = this.getAllBtn?.node;
    if (!buttonNode || !buttonNode.isValid) return;

    buttonNode.setPosition(0, GET_ALL_BUTTON_Y, 0);
    buttonNode.setSiblingIndex(Math.max(0, this.node.children.length - 1));
    const transform = buttonNode.getComponent(UITransform);
    if (transform) {
      transform.setContentSize(GET_ALL_BUTTON_WIDTH, GET_ALL_BUTTON_HEIGHT);
    }

    let bakedSprite = buttonNode.getComponent(Sprite);
    if (!bakedSprite) {
      bakedSprite = buttonNode.addComponent(Sprite);
    }
    bakedSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadResSingleAsset("textures/ui/skin1/get_all_button_baked/spriteFrame", (asset) => {
      if (asset && bakedSprite && bakedSprite.isValid) {
        bakedSprite.spriteFrame = asset;
      }
    });

    const bg = buttonNode.getChildByName("Bg");
    if (bg) {
      bg.active = false;
    }

    const icon = buttonNode.getChildByName("Sprite");
    if (icon) {
      icon.active = false;
    }

    const labelNode = buttonNode.getChildByName("Label");
    const label = labelNode?.getComponent(Label);
    if (labelNode) {
      labelNode.active = false;
    }
    if (label) {
      label.string = "全都要";
    }
  }

  private collectLineupHeroes(): any[] {
    const ids: number[] = [];
    const pushId = (value: any) => {
      const id = Number(value);
      if (!Number.isFinite(id) || ids.includes(id)) return;
      ids.push(id);
    };

    (GameData.heroOnField || []).forEach((hero) => pushId(hero.id));

    return ids
      .slice(0, HERO_ON_FIELD_LIMIT)
      .map((id) => HDM.getHeroList().find((hero) => hero.id === id))
      .filter(Boolean);
  }

  private loadPortrait(sprite: Sprite, heroUrl: string | undefined): void {
    const url = heroUrl || "default";
    loadResSingleAsset(`textures/hero/${url}/portrait/spriteFrame`, (asset) => {
      if (asset && sprite && sprite.isValid) {
        sprite.spriteFrame = asset;
      }
    });
  }

  private buildUpgradeChrome(skills: any[]): void {
    const old = this.node.getChildByName("UpgradeChrome");
    if (old) {
      old.destroy();
    }

    const chrome = new Node("UpgradeChrome");
    this.node.addChild(chrome);
    chrome.setSiblingIndex(1);
    chrome.addComponent(UITransform).setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);

    this.createChromeSprite(
      chrome,
      "UpgradeBackground",
      "textures/ui/skin1/upgrade_bg_split/spriteFrame",
      EDM.config.viewWidth,
      EDM.config.viewHeight,
      0,
      0,
      0,
    );
    this.createChromeSprite(
      chrome,
      "UpgradeTitleFrame",
      "textures/ui/skin1/upgrade_title_baked/spriteFrame",
      594,
      126,
      0,
      540,
      1,
    );
    this.createChromeSprite(
      chrome,
      "UpgradeLineupStrip",
      "textures/ui/skin1/upgrade_lineup_strip/spriteFrame",
      EDM.config.viewWidth,
      166,
      0,
      394,
      2,
    );
    this.styleGetAllButton();
  }

  /**
   * 使用 ItemCard 初始化技能面板（新方法）
   * @param skills 技能数据
   * @param gameController GameController实例（可选）
   */
  async initWithItemCard(skills: any[], gameController?: GameController) {
    this._gameController = gameController;

    // 保存所有技能数据，用于"全都要"功能
    if (Array.isArray(skills)) {
      this._allSkillsData = skills.slice();
    } else {
      this._allSkillsData = [];
      console.warn(
        "[SkillPanelController][initWithItemCard] skills 参数不是数组",
        skills,
      );
    }
    this.updateGetAllButtonVisible();

    // 设置缩放
    this.node
      .getChildByName("Bg")
      ?.getComponent(UITransform)
      ?.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);
    this.buildUpgradeChrome(skills);

    // 先设置透明度为0和缩放
    let uiOpacity = this.node.getComponent(UIOpacity);
    if (!uiOpacity) {
      uiOpacity = this.node.addComponent(UIOpacity);
    }
    uiOpacity.opacity = 0;

    // 清空现有内容
    const mainNode = this.node.getChildByName("Main");
    if (mainNode) {
      mainNode.removeAllChildren();
      mainNode.setPosition(new Vec3(0, -50, 0));
    }

    // 生成 ItemCard 内容
    skills.forEach((skillData) => {
      const itemCardNode = instantiate(this.itemCardPrefab);
      const itemCardCtrl = itemCardNode.getComponent(ItemCardController);

      if (itemCardCtrl) {
        // 判断是否为新英雄（有use_unit_id且没有skill_id）
        const isNewHero =
          skillData.use_unit_id !== undefined &&
          skillData.skill_id === undefined;
        // 初始化 ItemCard
        itemCardCtrl.init(skillData, isNewHero);
        // 绑定选择事件
        itemCardNode.on("card-selected", this.onItemCardSelect, this);
        // 添加到主节点
        if (mainNode) {
          mainNode.addChild(itemCardNode);
        }
      }
    });

    // 执行动画
    await this.playShowAnim();

    // Trigger guide when panel has loaded and opened
    GuideManager.instance.onSkillPanelOpened(this);
  }

  /**
   * ItemCard 选择事件处理
   */
  private async onItemCardSelect(data: any) {
    this._gameController?.hideHelpLayerGuide?.();

    // 首次上场：有use_unit_id且没有skill_id
    const isSkill =
      data.use_unit_id !== undefined && data.skill_id === undefined;
    // 技能效果升级：有effect_unit_id且有skill_id
    const isEffect =
      data.effect_unit_id !== undefined &&
      (data.skill_id !== undefined || data.skillId !== undefined);

    let handled = false;
    if (isSkill) {
      handled = await this.handleFirstSkillSelect(data);
    } else if (isEffect) {
      handled = await this.handleSkillEffectUpgrade(data);
    } else {
      console.warn(
        "[SkillPanelController][onItemCardSelect] 未能识别卡牌类型",
        data,
      );
      this.closePanel();
      return;
    }
    if (!handled || this._isClosed) {
      this.closePanel();
      return;
    }

    // 刷新英雄节点技能
    if (
      this._gameController &&
      typeof this._gameController.updateHeroNodesOnField === "function"
    ) {
      this._gameController.updateHeroNodesOnField();
    }

    await this.hideAndClosePanel();
  }

  /**
   * "全都要"按钮点击事件
   * 点击后看广告，看完后应用所有技能
   */
  private onSelectAllClick() {
    if (this._isGuideMode) {
      return;
    }

    this._gameController?.hideHelpLayerGuide?.();

    // 防止连点
    if (this._isProcessingSelectAll) {
      console.log(
        '[SkillPanelController] "全都要"操作正在进行中，忽略重复点击',
      );
      return;
    }

    // 检查数据有效性
    if (!Array.isArray(this._allSkillsData)) {
      console.error(
        "[SkillPanelController] _allSkillsData 不是数组:",
        this._allSkillsData,
      );
      this._allSkillsData = [];
      this.closePanel();
      return;
    }

    if (this._allSkillsData.length === 0) {
      console.warn("[SkillPanelController] 没有可选择的技能");
      this.closePanel();
      return;
    }

    // 设置处理标志，防止连点
    this._isProcessingSelectAll = true;

    const adKey = "skill_get_all";
    const uniqueAdKey = adKey; // 使用固定的唯一键，便于广告系统跟踪

    // 显示广告
    AdManager.showAd(
      uniqueAdKey,
      async () => {
        // OPS_JIANJIAN_2026_05: report "全都要" ad completion before granting all skills.
        this._gameController?.markJianjianOpsSelectAllAdCompleted?.();

        try {
          // 再次检查数据有效性（防止在广告播放期间数据被修改）
          if (!Array.isArray(this._allSkillsData)) {
            console.error(
              "[SkillPanelController] 广告回调中 _allSkillsData 不是数组:",
              this._allSkillsData,
            );
            this._allSkillsData = [];
            this._isProcessingSelectAll = false;
            this.closePanel();
            return;
          }

          GameData.heroOnField = GameData.heroOnField || [];

          // 广告观看成功，依次应用所有技能
          for (const skillData of this._allSkillsData) {
            const isSkill =
              skillData.use_unit_id !== undefined &&
              skillData.skill_id === undefined;
            const isEffect =
              skillData.effect_unit_id !== undefined &&
              (skillData.skill_id !== undefined ||
                skillData.skillId !== undefined);

            if (isSkill) {
              if (GameData.heroOnField.length >= HERO_ON_FIELD_LIMIT) {
                console.warn(
                  "[SkillPanelController][onSelectAllClick] 上场英雄已达上限，跳过新英雄卡",
                  skillData,
                );
                continue;
              }
              // 确保新英雄技能正确初始化
              await this.handleFirstSkillSelect(skillData);
            } else if (isEffect) {
              // 确保技能效果只应用到对应的英雄
              await this.handleSkillEffectUpgrade(skillData);
            } else {
              console.warn(
                "[SkillPanelController][onAllSelectClick] 未能识别卡牌类型",
                skillData,
              );
            }
          }

          // 刷新英雄节点技能
          if (
            this._gameController &&
            typeof this._gameController.updateHeroNodesOnField === "function"
          ) {
            this._gameController.updateHeroNodesOnField();
          }

          // 关闭面板
          await this.hideAndClosePanel();
        } catch (error) {
          console.error('[SkillPanelController] "全都要"操作出错:', error);
          this.closePanel();
        } finally {
          // 重置处理标志
          this._isProcessingSelectAll = false;
        }
      },
      (reason) => {
        console.log(
          '[SkillPanelController] 广告未看完，取消"全都要"操作:',
          reason,
        );
        // 重置处理标志
        this._isProcessingSelectAll = false;
      },
      adKey,
    );
  }

  private updateGetAllButtonVisible(): void {
    if (!this.getAllBtn) {
      return;
    }

    this.getAllBtn.interactable = !this._isGuideMode;
    this.getAllBtn.node.active = !this._isGuideMode;
  }
}
