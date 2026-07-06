import { _decorator, Component, Node, UITransform } from 'cc';

const { ccclass } = _decorator;

@ccclass('EngineErrorFix')
export class EngineErrorFix extends Component {
    
    public static fixNodeUITransform(node: Node): void {
        if (!node?.isValid) return;

        try {
            let uiTransform = node.getComponent(UITransform);
            if (!uiTransform) {
                uiTransform = node.addComponent(UITransform);
            }

            const size = uiTransform.contentSize;
            if (size.width === 0 || size.height === 0) {
                uiTransform.setContentSize(100, 100);
            }
        } catch (error) {
            console.error(`[EngineErrorFix] 修复节点UITransform失败: ${node.name}`, error);
        }
    }

    public static fixAllChildrenUITransform(node: Node): void {
        if (!node?.isValid) return;

        this.fixNodeUITransform(node);
        node.children.forEach(child => this.fixAllChildrenUITransform(child));
    }

    public static safeAddEventListener(
        target: Node, 
        eventType: string, 
        callback: Function, 
        targetObj?: any
    ): void {
        if (!target?.isValid) return;

        try {
            this.fixNodeUITransform(target);
            target.on(eventType, callback, targetObj);
        } catch (error) {
            console.error(`[EngineErrorFix] 添加事件监听器失败: ${target.name}`, error);
        }
    }

    public static safeRemoveEventListener(
        target: Node, 
        eventType: string, 
        callback: Function, 
        targetObj?: any
    ): void {
        if (!target?.isValid) return;

        try {
            target.off(eventType, callback, targetObj);
        } catch (error) {
            console.error(`[EngineErrorFix] 移除事件监听器失败: ${target.name}`, error);
        }
    }

    public static isNodeReadyForEvents(node: Node): boolean {
        if (!node?.isValid || !node.active) return false;

        const uiTransform = node.getComponent(UITransform);
        if (!uiTransform) return false;

        const size = uiTransform.contentSize;
        return size.width > 0 && size.height > 0;
    }

    public static setupGlobalErrorHandler(): void {
        window.addEventListener('error', (event) => {
            if (event.message?.includes('cameraPriority')) {
                console.warn('[EngineErrorFix] 检测到cameraPriority错误');
            }
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.warn('[EngineErrorFix] 未处理的Promise拒绝:', event.reason);
        });
    }

    onLoad() {
        EngineErrorFix.setupGlobalErrorHandler();
    }
} 