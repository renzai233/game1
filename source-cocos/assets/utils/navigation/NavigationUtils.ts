import { Node } from 'cc';
import { NavigationManager } from './NavigationManager';
import { NavigationController } from './NavigationController';

const NAVIGATION_BAR_INDEX = 1000;

export class NavigationUtils {
    private static _navigationManager: NavigationManager = null;
    private static _navigationController: NavigationController = null;

    public static setNavigationManager(manager: NavigationManager): void {
        this._navigationManager = manager;
    }

    public static setNavigationController(controller: NavigationController): void {
        this._navigationController = controller;
    }

    public static getNavigationManager(): NavigationManager {
        return this._navigationManager;
    }

    public static getNavigationController(): NavigationController {
        return this._navigationController;
    }

    public static setPanelSiblingIndex(panelNode: Node, index: number = 50): void {
        if (panelNode && panelNode.isValid) {
            panelNode.setSiblingIndex(index);
            this.ensureNavigationBarOnTop();
        }
    }

    public static setGroupNodeSiblingIndex(groupNode: Node, index: number = 30): void {
        if (groupNode && groupNode.isValid) {
            groupNode.setSiblingIndex(index);
            this.ensureNavigationBarOnTop();
        }
    }

    private static ensureNavigationBarOnTop(): void {
        if (this._navigationManager && this._navigationManager.navigationBar) {
            this._navigationManager.navigationBar.setSiblingIndex(NAVIGATION_BAR_INDEX);
        }
    }

    public static clearAllReferences(): void {
        this._navigationManager = null;
        this._navigationController = null;
        console.log('[NavigationUtils] 所有静态引用已清理');
    }
}
