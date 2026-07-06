import { _decorator, Component, Node, Label, Button, Sprite, Widget, Layout, Size, Color, UIOpacity, Vec3, SpriteFrame, Texture2D } from 'cc';
import { EDM } from '../../utils/data/env/ConfigManager';
import { UITransform } from 'cc';
import { loadResSingleAsset } from 'db://assets/utils/utils';
import { BAG_TAB_TYPE, IBagItemData } from './BagConfig';
import { BagPanelController } from './BagPanel';
import { UNIT_RARITY, UNIT_RARITY_ICON_BG } from '../../utils/data/dict/base/UnitAttrList';
import { CDM, CurrencyType } from '../../utils/common/CurrencyManager';
import { HDM } from '../../utils/data/config/hero/HeroDataManager';

const { ccclass, property } = _decorator;

const SKIN1_VAULT_SLOT_FRAME = 'textures/ui/skin1/polish/vault_slot_frame/texture';

/**
 * 背包资源项控制器
 */
@ccclass('BagItemController')
export class BagItemController extends Component {
    @property({ type: Label, tooltip: '资源名称' })
    nameLabel: Label = null!;
    @property({ type: Label, tooltip: '资源描述' })
    descLabel: Label = null!;
    @property({ type: Sprite, tooltip: '资源背景' })
    bgSprite: Sprite = null!;
    @property({ type: Sprite, tooltip: '资源图标' })
    iconSprite: Sprite = null!;
    @property({ type: Label, tooltip: '拥有数量' })
    ownNumLabel: Label = null!;

    private _itemData: IBagItemData | null = null;
    private _bagController: BagPanelController | null = null;
    private _layoutParams: {
        itemWidth: number;
        itemHeight: number;
        spacing: number;
        padding: number;
        scaleRatio: number;
    } | null = null;
    private _iconPath: string = 'textures/icon/res/coin/spriteFrame';
    private _bgPath: string = 'textures/icon/bg/card-bg/spriteFrame';

    /**
     * 初始化资源项
     * @param itemData 资源数据
     * @param bagController 背包控制器
     * @param layoutParams 布局参数（可选）
     */
    public init(itemData: IBagItemData, bagController: BagPanelController, layoutParams?: {
        itemWidth: number;
        itemHeight: number;
        spacing: number;
        padding: number;
        scaleRatio: number;
    }): void {
        this._itemData = itemData;
        this._bagController = bagController;
        this._layoutParams = layoutParams || null;

        // 根据布局参数调整资源项大小
        this.adjustItemSize();
        this.updateDisplay();
    }

    /**
     * 根据布局参数调整资源项大小
     */
    private adjustItemSize(): void {
        if (!this._layoutParams) {
            console.warn('[BagItemController] 布局参数未设置，跳过大小调整');
            return;
        }

        const { itemWidth, itemHeight, scaleRatio } = this._layoutParams;

        // 调整资源项根节点大小
        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.width = itemWidth;
            uiTransform.height = itemHeight;
        }

        // 调整背景大小
        const background = this.node.getChildByName('Background');
        if (background) {
            const backgroundTransform = background.getComponent(UITransform);
            if (backgroundTransform) {
                backgroundTransform.width = itemWidth;
                backgroundTransform.height = itemHeight;
            }
        }

        this.applySkin1VaultStyle(itemWidth, itemHeight);

        // 调整字体大小
        this.adjustFontSizes(scaleRatio);
        // 调整图标大小
        this.adjustIconSize(scaleRatio);
        // 确保Widget组件配置正确
        this.adjustWidgetComponent();
    }

    /**
     * 调整Widget组件配置
     */
    private adjustWidgetComponent(): void {
        const widget = this.node.getComponent(Widget);
        if (widget) {
            // 确保Widget组件不会与Layout冲突
            widget.isAlignLeft = false;
            widget.isAlignRight = false;
            widget.isAlignTop = false;
            widget.isAlignBottom = false;
        }
    }

    /**
     * 调整字体大小
     */
    private adjustFontSizes(scaleRatio: number): void {
        // 调整资源名称字体大小
        if (this.nameLabel) {
            const baseFontSize = 18;
            this.nameLabel.fontSize = this._layoutParams ? Math.round(baseFontSize * scaleRatio) : baseFontSize;
            this.nameLabel.lineHeight = Math.round(this.nameLabel.fontSize * 1.25);
            this.nameLabel.enableOutline = true;
            this.nameLabel.outlineColor = new Color(0, 0, 0, 190);
            this.nameLabel.outlineWidth = 1;
        }
        // 调整资源描述字体大小
        if (this.descLabel) {
            const baseFontSize = 14;
            this.descLabel.fontSize = this._layoutParams ? Math.round(baseFontSize * scaleRatio) : baseFontSize;
            this.descLabel.lineHeight = Math.round(this.descLabel.fontSize * 1.25);
        }
    }

    private applySkin1VaultStyle(itemWidth: number, itemHeight: number): void {
        this.node.setScale(new Vec3(1, 1, 1));

        if (this.bgSprite && this.bgSprite.node) {
            const background = this.bgSprite.node;
            background.setPosition(new Vec3(0, 0, 0));
            const backgroundTransform = background.getComponent(UITransform) || background.addComponent(UITransform);
            backgroundTransform.setContentSize(itemWidth + 10, itemHeight + 10);

            this.bgSprite.type = Sprite.Type.SIMPLE;
            this.bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.bgSprite.color = Color.WHITE;
            const opacity = background.getComponent(UIOpacity) || background.addComponent(UIOpacity);
            opacity.opacity = 255;

            loadResSingleAsset(SKIN1_VAULT_SLOT_FRAME, (asset) => {
                if (!this.bgSprite || !this.bgSprite.node?.isValid || !asset) return;
                const spriteFrame = new SpriteFrame();
                spriteFrame.texture = asset as Texture2D;
                this.bgSprite.spriteFrame = spriteFrame;
            }, Texture2D);
        }

        if (this.iconSprite?.node) {
            this.iconSprite.node.setPosition(new Vec3(0, 12, 0));
            this.iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }

        if (this.ownNumLabel?.node) {
            const labelNode = this.ownNumLabel.node;
            const widget = labelNode.getComponent(Widget);
            if (widget) widget.enabled = false;
            labelNode.setPosition(new Vec3(itemWidth * 0.29, -itemHeight * 0.31, 0));
            const labelTransform = labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform);
            labelTransform.setContentSize(76, 28);
        }
    }

    /**
     * 调整图标大小
     */
    private adjustIconSize(scaleRatio: number): void {
        if (this.iconSprite) {
            // 根据标签类型设置图标路径
            if (this._itemData?.tabType === BAG_TAB_TYPE.FRAGMENT) {
                // 碎片类型：使用英雄头像
                const hero = HDM.getHeroList().find(hero => String(hero.id) === String(this._itemData?.id));
                if (hero) {
                    // 根据英雄稀有度设置背景
                    switch (hero.rarity) {
                        case UNIT_RARITY.COMMON:
                            this._bgPath = UNIT_RARITY_ICON_BG.COMMON;
                            break;
                        case UNIT_RARITY.RARE:
                            this._bgPath = UNIT_RARITY_ICON_BG.RARE;
                            break;
                        case UNIT_RARITY.EPIC:
                            this._bgPath = UNIT_RARITY_ICON_BG.EPIC;
                            break;
                        case UNIT_RARITY.LEGENDARY:
                            this._bgPath = UNIT_RARITY_ICON_BG.LEGENDARY;
                            break;
                        case UNIT_RARITY.SR:
                            this._bgPath = UNIT_RARITY_ICON_BG.SR;
                            break;
                        case UNIT_RARITY.SSR:
                            this._bgPath = UNIT_RARITY_ICON_BG.SSR;
                            break;
                    }
                    // 仓库格统一使用晶核保险库外框，英雄稀有度只保留在图标本体上。
                }
            }

            if (this._itemData?.icon) {
                this._iconPath = this._itemData.icon;
            }

            // 加载图标
            loadResSingleAsset(this._iconPath, (data) => {
                this.iconSprite.spriteFrame = data;
                const iconTransform = this.iconSprite.getComponent(UITransform);
                if (iconTransform && this._layoutParams) {
                    const iconSize = Math.max(82, this._layoutParams.itemWidth - 54);
                    iconTransform.width = iconSize;
                    iconTransform.height = iconSize;
                } else if (iconTransform) {
                    // 使用默认尺寸
                    iconTransform.width = 96;
                    iconTransform.height = 96;
                }
                this.iconSprite.color= new Color(255,255,255)
            })
        }
    }

    /**
     * 更新显示
     */
    private updateDisplay(): void {
        if (!this._itemData) {
            console.error('[BagItemController] 资源数据为空');
            return;
        }

        // 设置资源名称 - 支持本地化
        if (this.nameLabel) {
            const localizedName = EDM.getText(`bag.item.${this._itemData.id}.name`) || this._itemData.name;
            this.nameLabel.string = localizedName;
        }

        // 设置资源描述 - 支持本地化
        if (this.descLabel) {
            const localizedDesc = EDM.getText(`bag.item.${this._itemData.id}.desc`) || this._itemData.desc;
            this.descLabel.string = localizedDesc;
        }

        // 设置拥有数量 - 使用CurrencyManager获取实时数据
        if (this.ownNumLabel) {
            let amount: number = 0;

            if (this._itemData.resType === CurrencyType.HeroFragment) {
                // 英雄碎片特殊处理：获取对应英雄的碎片数量
                if (this._itemData.heroId) {
                    amount = CDM.getHeroFragmentCount(this._itemData.heroId);
                } else {
                    amount = 0;
                    console.warn(`[BagItemController] 英雄碎片项缺少heroId: ${this._itemData.name}`);
                }
            } else {
                // 其他货币直接从CurrencyManager获取
                const resourceType = this.getResourceTypeFromBagItem();
                if (resourceType) {
                    const currencyAmount = CDM.getCurrency(resourceType);
                    amount = typeof currencyAmount === 'number' ? currencyAmount : 0;
                }
            }

            this.ownNumLabel.string = `x${amount}`;
            this.ownNumLabel.fontSize = 18;
            this.ownNumLabel.lineHeight = 24;
            this.ownNumLabel.isBold = true;
            this.ownNumLabel.color = new Color(255, 238, 166, 255);
            this.ownNumLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            this.ownNumLabel.verticalAlign = Label.VerticalAlign.CENTER;
            this.ownNumLabel.overflow = Label.Overflow.SHRINK;
            this.ownNumLabel.enableOutline = true;
            this.ownNumLabel.outlineColor = new Color(0, 0, 0, 225);
            this.ownNumLabel.outlineWidth = 2;
        }
    }



    /**
     * 根据背包项数据获取对应的CurrencyType
     */
    private getResourceTypeFromBagItem(): CurrencyType | null {
        if (!this._itemData) return null;

        // 直接使用背包项的resType，它已经是CurrencyType类型
        if (this._itemData.resType) {
            return this._itemData.resType;
        }

        // 如果resType未设置，根据ID进行映射（备用方案）
        if (this._itemData.id.includes('coin')) {
            return CurrencyType.Gold;
        } else if (this._itemData.id.includes('gem')) {
            return CurrencyType.Gem;
        } else if (this._itemData.id.includes('fragment') || this._itemData.id === '1') {
            return CurrencyType.HeroFragment;
        } else if (this._itemData.id.includes('stamina')) {
            return CurrencyType.Stamina;
        }

        return null;
    }

    /**
     * 格式化价格显示
     * @param price 价格
     */
    private formatPrice(price: any[]): string {
        if (price.length === 0) {
            return EDM.getText('bag.price.free') || '免费';
        }
        // return price.map((p: any) => `${p.amount} ${this.getResourceName(p.type)}`).join(' + ');
        return price[0].amount || '1';
    }


    /**
     * 刷新本地化
     */
    public refreshLocalization(): void {
        if (!this._itemData) return;
        // 设置资源名称 - 支持本地化
        if (this.nameLabel) {
            const localizedName = EDM.getText(`bag.item.${this._itemData.id}.name`) || this._itemData.name;
            this.nameLabel.string = localizedName;
        }

        // 设置资源描述 - 支持本地化
        if (this.descLabel) {
            const localizedDesc = EDM.getText(`bag.item.${this._itemData.id}.desc`) || this._itemData.desc;
            this.descLabel.string = localizedDesc;
        }

        // 更新拥有数量 - 使用CurrencyManager获取实时数据
        if (this.ownNumLabel) {
            let amount: number = 0;

            if (this._itemData.resType === CurrencyType.HeroFragment) {
                // 英雄碎片特殊处理：获取对应英雄的碎片数量
                if (this._itemData.heroId) {
                    amount = CDM.getHeroFragmentCount(this._itemData.heroId);
                } else {
                    amount = 0;
                    console.warn(`[BagItemController] 英雄碎片项缺少heroId: ${this._itemData.name}`);
                }
            } else {
                // 其他货币直接从CurrencyManager获取
                const resourceType = this.getResourceTypeFromBagItem();
                if (resourceType) {
                    const currencyAmount = CDM.getCurrency(resourceType);
                    amount = typeof currencyAmount === 'number' ? currencyAmount : 0;
                }
            }

            this.ownNumLabel.string = `x${amount}`;
            this.ownNumLabel.fontSize = 18;
            this.ownNumLabel.lineHeight = 24;
            this.ownNumLabel.isBold = true;
            this.ownNumLabel.color = new Color(255, 238, 166, 255);
            this.ownNumLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            this.ownNumLabel.verticalAlign = Label.VerticalAlign.CENTER;
            this.ownNumLabel.overflow = Label.Overflow.SHRINK;
            this.ownNumLabel.enableOutline = true;
            this.ownNumLabel.outlineColor = new Color(0, 0, 0, 225);
            this.ownNumLabel.outlineWidth = 2;
        }
    }
} 
