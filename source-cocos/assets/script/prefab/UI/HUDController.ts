import { _decorator, Component, Label, Node } from 'cc';
import { saveData } from '../../../utils/data/config/manager/DataManager';
import { EDM } from '../../../utils/data/env/ConfigManager';
import { CDM, CurrencyType } from '../../../utils/common/CurrencyManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import { PDM } from '../../../utils/data/config/player/PlayerDataManager';
const { ccclass, property } = _decorator;

@ccclass('HUDController')
export class HUDController extends Component {
    @property(Node)
    goldNode: Node; // 金币节点
    @property(Node)
    gemNode: Node; // 钻石节点
    @property(Node)
    staminaNode: Node; // 体力节点

    // 本地化标签
    @property(Label)
    goldLabel: Label | null = null; // 金币标签
    @property(Label)
    gemLabel: Label | null = null; // 钻石标签

    // 添加定时器和状态管理
    private countdownTimer: number | null = null;
    private isDestroyed: boolean = false;
    private updateDisplayCallback: () => void;
    private eventCallbacks: { [key: string]: Function } = {};

    start() {
        this.init();
    }

    init() {
        this.isDestroyed = false;

        // 绑定回调函数以便后续移除
        this.updateDisplayCallback = this.updateDisplay.bind(this);
        // 更新本地化文本
        this.updateLocalizedTexts();
        this.updateDisplay();

        // 安全更新体力显示
        this.safeUpdateStaminaUI();

        // 体力恢复逻辑
        this.startStaminaRecovery();

        // 事件监听
        this.setupEventListeners();
    }


    /**
     * 安全更新体力显示 - 添加节点有效性检查
     */
    private safeUpdateStaminaUI(): void {
        try {
            // 检查节点是否存在且有效
            if (!this.staminaNode || !this.staminaNode.isValid) {
                console.warn('[HUDController] staminaNode 无效或不存在');
                return;
            }

            const currentStamina = CDM.getCurrency(CurrencyType.Stamina) || 0;
            const maxStamina = CDM.getCurrency(CurrencyType.MaxStamina) || 30;

            this.updateStaminaNumberLabels(currentStamina, maxStamina);

            // 更新倒计时显示状态
            this.updateCountdownDisplay(currentStamina >= maxStamina);
        } catch (error) {
            console.error('[HUDController] 更新体力显示失败:', error);
        }
    }

    private getStaminaChildNode(path: string[]): Node | null {
        let currentNode: Node | null = this.staminaNode;
        for (const nodeName of path) {
            if (!currentNode || !currentNode.isValid) {
                return null;
            }
            currentNode = currentNode.getChildByName(nodeName);
        }

        return currentNode && currentNode.isValid ? currentNode : null;
    }

    private getStaminaChildLabel(path: string[]): Label | null {
        const labelNode = this.getStaminaChildNode(path);
        return labelNode ? labelNode.getComponent(Label) : null;
    }

    private setLabelString(label: Label | null, value: string): void {
        if (label && label.node && label.node.isValid) {
            label.string = value;
        }
    }

    private updateStaminaNumberLabels(currentStamina: number, maxStamina: number): void {
        const currentLabel = this.getStaminaChildLabel(['Num', 'Current']);
        const maxLabel = this.getStaminaChildLabel(['Num', 'Max']);

        this.setLabelString(currentLabel, String(currentStamina));
        this.setLabelString(maxLabel, String(maxStamina));
    }

    private updateStaminaTimerLabel(totalSeconds: number): void {
        const timerLabel = this.getStaminaChildLabel(['Timer']);
        const safeTotalSeconds = Math.max(0, Math.floor(totalSeconds));
        const minutes = Math.floor(safeTotalSeconds / 60);
        const seconds = safeTotalSeconds % 60;

        this.setLabelString(timerLabel, `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
    }

    /**
     * 更新倒计时显示状态
     */
    private updateCountdownDisplay(isStaminaFull: boolean): void {
        try {
            // 新 HUD 使用 Stamina.Timer 显示倒计时。
            const timerNode = this.getStaminaChildNode(['Timer']);
            if (timerNode) {
                timerNode.active = !isStaminaFull;
            }
        } catch (error) {
            console.warn('[HUDController] 更新倒计时显示状态失败:', error);
        }
    }

    /**
     * 启动体力恢复逻辑
     */
    private startStaminaRecovery(): void {
        const currentStamina = CDM.getCurrency(CurrencyType.Stamina) || 0;
        const maxStamina = CDM.getCurrency(CurrencyType.MaxStamina) || 30;

        // 如果体力不满
        if (currentStamina < maxStamina) {
            let lastLoginTime = new Date(PDM.getLastLoginTime() || new Date());
            let currentDate = new Date();

            let diffInMs = Math.abs(Number(currentDate) - Number(lastLoginTime));
            // 计算5分钟的倍数
            const recoveryInterval = 5 * 60 * 1000; // 5分钟恢复1体力
            let multiple = diffInMs / recoveryInterval;
            let integerPart = Math.floor(multiple); // 大于0的部分，直接更新体力
            let decimalPart = multiple - integerPart; // 小于0的部分，根据剩余时间，计算倒计时

            // 如果有整数部分，恢复体力
            if (integerPart > 0) {
                // 计算实际可恢复的体力，不超过最大值
                const recoverableStamina = Math.min(integerPart, maxStamina - currentStamina);
                if (recoverableStamina > 0) {
                    CDM.addCurrency(CurrencyType.Stamina, recoverableStamina, 'time_recovery');
                    // 更新最后登录时间
                    const newLastLoginTime = new Date().toISOString();
                    PDM.setLastLoginTime(newLastLoginTime);
                    saveData('lastLoginTime', newLastLoginTime);
                    // 更新UI显示体力值
                    this.safeUpdateStaminaUI();
                }
            }

            // 检查更新后的体力
            const updatedStamina = CDM.getCurrency(CurrencyType.Stamina) || 0;
            if (updatedStamina < maxStamina) {
                // 根据剩余时间，计算倒计时
                if (decimalPart > 0) {
                    const remainingTimeInMinutes = (1 - decimalPart) * 5;
                    this.startCountdown(remainingTimeInMinutes);
                } else {
                    // 开始新的5分钟倒计时
                    this.startCountdown(5);
                }
            }
        } else {
            // 更新最后登录时间
            const newLastLoginTime = new Date().toISOString();
            PDM.setLastLoginTime(newLastLoginTime);
            saveData('lastLoginTime', newLastLoginTime);
        }
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        if (!gameBus) return;

        // 保存回调引用以便后续移除
        this.eventCallbacks.currencyChanged = this.updateDisplayCallback;
        this.eventCallbacks.cleanupHUD = this.cleanup.bind(this);

        gameBus.on(SIGNAL_TYPES.CURRENCY_CHANGED, this.eventCallbacks.currencyChanged);
        gameBus.on(SIGNAL_TYPES.CLEANUP_HUD, this.eventCallbacks.cleanupHUD);
    }

    /**
     * 更新HUD中的货币显示
     */
    private updateDisplay(): void {
        try {
            // 检查组件和节点是否有效
            if (!this.node || !this.node.isValid || this.isDestroyed) {
                return;
            }

            // 更新金币
            const coin = CDM.getCurrency(CurrencyType.Gold) || 0;
            if (this.goldLabel && this.goldLabel.node && this.goldLabel.node.isValid) {
                this.goldLabel.string = String(coin);
            }

            // 更新宝石
            const gem = CDM.getCurrency(CurrencyType.Gem) || 0;
            if (this.gemLabel && this.gemLabel.node && this.gemLabel.node.isValid) {
                this.gemLabel.string = String(gem);
            }

            // 更新体力
            this.safeUpdateStaminaUI();
        } catch (error) {
            console.error('[HUDController] 更新HUD货币时出错:', error);
        }
    }

    // 倒计时
    onCountdown(minutes: number): void {
        this.startCountdown(minutes);
    }

    /**
     * 开始倒计时 - 重构版本，支持清理
     */
    private startCountdown(minutes: number): void {
        // 清理之前的定时器
        this.clearCountdownTimer();

        let totalSeconds = Math.round(minutes * 60);

        // 确保倒计时节点和标签是可见的
        this.updateCountdownDisplay(false);
        this.updateStaminaTimerLabel(totalSeconds);

        // 更新倒计时的函数
        const updateCountdown = () => {
            // 检查组件是否已销毁
            if (!this.node || !this.node.isValid || this.isDestroyed) {
                this.clearCountdownTimer();
                return;
            }

            // 检查体力是否已满
            const currentStamina = CDM.getCurrency(CurrencyType.Stamina) || 0;
            const maxStamina = CDM.getCurrency(CurrencyType.MaxStamina) || 30;

            if (currentStamina >= maxStamina) {
                this.safeUpdateStaminaUI();
                this.clearCountdownTimer();
                return;
            }

            totalSeconds--;

            try {
                this.updateStaminaTimerLabel(totalSeconds);
            } catch (error) {
                console.warn('[HUDController] 更新倒计时显示失败:', error);
            }

            // 如果倒计时结束
            if (totalSeconds < 0) {
                this.clearCountdownTimer();
                
                // 检查体力是否已满
                const currentStamina = CDM.getCurrency(CurrencyType.Stamina) || 0;
                const maxStamina = CDM.getCurrency(CurrencyType.MaxStamina) || 30;
                
                if (currentStamina < maxStamina) {
                    CDM.addCurrency(CurrencyType.Stamina, 1, 'countdown_recovery');
                    
                    // 更新UI显示体力值
                    this.safeUpdateStaminaUI();
                    
                    // 更新最后登录时间
                    const newLastLoginTime = new Date().toISOString();
                    PDM.setLastLoginTime(newLastLoginTime);
                    saveData('lastLoginTime', newLastLoginTime);
                    
                    // 通知全局相关内容实时刷新
                    if (gameBus) {
                        gameBus.emit(SIGNAL_TYPES.CURRENCY_CHANGED, {
                            type: CurrencyType.Stamina,
                            oldAmount: currentStamina,
                            newAmount: currentStamina + 1,
                            changeAmount: 1,
                            reason: 'countdown_recovery'
                        });
                    }
                    
                    // 检查更新后的体力
                    const newStamina = CDM.getCurrency(CurrencyType.Stamina) || 0;
                    if (newStamina < maxStamina) {
                        // 开始新的5分钟倒计时
                        this.scheduleOnce(() => {
                            if (this.node && this.node.isValid && !this.isDestroyed) {
                                this.startCountdown(5);
                            }
                        }, 0);
                    }
                }
            }
        };

        // 每秒调用一次updateCountdown函数
        this.countdownTimer = setInterval(updateCountdown, 1000) as unknown as number;
    }

    /**
     * 清理倒计时定时器
     */
    private clearCountdownTimer(): void {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
    }

    // 更新体力值UI
    updateStaminaUI(): void {
        this.safeUpdateStaminaUI();
    }

    /**
     * 更新本地化文本
     */
    private updateLocalizedTexts(): void {
        // 更新金币标签
        if (this.goldLabel) {
            this.goldLabel.string = EDM.getText('hud.coin');
        }

        // 更新钻石标签
        if (this.gemLabel) {
            this.gemLabel.string = EDM.getText('hud.gem');
        }
    }
    
    /**
     * 公共清理方法
     */
    public cleanup(): void {
        console.log('[HUDController] 执行清理');

        this.isDestroyed = true;

        // 清理定时器
        this.clearCountdownTimer();

        // 移除事件监听
        if (gameBus) {
            if (this.eventCallbacks.currencyChanged) {
                gameBus.off(SIGNAL_TYPES.CURRENCY_CHANGED, this.eventCallbacks.currencyChanged);
            }
            if (this.eventCallbacks.cleanupHUD) {
                gameBus.off(SIGNAL_TYPES.CLEANUP_HUD, this.eventCallbacks.cleanupHUD);
            }
            this.eventCallbacks = {};
        }
    }

    protected onDestroy(): void {
        console.log('[HUDController] 销毁生命周期');
        this.cleanup();
    }
}
