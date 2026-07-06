import { _decorator, Prefab, Node, UITransform, instantiate, Label, Button, Sprite, SpriteFrame, Layout, ScrollView, UIOpacity, Mask, Size } from 'cc';
import { UIBase } from 'db://assets/utils/ui/UIBase';
import { loadResSingleAsset } from 'db://assets/utils/utils';
import { DYT, SidebarEventType, DyBtnName } from './DyTools';
import { EDM } from '../../data/env/ConfigManager';
const { ccclass, property } = _decorator;

enum SidebarButtonState {
    ENTER_SIDEBAR = 'enter-sidebar',
    CLAIM_REWARD = 'claim-reward',
    CLAIMED = 'claimed',
}

@ccclass('DyController')
export class DyController extends UIBase {
    @property(Node)
    gameNameNode: Node; // 游戏名称节点
    @property(Node)
    gameIconNode: Node; // 游戏图标节点
    @property(Node)
    btnNode: Node; // 按钮节点
    @property(Node)
    xcxNameNode: Node; // 游戏名称节点

    // 按钮相关节点
    private _btnLabel: Label | null = null;
    private _btnButton: Button | null = null;
    
    // 奖励状态
    private _canClaimReward: boolean = false;
    private _buttonState: SidebarButtonState = SidebarButtonState.ENTER_SIDEBAR;
    private readonly _handleRewardAvailable = () => this.onRewardAvailable();
    private readonly _handleRewardGranted = () => this.onRewardGranted();
    private readonly _handleSidebarRevisit = () => this.onSidebarRevisit();

    start() {
        this.initUI();
        this.setupEventListeners();
        this.updateButtonState();
    }

    onDestroy() {
        // 清理事件监听
        DYT.removeEventListener(SidebarEventType.REWARD_AVAILABLE, this._handleRewardAvailable);
        DYT.removeEventListener(SidebarEventType.REWARD_GRANTED, this._handleRewardGranted);
        DYT.removeEventListener(SidebarEventType.SIDEBAR_REVISIT, this._handleSidebarRevisit);
    }

    /**
     * 初始化UI
     */
    private initUI() {
        // 设置游戏名称
        if (this.gameNameNode) {
            const label = this.gameNameNode.getComponent(Label);
            if (label) {
                label.string = '点击进入:' + EDM.config.gameName;
            }
        }

        if (this.xcxNameNode) {
            const label = this.xcxNameNode.getComponent(Label);
            if (label) {
                label.string = EDM.config.gameName;
            }
        }

        // 设置游戏图标
        if (this.gameIconNode) {
            loadResSingleAsset(EDM.config.gameIcon, (spriteFrame: SpriteFrame) => {
                if (spriteFrame) {
                    const sprite = this.gameIconNode!.getComponent(Sprite);
                    if (sprite) {
                        sprite.spriteFrame = spriteFrame;
                    }
                }
            });
        }

        // 获取按钮组件
        if (this.btnNode) {
            this._btnLabel = this.btnNode.getComponent(Label) || this.btnNode.getComponentInChildren(Label);
            this._btnButton = this.btnNode.getComponent(Button);
        }
    }

    /**
     * 设置事件监听
     */
    private setupEventListeners() {
        // 监听奖励可用事件
        DYT.addEventListener(SidebarEventType.REWARD_AVAILABLE, this._handleRewardAvailable);
        
        // 监听奖励发放事件
        DYT.addEventListener(SidebarEventType.REWARD_GRANTED, this._handleRewardGranted);
        
        // 监听侧边栏复访事件
        DYT.addEventListener(SidebarEventType.SIDEBAR_REVISIT, this._handleSidebarRevisit);
    }

    /**
     * 更新按钮状态
     */
    private updateButtonState() {
        const rewardStatus = DYT.getSidebarRewardStatus();
        this._canClaimReward = rewardStatus.canClaim;
        const hasClaimedToday = rewardStatus.todayCount >= rewardStatus.maxDaily;

        if (hasClaimedToday) {
            this._buttonState = SidebarButtonState.CLAIMED;
            this.applyButtonPresentation(DyBtnName.CLAIMED, false);
            return;
        }

        if (this._canClaimReward) {
            this._buttonState = SidebarButtonState.CLAIM_REWARD;
            this.applyButtonPresentation(DyBtnName.REWARD, true);
            return;
        }

        this._buttonState = SidebarButtonState.ENTER_SIDEBAR;
        this.applyButtonPresentation(DyBtnName.ENTER_SIDEBAR, true);
    }

    private applyButtonPresentation(label: string, interactable: boolean) {
        if (this._btnLabel) {
            this._btnLabel.string = label;
        }

        if (this._btnButton) {
            this._btnButton.interactable = interactable;
        }
    }

    /**
     * 任务按钮点击事件
     */
    onTaskBtnClick() {
        if (this._buttonState === SidebarButtonState.CLAIMED) {
            return;
        }

        if (this._buttonState === SidebarButtonState.ENTER_SIDEBAR) {
            DYT.navigateToSidebar();
            return;
        }

        this.onRewardBtnClick();
    }

    /**
     * 奖励按钮点击事件
     */
    private onRewardBtnClick() {
        if (!this._canClaimReward) {
            console.log('当前无法领取奖励');
            return;
        }

        // 发放奖励
        const success = DYT.grantSidebarReward();
        if (success) {
            console.log('侧边栏复访奖励发放成功');
            // 更新UI状态
            this.updateButtonState();
        } else {
            console.log('侧边栏复访奖励发放失败');
        }
    }

    /**
     * 奖励可用事件回调
     */
    private onRewardAvailable() {
        console.log('侧边栏复访奖励可用');
        this.updateButtonState();
    }

    /**
     * 奖励发放事件回调
     */
    private onRewardGranted() {
        console.log('侧边栏复访奖励已发放');
        this.updateButtonState();
        
        // 这里可以添加奖励发放的UI效果
        // 例如：显示奖励弹窗、播放音效等
    }

    /**
     * 侧边栏复访事件回调
     */
    private onSidebarRevisit() {
        console.log('用户从侧边栏复访进入');
        this.updateButtonState();
        
        // 这里可以添加复访后的特殊处理
        // 例如：显示欢迎提示、特殊动画等
    }

    /**
     * 检查侧边栏场景是否可用
     */
    public checkSidebarAvailable(callback: (available: boolean) => void) {
        DYT.checkSidebarSceneAvailable(callback);
    }

    /**
     * 获取当前奖励状态
     */
    public getRewardStatus() {
        return DYT.getSidebarRewardStatus();
    }

    /**
     * 重置奖励数据（用于测试）
     */
    public resetRewardData() {
        DYT.resetSidebarRewardData();
        this.updateButtonState();
    }
}
