import { director, Node, Label } from 'cc';
import { CDM, CurrencyType } from 'db://assets/utils/common/CurrencyManager';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import { Dispose, HomeRuntimeContext, IHomeRuntimeModule } from '../runtime/contracts';

/**
 * 主页HUD货币模块
 * 监听资源变化事件，自动更新所有HUD显示
 */
export class HomeHUDCurrencyModule implements IHomeRuntimeModule {
    private static _instance: HomeHUDCurrencyModule;
    public readonly id = 'home-hud-currency-module';
    private _isInitialized: boolean = false;
    private _disposeCurrencyChanged: Dispose | null = null;

    private constructor() { }

    public static getInstance(): HomeHUDCurrencyModule {
        if (!this._instance) {
            this._instance = new HomeHUDCurrencyModule();
        }
        return this._instance;
    }

    public setup(ctx: HomeRuntimeContext): void {
        if (this._isInitialized) {
            return;
        }

        this._disposeCurrencyChanged = ctx.onBus(SIGNAL_TYPES.CURRENCY_CHANGED, this.onCurrencyChanged);
        this.updateAllHUDs();

        this._isInitialized = true;
    }

    /**
     * 货币变化事件处理
     */
    private onCurrencyChanged = (_event: any): void => {
        this.updateAllHUDs();
    };

    /**
     * 更新所有HUD显示
     */
    private updateAllHUDs(): void {
        try {
            // 查找场景中的所有HUD节点
            const scene = director.getScene();
            if (!scene) { return; }

            // 检查当前场景名称，只在Home场景更新HUD
            const sceneName = scene.name;
            if (sceneName !== 'Home') { return; }

            const canvas = scene.getChildByName('Canvas');
            if (!canvas) { return; }

            const hud = canvas.getChildByName('HUD');
            if (!hud) { return; }

            // 更新HUD中的资源显示
            this.updateHUDResource(hud, 'Gold', CurrencyType.Gold);
            this.updateHUDResource(hud, 'Gem', CurrencyType.Gem);
            this.updateHUDResource(hud, 'Stamina', CurrencyType.Stamina);
        } catch (error) {
            console.error('[HomeHUDCurrencyModule] 更新HUD时出错:', error);
        }
    }

    /**
     * 更新HUD中的特定资源显示
     */
    private updateHUDResource(hud: Node, nodeName: string, resourceType: CurrencyType): void {
        const resourceNode = hud.getChildByName(nodeName);
        if (!resourceNode) {
            return;
        }

        const label = resourceNode.getComponent(Label) || resourceNode.getChildByName('Label')?.getComponent(Label);
        if (label) {
            const value = CDM.getCurrency(resourceType) || 0;
            label.string = value.toString();
        }
    }

    public teardown(): void {
        if (!this._isInitialized) return;

        this._disposeCurrencyChanged?.();
        this._disposeCurrencyChanged = null;
        this._isInitialized = false;
    }
}

export const homeHUDCurrencyModule = HomeHUDCurrencyModule.getInstance();
