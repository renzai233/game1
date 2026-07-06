import { _decorator, Component, director, instantiate, Label, Node, Prefab } from 'cc';
import { ItemController } from '../ItemController';
const { ccclass, property } = _decorator;

@ccclass('StarUpPanelController')
export class StarUpPanelController extends Component {
    @property(Prefab)
    itemPrefab: Prefab; // 物品预制体
    @property(Prefab)
    messagePrefab: Prefab; // message预制体
    @property(Prefab)
    starPrefab: Prefab; // 星级预制体

    @property(Node)
    itemBoxNode: Node; // 物品box节点

    _hero: object = {}; // 英雄
    _data: [] = []; // 资源数据

    start() { }

    init(hero, data) {
        this._hero = JSON.parse(JSON.stringify(hero));
        this._data = JSON.parse(JSON.stringify(data));

        data.forEach((v) => {
            let itemPrefab = instantiate(this.itemPrefab);
            itemPrefab.getComponent(ItemController).init(v);
            this.itemBoxNode.addChild(itemPrefab);
        });
    }

    // 升星
    onStarUp() { }

    // 关闭弹窗
    onClose() {
        this.node.destroy();
    }

    update(deltaTime: number) { }
}
