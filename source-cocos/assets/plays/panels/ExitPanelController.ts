import { _decorator, Component, director, UITransform } from 'cc';
import { resetGameData } from '../../utils/data/config/manager/GameDataManager';
import { CDM } from '../../utils/common/CurrencyManager';
import { GAME_PAUSE_REASONS, gameBus } from '../../utils/signal/GameBus';
import { SIGNAL_TYPES } from '../../utils/signal/ISignal';
import { EDM } from '../../utils/data/env/ConfigManager';
import { Skin1UIPolish } from '../../utils/ui/skin1/Skin1UIPolish';

const { ccclass } = _decorator;

@ccclass('ExitPanelController')
export class ExitPanelController extends Component {
    private _rewards: any = null;

    start() {}

    init(rewards?: any) {
        this._rewards = rewards || null;
        this.node.getChildByName('Bg')?.getComponent(UITransform)?.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);
        Skin1UIPolish.applyPanel(this.node);
        // 暂停游戏
        gameBus.pause(GAME_PAUSE_REASONS.EXIT_PANEL);
        // 如有结算奖励，显示到UI（若有对应节点）。这里仅广播，不强依赖UI存在
        if (this._rewards) {
            try {
                gameBus.emit('battle_rewards_preview', this._rewards);
            } catch {}
        }
    }

    // 确定
    onSure() {
        // 在退出前同步资源数据
        this.syncResourcesBeforeExit();
        
        // 重置
        resetGameData();

        director.loadScene('Home');
    }

    // 取消
    onCancel() {
        // 继续
        gameBus.resume(GAME_PAUSE_REASONS.EXIT_PANEL);

        this.node.destroy();
    }

    /**
     * 退出前同步资源数据
     */
    private syncResourcesBeforeExit(): void {
        try {
            // 获取当前资源状态
            const currentResources = {
                coin: CDM.getCoin() || 0,
                gem: CDM.getGem() || 0,
                stamina: CDM.getStamina() || 0
            };

            // 触发资源同步事件
            gameBus.emit(SIGNAL_TYPES.CURRENCY_CHANGED, {
                type: 'exit_sync',
                resources: currentResources,
                rewards: this._rewards || null
            });
            // 广播关卡奖励，Home 等场景可监听展示“获得物品”
            if (this._rewards) {
                gameBus.emit('battle_rewards_settled', this._rewards);
            }

            console.log('[ExitPanelController] 退出前资源同步完成:', currentResources);
        } catch (error) {
            console.error('[ExitPanelController] 资源同步失败:', error);
        }
    }
}
