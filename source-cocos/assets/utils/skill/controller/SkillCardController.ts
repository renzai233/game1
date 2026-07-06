import { _decorator, Component, instantiate, Label, Node, Prefab, Sprite, UITransform } from 'cc';
import { loadResSingleAsset } from 'db://assets/utils/utils';
import { StarController } from 'db://assets/script/prefab/Star/StarController';
const { ccclass, property } = _decorator;

@ccclass('SkillCardController')
export class SkillCardController extends Component {

    @property(Prefab)
    starPrefab: Prefab; // 星级预制体
    @property(Node)
    spriteNode: Node; // 技能图标节点
    _data: any = {}; // 技能数据

    init(skill: any) {
        this._data = skill;

        // 技能名称
        this.node.getChildByName('Main').getChildByName('Name').getComponent(Label).string = skill.skillName ?? skill.name;
        // 技能描述
        this.node.getChildByName('Main').getChildByName('Desc').getComponent(Label).string = skill.skillDesc ?? skill.desc;

        // 生成精灵图
        let path = `textures/hero/${skill.url ?? "default"}/portrait/spriteFrame`;
        loadResSingleAsset(path, (data) => {
            this.spriteNode.getComponent(Sprite).spriteFrame = data;
        });

        // 技能星级
        for (let i = 0; i < skill.skillMaxStar; i++) {
            const starNode = this.createStarNode(i <= skill.skillStar - 1);
            this.node.getChildByName('Main').getChildByName('Star').addChild(starNode);
        }
    }

    private createStarNode(highlight: boolean): Node {
        if (this.starPrefab) {
            const starNode = instantiate(this.starPrefab);
            const controller = starNode.getComponent(StarController);
            if (controller) {
                controller.init(highlight ? 'highlight' : '');
            }
            return starNode;
        }

        const starNode = new Node(highlight ? 'StarHighlight' : 'StarNormal');
        starNode.addComponent(UITransform).setContentSize(28, 28);
        const sprite = starNode.addComponent(Sprite);
        const path = highlight ? 'textures/icon/other/star/spriteFrame' : 'textures/icon/other/star-silver/spriteFrame';
        loadResSingleAsset(path, (data) => {
            if (data) {
                sprite.spriteFrame = data;
            }
        });
        return starNode;
    }

    /**
     * 技能卡牌被选择
     * 1. 判断是新技能还是已学技能
     * 2. 新技能则初始化属性，已学技能则升级属性
     * 3. 更新 GameData.heroSkills 结构，保证每个英雄每个技能独立存储属性、等级、星级
     * 4. 刷新英雄节点技能
     * 5. 详细注释每一步
     */
    onSelect() {
        // 发布skill_data事件，让SkillPanelController的订阅可以感知
        this.node.emit('skill_data', this._data);
    }
}
