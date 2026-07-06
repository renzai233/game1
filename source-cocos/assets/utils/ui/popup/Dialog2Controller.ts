import { _decorator, Component, Label, Node, RichText, UITransform } from 'cc';
import { Skin1UIPolish } from '../skin1/Skin1UIPolish';
const { ccclass, property } = _decorator;

@ccclass('Dialog2Controller')
export class Dialog2Controller extends Component {
    @property(Node)
    titleNode: Node; // 标题节点
    @property(Node)
    contentNode: Node; // 内容节点

    start() {
        Skin1UIPolish.applyPanel(this.node);
    }

    // 初始化
    init(data: Record<string, any>) {
        Skin1UIPolish.applyPanel(this.node);

        const title = data['title'] || '';
        this.updatePolishTitle(title);

        const titleNode = this.resolveTitleNode();
        if (titleNode) {
            const titleLabel = titleNode.getComponent(Label);
            if (titleLabel) titleLabel.string = title;
        }

        const contentNode = this.resolveContentNode();
        if (!contentNode) return;

        const labelItem = contentNode.getChildByName('LabelItem');
        const richTextItem = contentNode.getChildByName('RichTextItem');

        if (labelItem || richTextItem) {
            this.updateStructuredContent(contentNode, labelItem, richTextItem, data);
            return;
        }

        const label = contentNode.getComponent(Label) || contentNode.getComponentInChildren(Label);
        const richText = contentNode.getComponent(RichText) || contentNode.getComponentInChildren(RichText);
        if (data['contentType'] === 'RichText' && richText) {
            richText.string = data['content'] || '';
        } else if (label) {
            label.string = data['content'] || '';
        }
    }

    private resolveTitleNode(): Node | null {
        return this.titleNode || this.node.getChildByName('Title') || null;
    }

    private resolveContentNode(): Node | null {
        return this.contentNode
            || this.node.getChildByName('Content')
            || this.node.getChildByName('Label')
            || null;
    }

    private updatePolishTitle(title: string): void {
        if (!title) return;
        const polishTitle = this.findChildDeep(this.node, 'PopupTitle')?.getComponent(Label);
        if (polishTitle) polishTitle.string = title;
    }

    private findChildDeep(root: Node, name: string): Node | null {
        if (!root) return null;
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findChildDeep(child, name);
            if (found) return found;
        }
        return null;
    }

    private updateStructuredContent(
        contentNode: Node,
        labelItem: Node | null,
        richTextItem: Node | null,
        data: Record<string, any>
    ): void {
        if (data['contentType'] === 'Label') {
            // 文本

            if (labelItem) labelItem.active = true;
            if (richTextItem) richTextItem.active = false;

            const label = labelItem?.getComponent(Label);
            if (label) label.string = data['content'] || '';
            setTimeout(() => {
                const targetTransform = labelItem?.getComponent(UITransform);
                const contentTransform = contentNode.getComponent(UITransform);
                if (targetTransform && contentTransform) contentTransform.height = targetTransform.height;
            }, 20);
        } else if (data['contentType'] === 'RichText') {
            // 富文本
            // 富文本

            if (labelItem) labelItem.active = false;
            if (richTextItem) richTextItem.active = true;

            const richText = richTextItem?.getComponent(RichText);
            if (richText) richText.string = data['content'] || '';
            setTimeout(() => {
                const targetTransform = richTextItem?.getComponent(UITransform);
                const contentTransform = contentNode.getComponent(UITransform);
                if (targetTransform && contentTransform) contentTransform.height = targetTransform.height;
            }, 20);
        }
    }

    // 确定
    onSure() {
        this.node.emit('sure', true);
    }

    // 取消
    onCancel() {
        this.node.emit('cancel', true);
        this.node.destroy();
    }

    update(deltaTime: number) {}
}
