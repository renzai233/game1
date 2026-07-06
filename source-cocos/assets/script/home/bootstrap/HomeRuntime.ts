import { _decorator, Component, Node } from 'cc';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { UIManager } from 'db://assets/utils/ui/UIManager';
import { HOME_RUNTIME_MODULES } from '../modules';
import { HomeRuntimeContext, IHomeRuntimeModule } from '../runtime/contracts';

const { ccclass } = _decorator;

@ccclass('HomeRuntime')
export class HomeRuntime extends Component {
    private readonly modules: IHomeRuntimeModule[] = HOME_RUNTIME_MODULES;

    public static ensureMounted(root: Node): HomeRuntime {
        let runtime = root.getComponent(HomeRuntime);
        if (!runtime) {
            runtime = root.addComponent(HomeRuntime);
        }
        return runtime;
    }

    protected onLoad(): void {
        void this.setupModules();
    }

    protected onDestroy(): void {
        this.teardownModules();
    }

    private async setupModules(): Promise<void> {
        const ctx = this.createContext();
        for (const module of this.modules) {
            try {
                await module.setup(ctx);
            } catch (error) {
                console.error(`[HomeRuntime] module setup failed: ${module.id}`, error);
            }
        }
    }

    private teardownModules(): void {
        for (const module of this.modules) {
            try {
                module.teardown?.();
            } catch (error) {
                console.error(`[HomeRuntime] module teardown failed: ${module.id}`, error);
            }
        }
    }

    private createContext(): HomeRuntimeContext {
        return {
            root: this.node,
            onBus: (event, handler) => {
                gameBus.on(event, handler);
                return () => gameBus.off(event, handler);
            },
            onUI: (event, handler) => {
                UIManager.instance.eventBus.on(event, handler);
                return () => UIManager.instance.eventBus.off(event, handler);
            },
            every: (seconds, fn) => {
                this.schedule(fn, seconds);
                return () => this.unschedule(fn);
            }
        };
    }
}
