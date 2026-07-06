import { _decorator, Node, Prefab, instantiate, Label, tween, Vec3, UITransform, Color, Sprite } from 'cc';
import { UIBase } from 'db://assets/utils/ui/UIBase';
import { EasingType, JAM } from 'db://assets/utils/common/JuicyAnimationManager';
import { popupManager } from './PopupManager';
import { CDM, CurrencyType } from 'db://assets/utils/common/CurrencyManager';
import { HDM } from 'db://assets/utils/data/config/hero/HeroDataManager';
import { BackgroundBlurCapture } from 'db://assets/utils/ui/picture/BackgroundBlurCapture';
import { RewardItemController } from './RewardItemController';

const { ccclass, property } = _decorator;

interface IRewardItemData {
    type: any;
    amount: number;
    heroId?: number;
    name?: string;
    iconPath?: string;
}

interface IRewardReceivedPayload {
    items: IRewardItemData[];
    reason?: string;
    source?: string;
}

@ccclass('RewardReceivedController')
export class RewardReceivedController extends UIBase {
    @property(BackgroundBlurCapture)
    blurCapture: BackgroundBlurCapture | null = null;

    @property(Node)
    contentNode: Node;

    @property(Node)
    itemContainer: Node;

    @property(Prefab)
    itemPrefab: Prefab;

    @property
    autoCloseSeconds = 0;

    protected onShow(data?: IRewardReceivedPayload): void {
        const hiddenNodes: Node[] = [];
        if (this.contentNode.active) {
            hiddenNodes.push(this.contentNode);
            this.contentNode.active = false;
        }
        if (this.maskNode && this.maskNode.active) {
            hiddenNodes.push(this.maskNode);
            this.maskNode.active = false;
        }

        // 隐藏弹窗后截图底层 UI，
        // 下一帧再恢复弹窗显示。
        this.blurCapture?.captureOnce();

        if (hiddenNodes.length > 0) {
            this.scheduleOnce(() => {
                // 截图完成后恢复弹窗显示。
                hiddenNodes.forEach(node => {
                    if (node && node.isValid) node.active = true;
                });
                JAM.playSlideDownWithBounceAnimation(
                    this.contentNode.getChildByName('Dcr'),
                    { duration: 0.15, easing: EasingType.LINEAR },
                );
            }, 0);
        }

        if (this.autoCloseSeconds > 0) {
            this.scheduleOnce(() => this.onClose(), this.autoCloseSeconds);
        }
    }

    protected async onLoadData(data?: IRewardReceivedPayload): Promise<void> {
        const items = data?.items ?? [];
        this.renderItems(items.map((item) => this.normalizeItem(item)));
    }

    protected onHide(): void {
        popupManager.closeCurrentPopup();
    }

    private normalizeItem(item: IRewardItemData): IRewardItemData {
        const normalized: IRewardItemData = { ...item };

        if (!normalized.name) {
            if (normalized.type === CurrencyType.HeroFragment) {
                if (normalized.heroId != null) {
                    const hero = HDM.getHeroById(Number(normalized.heroId));
                    normalized.name = hero ? `${hero.name}碎片` : '英雄碎片';
                } else {
                    normalized.name = '英雄碎片';
                }
            } else {
                const config = CDM.getCurrencyConfig(normalized.type);
                normalized.name = config?.name || String(normalized.type);
            }
        }

        if (!normalized.iconPath) {
            if (normalized.type === CurrencyType.Gold) {
                normalized.iconPath = 'textures/icon/res/coin/spriteFrame';
            } else if (normalized.type === CurrencyType.Gem) {
                normalized.iconPath = 'textures/icon/res/res-gem01/spriteFrame';
            } else if (normalized.type === CurrencyType.Stamina) {
                normalized.iconPath = 'textures/icon/res/stamina/spriteFrame';
            } else if (normalized.type === CurrencyType.HeroFragment && normalized.heroId != null) {
                normalized.iconPath = HDM.getHeroPathById(Number(normalized.heroId), 'portrait');
            }
        }

        return normalized;
    }

    private renderItems(items: IRewardItemData[]): void {
        this.itemContainer.removeAllChildren();

        const nodes: Node[] = [];
        items.forEach((item) => {
            const node = instantiate(this.itemPrefab);
            const ctrl = node.getComponent(RewardItemController);
            if (ctrl) {
                ctrl.init(item);
            } else {
                const label = node.getComponent(Label) || node.addComponent(Label);
                label.string = `${item.name || '奖励'} +${item.amount}`;
            }
            this.applyItemBgColor(node, item);
            this.itemContainer.addChild(node);
            node.active = false;
            nodes.push(node);
        });

        const columns = 4;
        const spaceX = 32;
        const spaceY = 32;
        const shiftDeltaX = 80;
        this.layoutItems(nodes, columns, spaceX, spaceY);
        this.applyFirstRowInitialPositions(nodes, columns, shiftDeltaX);
        this.scheduleOnce(() => {
            void this.playItemSequence(nodes, columns, shiftDeltaX);
        }, 0);
    }

    private layoutItems(nodes: Node[], columns: number, spaceX: number, spaceY: number): void {
        if (nodes.length === 0) return;
        const containerTransform = this.itemContainer.getComponent(UITransform);
        if (!containerTransform) return;

        const firstTransform = nodes[0].getComponent(UITransform);
        const itemWidth = firstTransform?.contentSize.width ?? 0;
        const itemHeight = firstTransform?.contentSize.height ?? 0;
        if (itemWidth === 0 || itemHeight === 0) return;

        const colCount = Math.min(columns, nodes.length);
        const rowCount = Math.ceil(nodes.length / columns);
        const totalWidth = colCount * itemWidth + (colCount - 1) * spaceX;
        const totalHeight = rowCount * itemHeight + (rowCount - 1) * spaceY;
        containerTransform.setContentSize(totalWidth, totalHeight);

        const startX = -totalWidth / 2 + itemWidth / 2;
        const startY = -itemHeight / 2;

        nodes.forEach((node, index) => {
            const row = Math.floor(index / columns);
            const col = index % columns;
            const x = startX + col * (itemWidth + spaceX);
            const y = startY - row * (itemHeight + spaceY);
            node.setPosition(x, y, 0);
        });
    }

    private applyFirstRowInitialPositions(nodes: Node[], columns: number, shiftDeltaX: number): void {
        const count = Math.min(columns, nodes.length);
        for (let i = 0; i < count; i++) {
            const pos = nodes[i].getPosition();
            nodes[i].setPosition(i * shiftDeltaX, pos.y, pos.z);
        }
    }

    private async playItemSequence(nodes: Node[], columns: number, shiftDeltaX: number): Promise<void> {
        const firstRowCount = Math.min(columns, nodes.length);
        for (let i = 0; i < nodes.length; i++) {
            const shouldShift = i < firstRowCount - 1;
            const onFirstScaleComplete = shouldShift
                ? (moveDuration: number) => this.shiftFirstRow(nodes, i, firstRowCount, shiftDeltaX, moveDuration)
                : undefined;
            await this.playItemAppear(nodes[i], onFirstScaleComplete);
        }
    }

    private playItemAppear(node: Node, onFirstScaleComplete?: (moveDuration: number) => void): Promise<void> {
        const originalScale = node.getScale().clone();
        node.active = true;
        node.setScale(0, 0, originalScale.z);
        const firstScaleDuration = 0.05;
        const secondScaleDuration = 0.08;
        const thirdScaleDuration = 0.05;
        const moveDuration = secondScaleDuration + thirdScaleDuration;
        return new Promise(resolve => {
            tween(node)
                .to(firstScaleDuration, { scale: new Vec3(originalScale.x * 1.05, originalScale.y * 1.05, originalScale.z) }, { easing: 'backOut' })
                .call(() => {
                    onFirstScaleComplete?.(moveDuration);
                })
                .to(secondScaleDuration, { scale: new Vec3(originalScale.x * 0.95, originalScale.y * 0.95, originalScale.z) }, { easing: 'quadOut' })
                .to(thirdScaleDuration, { scale: originalScale }, { easing: 'backOut' })
                .call(() => resolve())
                .start();
        });
    }

    private applyItemBgColor(node: Node, item: IRewardItemData): void {
        const bgNode = node.getChildByName('Bg');
        const bgSprite = bgNode?.getComponent(Sprite);
        if (!bgSprite) return;

        let colorHex = '#d9d9d9';
        if (item.type === CurrencyType.Gem) {
            colorHex = '#89cbeb';
        } else if (item.type === CurrencyType.Stamina) {
            colorHex = '#b9dd94';
        } else if (item.type === CurrencyType.HeroFragment) {
            const hero = HDM.getHeroById(Number(item.heroId));
            const rarityValue = hero?.rarity;
            if (rarityValue) {
                const rarityConfig = HDM.getUnitRarityByName(rarityValue)
                    || HDM.getUnitRarityByKey(rarityValue)
                    || HDM.getUnitRarityByKey(`RARITY_${rarityValue}`);
                if (rarityConfig?.color) colorHex = rarityConfig.color;
            }
        }

        bgSprite.color = new Color().fromHEX(colorHex);
    }

    private shiftFirstRow(
        nodes: Node[],
        lastIndex: number,
        firstRowCount: number,
        shiftDeltaX: number,
        duration: number
    ): void {
        const count = Math.min(lastIndex + 1, firstRowCount, nodes.length);
        for (let i = 0; i < count; i++) {
            const node = nodes[i];
            if (!node || !node.isValid) continue;
            const pos = node.getPosition();
            tween(node)
                .to(duration, { position: new Vec3(pos.x - shiftDeltaX, pos.y, pos.z) }, { easing: 'quadOut' })
                .start();
        }
    }

    public onClose(): void {
        this.hide();
    }
}
