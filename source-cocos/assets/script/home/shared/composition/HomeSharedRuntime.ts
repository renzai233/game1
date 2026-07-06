import { _decorator, Component, Node } from 'cc';
import {
    CocosRuntimeBridge,
    GameBusEventChannelAdapter,
    UIEventBusChannelAdapter
} from 'db://assets/shared/ui-runtime';
import type { RuntimeLogger } from 'db://assets/shared/ui-runtime';
import { HomeBusEventMap, HomeUIEventMap } from './eventMaps';
import { createHomeSharedRuntimeModules } from './homeSharedModules';

const { ccclass } = _decorator;
const HOME_RUNTIME_TRACE_KEY = 'home_shared_runtime_trace';

@ccclass('HomeSharedRuntime')
export class HomeSharedRuntime extends Component {
    private bridge: CocosRuntimeBridge<HomeBusEventMap, HomeUIEventMap> | null = null;

    public static ensureMounted(root: Node): HomeSharedRuntime {
        let runtime = root.getComponent(HomeSharedRuntime);
        if (!runtime) {
            runtime = root.addComponent(HomeSharedRuntime);
        }
        return runtime;
    }

    protected onLoad(): void {
        const runtimeTraceEnabled = this.isRuntimeTraceEnabled();
        const runtimeLogger: RuntimeLogger = {
            info: runtimeTraceEnabled
                ? (message: string, ...args: unknown[]) => {
                    console.info(message, ...args);
                }
                : undefined,
            warn: runtimeTraceEnabled
                ? (message: string, ...args: unknown[]) => {
                    console.warn(message, ...args);
                }
                : undefined,
            error: (message: string, ...args: unknown[]) => {
                console.error(message, ...args);
            }
        };

        this.bridge = new CocosRuntimeBridge({
            root: this.node,
            scheduler: this,
            modules: createHomeSharedRuntimeModules({
                claimStatus: {
                    logger: runtimeLogger
                },
                hud: {
                    logger: runtimeLogger
                },
                reward: {
                    logger: runtimeLogger
                }
            }),
            busChannel: new GameBusEventChannelAdapter<HomeBusEventMap>(),
            uiChannel: new UIEventBusChannelAdapter<HomeUIEventMap>(),
            logger: runtimeLogger,
            telemetry: runtimeTraceEnabled
                ? {
                    onStartCompleted: (metric) => {
                        console.info('[HomeSharedRuntime] start metric:', metric);
                    },
                    onStopCompleted: (metric) => {
                        console.info('[HomeSharedRuntime] stop metric:', metric);
                    }
                }
                : undefined,
            startupPolicy: 'best-effort'
        });

        void this.bridge.start().catch((error) => {
            console.error('[HomeSharedRuntime] bridge start failed:', error);
        });
    }

    protected onDestroy(): void {
        if (this.bridge) {
            void this.bridge.stop().catch((error) => {
                console.error('[HomeSharedRuntime] bridge stop failed:', error);
            });
        }
        this.bridge = null;
    }

    private isRuntimeTraceEnabled(): boolean {
        try {
            return localStorage.getItem(HOME_RUNTIME_TRACE_KEY) === '1';
        } catch (error) {
            console.warn('[HomeSharedRuntime] read trace flag failed:', error);
            return false;
        }
    }
}
