import { _decorator, Node, Sprite, Color, Label, Button, tween, v3, UIOpacity, director, AudioSource, AudioClip, Graphics, UITransform, SpriteFrame, Vec3 } from 'cc';
import { DailyTaskManager } from './DailyTaskManager';
import { DailyTask } from './types';
import { UIBase } from 'db://assets/utils/ui/UIBase';
import { CurrencyType, CDM } from 'db://assets/utils/common/CurrencyManager';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { AdManager } from 'db://assets/utils/common/AdManager';
import { resManager, ResourceType } from 'db://assets/utils/data/config/manager/ResourceManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import { JAM } from 'db://assets/utils/common/JuicyAnimationManager';
const { ccclass, property } = _decorator;

@ccclass('DailyTaskController')
export class DailyTaskController extends UIBase {
    @property(Node)
    contentNode: Node;

    @property(Node)
    scrollContentNode: Node;

    @property(Node)
    titleNode: Node;

    @property(AudioClip)
    claimSound: AudioClip; // 领取音效
    @property(AudioClip)
    unlockSound: AudioClip; // 解锁音效

    private taskManager: DailyTaskManager;
    private taskNodes: Map<number, Node> = new Map();
    private arrowNodes: Map<number, Node> = new Map();
    private shakeBasePositions: Map<Node, Vec3> = new Map();
    private isAnimating = false;
    private resetButton: Node | null = null;

    onLoad() {
        void this.initialize();
    }

    /**
     * 初始化
     */
    private async initialize(): Promise<void> {
        if (EDM.isDev()) console.log('DailyTaskController: 开始初始化');

        this.taskManager = DailyTaskManager.instance;

        await this.taskManager.ensureReady();

        if (!this.taskManager) {
            if (EDM.isDev()) console.error('DailyTaskManager 初始化失败');
            return;
        }

        if (EDM.isDev()) console.log('DailyTaskManager 初始化成功');

        this.initTaskNodes();
        this.updateAllTaskUI();

        // 开发模式下添加重置按钮
        this.addResetButtonIfDev();

        // 定时检查是否需要重置（每分钟检查一次）
        this.schedule(this.checkReset, 60);
    }

    private addResetButtonIfDev() {
        if (EDM?.isDev?.()) {
            if (EDM.isDev()) console.log('开发模式：添加重置按钮');
            this.createResetButton();
        }
    }

    private createResetButton() {
        this.resetButton = new Node('ResetButton');
        const transform = this.resetButton.addComponent(UITransform);
        transform.width = 120;
        transform.height = 40;
        this.resetButton.setPosition(200, 150);

        const bgNode = new Node('Bg');
        const graphics = bgNode.addComponent(Graphics);
        graphics.fillColor = new Color(255, 100, 100, 255);
        graphics.rect(-60, -20, 120, 40);
        graphics.fill();
        this.resetButton.addChild(bgNode);

        const labelNode = new Node('Label');
        const label = labelNode.addComponent(Label);
        label.string = '重置任务';
        label.fontSize = 16;
        label.color = Color.WHITE;
        labelNode.setPosition(0, 0);
        this.resetButton.addChild(labelNode);

        this.resetButton.addComponent(Button);
        this.resetButton.on('click', () => {
            this.resetDailyTasks();
        });

        this.node.addChild(this.resetButton);
    }

    private resetDailyTasks() {
        if (EDM.isDev()) console.log('重置日常任务');
        this.taskManager.resetForDebug();
        this.updateAllTaskUI();
        if (EDM.isDev()) console.log('日常任务已重置，请重新领取任务');
        this.showResetToast();
    }

    private showResetToast() {
        const toastNode = new Node('ResetToast');
        const transform = toastNode.addComponent(UITransform);
        transform.width = 200;
        transform.height = 50;

        const bgNode = new Node('Bg');
        const graphics = bgNode.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, 200);
        graphics.rect(-100, -25, 200, 50);
        graphics.fill();
        toastNode.addChild(bgNode);

        const labelNode = new Node('Label');
        const label = labelNode.addComponent(Label);
        label.string = '日常任务已重置';
        label.fontSize = 18;
        label.color = Color.WHITE;
        labelNode.setPosition(0, 0);
        toastNode.addChild(labelNode);

        this.node.addChild(toastNode);

        setTimeout(() => {
            if (toastNode?.isValid) {
                toastNode.destroy();
            }
        }, 2000);
    }

    /**
     * 检查并重置
     */
    private checkReset() {
        try {
            if (this.taskManager?.checkAndResetIfNeeded()) {
                if (EDM.isDev()) console.log('日常任务已重置');
                this.updateAllTaskUI();
            } else {
                if (EDM.isDev()) console.warn('taskManager 未正确初始化');
            }
        } catch (error) {
            if (EDM.isDev()) console.error('检查重置失败:', error);
        }
    }

    /**
     * 更新所有任务UI
     */
    private updateAllTaskUI() {
        if (!this.taskManager) {
            if (EDM.isDev()) console.warn('taskManager 未初始化，无法更新UI');
            return;
        }

        try {
            const allTasks = this.taskManager.getAllTasks();
            allTasks.forEach(task => {
                this.updateTaskUI(task.id);
            });
        } catch (error) {
            if (EDM.isDev()) console.error('更新任务UI失败:', error);
        }
    }

    /**
     * 显示UI时刷新
     */
    public async show(data?: any): Promise<void> {
        if (EDM.isDev()) console.log('DailyTaskController: 显示面板');

        // 调用父类的show方法
        await super.show(data);

        // 确保taskManager已初始化
        if (!this.taskManager) {
            this.taskManager = DailyTaskManager.instance;
        }

        await this.taskManager.ensureReady();

        // 检查重置
        this.checkReset();

        // 更新UI
        this.updateAllTaskUI();
    }

    /**
     * 初始化任务节点
     */
    private initTaskNodes() {
        this.taskNodes.clear();
        this.arrowNodes.clear();

        const root = this.scrollContentNode || this.node;
        const tasks = this.taskManager.getAllTasks();
        tasks.forEach(task => {
            const giftName = `DailyGift-${String(task.id).padStart(3, '0')}`;
            const giftNode = this.findNodeByName(root, giftName);
            if (giftNode) {
                this.taskNodes.set(task.id, giftNode);
                this.setupTaskNode(giftNode, task.id);
            } else {
                if (EDM.isDev()) console.warn(`未找到任务节点: ${giftName}`);
            }

            const arrowName = `arrow-${String(task.id).padStart(2, '0')}`;
            const arrowNode = this.findNodeByName(root, arrowName);
            if (arrowNode) {
                this.arrowNodes.set(task.id, arrowNode);
            }
        });
    }

    private findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findNodeByName(child, name);
            if (found) return found;
        }
        return null;
    }

    /**
     * 设置任务节点
     */
    private setupTaskNode(taskNode: Node, taskId: number) {
        taskNode.on(Button.EventType.CLICK, () => {
            this.onGiftButtonClick(taskId);
        }, this);

    }

    /**
     * 更新指定任务UI
     */
    private updateTaskUI(taskId: number) {
        const taskNode = this.taskNodes.get(taskId);
        const task = this.taskManager.getTask(taskId);

        if (!taskNode || !task) {
            if (EDM.isDev()) console.warn(`任务${taskId}的节点或数据不存在`);
            return;
        }

        const itemContent = taskNode.getChildByName('Item-Content');
        const lockedNode = taskNode.getChildByName('Locked');
        const noticeNode = taskNode.getChildByName('Notice');
        const purchaseNode = itemContent ? itemContent.getChildByName('Purchase') : taskNode.getChildByName('Purchase');
        const adPurchaseNode = itemContent ? itemContent.getChildByName('Ad-Purchase') : taskNode.getChildByName('Ad-Purchase');
        const soldoutNode = itemContent ? itemContent.getChildByName('Soldout') : taskNode.getChildByName('Soldout');

        this.updateGiftPreview(taskNode, task);

        const nextIndex = this.getNextClaimIndex(task);
        const remaining = this.getRemainingClaims(task);
        const hasRemaining = nextIndex !== -1;
        const nextClaimType = hasRemaining ? task.claims[nextIndex] : null;

        // 处理锁定与售罄状态
        if (itemContent) {
            const opacity = itemContent.getComponent(UIOpacity) || itemContent.addComponent(UIOpacity);
            opacity.opacity = (task.locked || !hasRemaining) ? 150 : 255;
        }
        if (lockedNode) lockedNode.active = task.locked;
        if (soldoutNode) soldoutNode.active = !hasRemaining;

        if (purchaseNode) purchaseNode.active = !task.locked && hasRemaining && nextClaimType === 0;
        if (adPurchaseNode) adPurchaseNode.active = !task.locked && hasRemaining && nextClaimType === 1;
        if (noticeNode) {
            noticeNode.active = !task.locked && hasRemaining && nextClaimType === 0;
            const objNode = itemContent ? itemContent.getChildByName('Obj') : null;
            if (noticeNode.active) {
                if (objNode) {
                    // 记录节点 shake 前初始位置以便动画停止后复原
                    const basePos = this.shakeBasePositions.get(objNode) ?? objNode.getPosition().clone();
                    this.shakeBasePositions.set(objNode, basePos);
                    objNode.setPosition(basePos);
                    JAM.stopAllAnimations(objNode);
                    JAM.playShakeAnimation(objNode, { duration: 0.6, delay: 2, repeatForever: true, delayFirstTime: false });
                }
            } else if (objNode) {
                JAM.stopAllAnimations(objNode);
                const basePos = this.shakeBasePositions.get(objNode);
                if (basePos) objNode.setPosition(basePos);
            }
        }

        this.updateButtonLabel(purchaseNode, `免费(${remaining})`);
        this.updateButtonLabel(adPurchaseNode, `免费(${remaining})`);

        const buttonComp = taskNode.getComponent(Button);
        if (buttonComp) {
            buttonComp.interactable = !task.locked && hasRemaining;
        }

        const arrowNode = this.arrowNodes.get(taskId);
        if (arrowNode) {
            this.setGrayscale(arrowNode, task.locked);
        }
    }

    private updateGiftPreview(taskNode: Node, task: DailyTask) {
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
    private async setGiftIcon(sprite: Sprite, iconPath: string): Promise<void> {
        if (!iconPath) return;

        const spriteFrame = await this.loadIconSpriteFrame(iconPath);
        if (sprite && sprite.node && sprite.node.isValid) {
            sprite.spriteFrame = spriteFrame;
        }
    }

    private async loadIconSpriteFrame(iconPath: string): Promise<SpriteFrame | null> {
        const asset = await resManager().load<SpriteFrame>(`textures/${iconPath}/spriteFrame`, ResourceType.SPRITE_FRAME, 'res');
        if (asset && asset instanceof SpriteFrame) {
            return asset;
        }
        return null;
    }

    private updateButtonLabel(buttonNode: Node | null, text: string) {
        if (!buttonNode) return;
        const labelNode = buttonNode.getChildByName('Label');
        if (!labelNode) return;
        const label = labelNode.getComponent(Label);
        if (label) label.string = text;
    }

    private getNextClaimIndex(task: DailyTask): number {
        return task.claimed.findIndex(claimed => !claimed);
    }

    private getRemainingClaims(task: DailyTask): number {
        return task.claimed.reduce((count, claimed) => count + (claimed ? 0 : 1), 0);
    }

    /**
     * 礼物按钮点击事件
     */
    private async onGiftButtonClick(taskId: number) {
        if (this.isAnimating) return;

        const task = this.taskManager.getTask(taskId);
        if (!task || task.locked) return;

        const nextIndex = this.getNextClaimIndex(task);
        if (nextIndex === -1) return;

        this.isAnimating = true;

        if (task.claims[nextIndex] === 0) {
            await this.handleClaim(taskId);
        } else {
            this.handleAdClaim(taskId, nextIndex);
        }
    }

    private handleAdClaim(taskId: number, nextIndex: number) {
        AdManager.showAd(
            `daily_gift_${taskId}_${nextIndex}`,
            () => {
                void this.handleClaim(taskId);
            },
            (reason) => {
                this.isAnimating = false;
                console.warn('广告失败:', reason);
            },
            'daily_gift_claim'
        );
    }

    private async handleClaim(taskId: number): Promise<void> {
        const nextTaskId = this.getNextTaskId(taskId);
        const nextWasLocked = nextTaskId ? !!(this.taskManager.getTask(nextTaskId)?.locked) : false;

        try {
            this.playSound(taskId, this.claimSound);
            const claimedIndex = this.taskManager.claimTaskReward(taskId);
            if (claimedIndex === null) return;

            await this.playClaimAnimation(taskId);

            const task = this.taskManager.getTask(taskId);
            if (task) {
                this.giveRewards(task, claimedIndex);
            }

            this.updateAllTaskUI();

            if (nextTaskId) {
                const nextTask = this.taskManager.getTask(nextTaskId);
                if (nextTask && nextWasLocked && !nextTask.locked) {
                    this.playSound(nextTaskId, this.unlockSound);
                    await this.playUnlockAnimation(nextTaskId);
                }
            }
        } catch (error) {
            if (EDM.isDev()) console.error('领取奖励失败:', error);
        } finally {
            this.isAnimating = false;
        }
    }

    private giveRewards(task: DailyTask, claimIndex: number): void {
        const reason = `daily_gift_${task.id}_${claimIndex + 1}`;
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
            source: 'daily_task'
        });
    }

    private getNextTaskId(taskId: number): number | null {
        const tasks = this.taskManager.getAllTasks();
        const index = tasks.findIndex(task => task.id === taskId);
        if (index === -1) return null;
        const nextTask = tasks[index + 1];
        return nextTask ? nextTask.id : null;
    }

    /**
     * 设置节点灰度
     */
    private setGrayscale(node: Node, grayscale: boolean) {
        const sprite = node.getComponent(Sprite);
        if (sprite) {
            sprite.grayscale = grayscale;
        }
    }

    /**
     * 播放领取动画
     */
    private async playClaimAnimation(taskId: number): Promise<void> {
        const taskNode = this.taskNodes.get(taskId);
        if (!taskNode) return;

        const target = taskNode.getChildByName('Item-Content') || taskNode;
        return new Promise(resolve => {
            tween(target)
                .to(0.2, { scale: v3(0.9, 0.9, 1) })
                .to(0.2, { scale: v3(1.1, 1.1, 1) })
                .to(0.1, { scale: v3(1, 1, 1) })
                .call(() => resolve())
                .start();
        });
    }

    /**
     * 播放解锁动画
     */
    private async playUnlockAnimation(taskId: number): Promise<void> {
        const taskNode = this.taskNodes.get(taskId);
        if (!taskNode) return;

        return new Promise(resolve => {
            tween(taskNode)
                .to(0.3, { scale: v3(1.1, 1.1, 1) })
                .to(0.3, { scale: v3(1, 1, 1) })
                .call(() => resolve())
                .start();
        });
    }

    /**
     * 播放音效
     */
    private playSound(taskId: number, clip: AudioClip | null) {
        const taskNode = this.taskNodes.get(taskId) as Node;
        const audioSource = taskNode.getComponent(AudioSource) as AudioSource;
        audioSource.playOneShot(clip as AudioClip);
    }

    onDestroy() {
        this.unschedule(this.checkReset);
    }
}
