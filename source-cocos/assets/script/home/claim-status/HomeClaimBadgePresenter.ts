import { Node } from 'cc';
import { ClaimSnapshot } from './types';

interface NoticeNodes {
    dailyTask: Node | null;
    signInTask: Node | null;
    offlineReward: Node | null;
}

export class HomeClaimBadgePresenter {
    private readonly root: Node;
    private noticeNodes: NoticeNodes = {
        dailyTask: null,
        signInTask: null,
        offlineReward: null
    };

    constructor(root: Node) {
        this.root = root;
    }

    render(snapshot: ClaimSnapshot): void {
        this.ensureNoticeNodes();

        this.setNodeActive(this.noticeNodes.dailyTask, snapshot.entries.dailyTask.badgeVisible);
        this.setNodeActive(this.noticeNodes.signInTask, snapshot.entries.signInTask.badgeVisible);
        this.setNodeActive(this.noticeNodes.offlineReward, snapshot.entries.offlineReward.badgeVisible);
    }

    private ensureNoticeNodes(): void {
        if (!this.noticeNodes.dailyTask || !this.noticeNodes.dailyTask.isValid) {
            const button = this.findNodeByName(this.root, 'DailyTaskBtn');
            this.noticeNodes.dailyTask = button ? button.getChildByName('Notice') : null;
        }

        if (!this.noticeNodes.signInTask || !this.noticeNodes.signInTask.isValid) {
            const button = this.findNodeByName(this.root, 'SignInTaskBtn');
            this.noticeNodes.signInTask = button ? button.getChildByName('Notice') : null;
        }

        if (!this.noticeNodes.offlineReward || !this.noticeNodes.offlineReward.isValid) {
            const patrol = this.findNodeByName(this.root, 'Patrol');
            this.noticeNodes.offlineReward = patrol ? patrol.getChildByName('Notice') : null;
        }
    }

    private setNodeActive(node: Node | null, active: boolean): void {
        if (!node || !node.isValid) {
            return;
        }

        node.active = active;
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
