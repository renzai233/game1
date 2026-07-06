import { director, Label, Node } from 'cc';
import { CDM, CurrencyType } from 'db://assets/utils/common/CurrencyManager';

const HUD_NODE_BY_CURRENCY: Partial<Record<CurrencyType, string>> = {
    [CurrencyType.Gold]: 'Gold',
    [CurrencyType.Gem]: 'Gem',
    [CurrencyType.Stamina]: 'Stamina'
};

type CurrencyLabelMap = Partial<Record<CurrencyType, Label | null>>;

export class HomeHUDCurrencyPresenter {
    private readonly root: Node;
    private hudNode: Node | null = null;
    private labels: CurrencyLabelMap = {};

    constructor(root: Node) {
        this.root = root;
    }

    renderAll(): void {
        this.renderOne(CurrencyType.Gold);
        this.renderOne(CurrencyType.Gem);
        this.renderOne(CurrencyType.Stamina);
    }

    renderOne(type: CurrencyType): void {
        const label = this.getLabel(type);
        if (!label || !label.node || !label.node.isValid) {
            return;
        }

        label.string = String(CDM.getCurrency(type) || 0);
    }

    private getLabel(type: CurrencyType): Label | null {
        const cached = this.labels[type];
        if (cached && cached.node && cached.node.isValid) {
            return cached;
        }

        const hud = this.ensureHUDNode();
        if (!hud) {
            this.labels[type] = null;
            return null;
        }

        const nodeName = HUD_NODE_BY_CURRENCY[type];
        if (!nodeName) {
            this.labels[type] = null;
            return null;
        }

        const target = hud.getChildByName(nodeName);
        const label = target?.getComponent(Label) || target?.getChildByName('Label')?.getComponent(Label) || null;
        this.labels[type] = label;
        return label;
    }

    private ensureHUDNode(): Node | null {
        if (this.hudNode && this.hudNode.isValid) {
            return this.hudNode;
        }

        const fromRoot = this.findNodeByName(this.root, 'HUD');
        if (fromRoot && fromRoot.isValid) {
            this.hudNode = fromRoot;
            return this.hudNode;
        }

        const scene = director.getScene();
        const canvas = scene?.getChildByName('Canvas');
        this.hudNode = canvas?.getChildByName('HUD') || null;
        return this.hudNode;
    }

    private findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }

        for (const child of root.children) {
            const found = this.findNodeByName(child, name);
            if (found) {
                return found;
            }
        }

        return null;
    }
}
