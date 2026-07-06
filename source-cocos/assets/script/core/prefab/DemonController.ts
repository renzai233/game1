import { _decorator, director } from 'cc';
import { UnitController } from './UnitController';
import { GameData } from 'db://assets/utils/data/config/manager/GameDataManager';
const { ccclass, property } = _decorator;

@ccclass('DemonController')
export class DemonController extends UnitController {

    // 移动
    onMove() {
        // 游戏启动场景，调试使用正式删除            
        let x = this.node.position.x;
        let y = this.node.position.y;
        this.node.setPosition(x, y - this.moveSpeed * GameData.speedScale, 0);
    }
}
