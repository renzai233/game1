import { _decorator, Component, Label, Node, Sprite } from 'cc';
import { loadResSingleAsset } from 'db://assets/utils/utils';
const { ccclass, property } = _decorator;

@ccclass('ItemController')
export class ItemController extends Component {
    start() {}

    init(data) {
        // 如果是英雄碎片，显示英雄头像
        if (data['heroId'] && data['heroUrl']) {
            this.loadHeroPortrait(data);
        } else {
            // 普通物品显示
            this.loadItemSprite(data);
        }

        // 物品名称
        if (this.node) {
            this.node.getChildByName('Name').getComponent(Label).string = `${data['number']}`;
        }
    }

    /**
     * 加载英雄头像
     */
    private loadHeroPortrait(data: any): void {
        const heroUrl = data['heroUrl'];
        const path = `textures/hero/${heroUrl}/portrait/spriteFrame`;
        
        loadResSingleAsset(path, (spriteFrame) => {
            if (this.node && spriteFrame) {
                this.node.getChildByName('Sprite').getComponent(Sprite).spriteFrame = spriteFrame;
            } else {
                // 如果英雄头像加载失败，使用默认图片
                console.warn(`[ItemController] 无法加载英雄头像: ${path}，使用默认图片`);
                this.loadDefaultImage('hero_fragment');
            }
        });
    }

    /**
     * 加载物品图片
     */
    private loadItemSprite(data: any): void {
        let path = `textures/icon/res/${data['url']}/spriteFrame`;

        // 物品图片
        loadResSingleAsset(path, (spriteFrame) => {
            if (this.node && spriteFrame) {
                this.node.getChildByName('Sprite').getComponent(Sprite).spriteFrame = spriteFrame;
            } else {
                // 如果加载失败，使用默认图片
                console.warn(`[ItemController] 无法加载图片: ${path}，使用默认图片`);
                this.loadDefaultImage(data['url']);
            }
        });
    }

    /**
     * 加载默认图片
     * @param itemType 物品类型
     */
    private loadDefaultImage(itemType: string): void {
        let defaultPath = '';
        
        // 根据物品类型选择默认图片
        switch (itemType) {
            case 'gem':
                // 宝石使用钻石图片作为默认（因为都是宝石类）
                defaultPath = 'textures/icon/res/gem/spriteFrame';
            case 'hero_fragment':
                // 英雄碎片使用钻石图片作为默认（因为都是稀有物品）
            case 'stamina':
                // 体力使用钻石图片作为默认
                defaultPath = 'textures/icon/res/stamina/spriteFrame';
                break;
            default:
                // 其他情况使用金币图片作为默认
                defaultPath = 'textures/icon/res/coin01/spriteFrame';
                break;
        }
        
        if (defaultPath) {
            loadResSingleAsset(defaultPath, (spriteFrame) => {
                if (this.node && spriteFrame) {
                    this.node.getChildByName('Sprite').getComponent(Sprite).spriteFrame = spriteFrame;
                    console.log(`[ItemController] 使用默认图片: ${defaultPath} 替代 ${itemType}`);
                } else {
                    console.error(`[ItemController] 默认图片也加载失败: ${defaultPath}`);
                }
            });
        }
    }

    update(deltaTime: number) {}
}
