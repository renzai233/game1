import { _decorator, Node, Sprite, Label, Button, UIOpacity, SpriteFrame, AudioClip, AudioSource, director } from 'cc';
import { SignInTaskManager } from './SignInTaskManager';
import { SignInTask } from './types';
import { UIBase } from 'db://assets/utils/ui/UIBase';
import { CurrencyType, CDM } from 'db://assets/utils/common/CurrencyManager';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { resManager, ResourceType } from 'db://assets/utils/data/config/manager/ResourceManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
const { ccclass, property } = _decorator;

@ccclass('SignInTaskController')
export class SignInTaskController extends UIBase {
    @property(Node)
    contentNode: Node;

    @property(Node)
    taskContainer: Node;

    @property(Node)
    titleNode: Node;

    @property(AudioClip)
    claimSound: AudioClip;

    @property(AudioClip)
    unlockSound: AudioClip;

    private taskManager: SignInTaskManager;
    private taskNodes: Map<number, Node> = new Map();
    private isAnimating = false;
    private lastCheckDate = '';

    onLoad() {
        void this.initialize();
    }

    /**
     * 初始化：等待数据、绑定节点并刷新 UI
     */
    private async initialize(): Promise<void> {
        if (EDM.isDev()) console.log('SignInTaskController: 开始初始化');

        this.taskManager = SignInTaskManager.instance;
        await this.taskManager.ensureReady();

        this.initTaskNodes();
        this.updateAllTaskUI();

        this.lastCheckDate = this.getTodayDate();
        this.schedule(this.checkReset, 60);
    }

    /**
     * 打开面板时刷新数据与 UI
     */
    public async show(data?: any): Promise<void> {
        if (EDM.isDev()) console.log('SignInTaskController: 显示面板');

        await super.show(data);

        if (!this.taskManager) {
            this.taskManager = SignInTaskManager.instance;
        }

        await this.taskManager.ensureReady();

        this.checkReset();
        this.updateAllTaskUI();
    }

    private getTodayDate(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 检查跨天或跨周重置
     */
    private checkReset() {
        try {
            const today = this.getTodayDate();
            if (this.taskManager?.checkAndResetIfNeeded()) {
                if (EDM.isDev()) console.log('签到任务已重置');
                this.updateAllTaskUI();
                this.lastCheckDate = today;
                return;
            } else {
                if (EDM.isDev()) console.warn('taskManager 未正确初始化');
            }

            if (this.lastCheckDate !== today) {
                this.lastCheckDate = today;
                this.updateAllTaskUI();
            }
        } catch (error) {
            if (EDM.isDev()) console.error('检查重置失败:', error);
        }
    }

    /**
     * 收集并绑定签到节点
     */
    private initTaskNodes() {
        this.taskNodes.clear();

        const root = this.taskContainer || this.node;
        const tasks = this.taskManager.getAllTasks();
        tasks.forEach(task => {
            const giftName = `SignInGift-${String(task.id).padStart(3, '0')}`;
            const giftNode = this.findNodeByName(root, giftName);
            if (giftNode) {
                this.taskNodes.set(task.id, giftNode);
                this.setupTaskNode(giftNode, task.id);
            } else {
                if (EDM.isDev()) console.warn(`未找到任务节点: ${giftName}`);
            }
        });
    }

    /**
     * 递归查找子节点
     */
    private findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findNodeByName(child, name);
            if (found) return found;
        }
        return null;
    }

    /**
     * 绑定点击事件
     */
    private setupTaskNode(taskNode: Node, taskId: number) {
        taskNode.on(Button.EventType.CLICK, () => {
            this.onGiftButtonClick(taskId);
        }, this);
    }

    /**
     * 刷新所有任务 UI
     */
    private updateAllTaskUI() {
        if (!this.taskManager) return;

        const allTasks = this.taskManager.getAllTasks();
        allTasks.forEach(task => {
            this.updateTaskUI(task.id);
        });
    }

    /**
     * 刷新单个任务 UI
     */
    private updateTaskUI(taskId: number) {
        const taskNode = this.taskNodes.get(taskId);
        const task = this.taskManager.getTask(taskId);

        if (!taskNode || !task) {
            if (EDM.isDev()) console.warn(`任务${taskId}的节点或数据不存在`);
            return;
        }

        const itemContent = taskNode.getChildByName('Item-Content');
        const purchaseNode = itemContent ? itemContent.getChildByName('Purchase') : taskNode.getChildByName('Purchase');
        const checkmarkNode = taskNode.getChildByName('Checkmark');
        const noticeNode = taskNode.getChildByName('Notice');

        this.updateGiftPreview(taskNode, task);

        const claimable = this.taskManager.isClaimable(taskId);
        const dayNumber = this.taskManager.getTaskDayNumber(taskId) ?? task.id;

        if (itemContent) {
            const opacity = itemContent.getComponent(UIOpacity) || itemContent.addComponent(UIOpacity);
            opacity.opacity = task.claimed ? 100 : 255;
        }
        if (checkmarkNode) checkmarkNode.active = task.claimed;
        if (noticeNode) noticeNode.active = claimable && !task.claimed;

        this.updateButtonLabel(purchaseNode, `第${dayNumber}天`);

        const buttonComp = taskNode.getComponent(Button);
        if (buttonComp) {
            buttonComp.interactable = claimable && !task.claimed;
        }
    }

    /**
     * 更新礼包预览（图标与数量）
     */
    private updateGiftPreview(taskNode: Node, task: SignInTask) {
        const itemContent = taskNode.getChildByName('Item-Content');
        if (!itemContent) return;

        const objNode = itemContent.getChildByName('Obj');
        const amountNode = itemContent.getChildByName('Amount');

        if (amountNode) {
            const label = amountNode.getComponent(Label);
            if (label) {
                const amount = task.rewards.length > 0 ? task.rewards[0].amount : 0;
                label.string = String(amount);
            }
        }

        if (objNode) {
            const sprite = objNode.getComponent(Sprite);
            if (sprite) {
                void this.setGiftIcon(sprite, task.icon);
            }
        }
    }

    /**
     * 设置礼包图标
     */
    private async setGiftIcon(sprite: Sprite, iconPath: string): Promise<void> {
        if (!iconPath) return;

        const spriteFrame = await this.loadIconSpriteFrame(iconPath);
        if (sprite && sprite.node && sprite.node.isValid) {
            sprite.spriteFrame = spriteFrame;
        }
    }

    /**
     * 加载图标 SpriteFrame
     */
    private async loadIconSpriteFrame(iconPath: string): Promise<SpriteFrame | null> {
        const asset = await resManager().load<SpriteFrame>(`textures/${iconPath}/spriteFrame`, ResourceType.SPRITE_FRAME, 'res');
        if (asset && asset instanceof SpriteFrame) {
            return asset;
        }
        return null;
    }

    /**
     * 设置按钮文案
     */
    private updateButtonLabel(buttonNode: Node | null, text: string) {
        if (!buttonNode) return;
        const labelNode = buttonNode.getChildByName('Label');
        if (!labelNode) return;
        const label = labelNode.getComponent(Label);
        if (label) label.string = text;
    }

    /**
     * 礼包点击处理（领取）
     */
    private async onGiftButtonClick(taskId: number) {
        if (this.isAnimating) return;
        if (!this.taskManager.isClaimable(taskId)) return;

        this.isAnimating = true;
        try {
            this.playSound(taskId, this.claimSound);

            const success = this.taskManager.claimTaskReward(taskId);
            if (!success) return;

            const task = this.taskManager.getTask(taskId);
            if (task) {
                this.giveRewards(task);
            }

            this.updateAllTaskUI();
        } catch (error) {
            if (EDM.isDev()) console.error('领取奖励失败:', error);
        } finally {
            this.isAnimating = false;
        }
    }

    /**
     * 发放奖励
     */
    private giveRewards(task: SignInTask): void {
        const reason = `sign_in_day_${task.id}`;
        task.rewards.forEach(reward => {
            if (reward.type === CurrencyType.HeroFragment && reward.heroId != null) {
                CDM.rewardHeroFragment(reward.heroId, reward.amount, reason);
            } else {
                CDM.addCurrency(reward.type, reward.amount, reason);
            }
        });
        gameBus.emit(SIGNAL_TYPES.REWARD_RECEIVED, {
            items: task.rewards.map(reward => ({
                type: reward.type,
                amount: reward.amount,
                heroId: reward.heroId
            })),
            reason,
            source: 'sign_in'
        });
    }

    /**
     * 播放领取音效
     */
    private playSound(taskId: number, clip: AudioClip | null) {
        if (!clip) return;
        const taskNode = this.taskNodes.get(taskId) as Node;
        const audioSource = taskNode ? (taskNode.getComponent(AudioSource) as AudioSource) : null;
        if (audioSource) audioSource.playOneShot(clip as AudioClip);
    }

    /**
     * 销毁时清理定时器
     */
    onDestroy() {
        this.unschedule(this.checkReset);
    }
}
