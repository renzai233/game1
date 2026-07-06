import { Node } from 'cc';
import { HOME_CLAIM_NOTICE_KEYS, HomeClaimNoticeKey, HomeClaimNoticeSnapshot } from './types';

interface NoticeNodes {
    dailyTask: Node | null;
    signInTask: Node | null;
    offlineReward: Node | null;
}

const NOTICE_NODE_QUERIES: Record<HomeClaimNoticeKey, { target: string; notice: string }> = {
    dailyTask: { target: 'DailyTaskBtn', notice: 'Notice' },
    signInTask: { target: 'SignInTaskBtn', notice: 'Notice' },
    offlineReward: { target: 'Patrol', notice: 'Notice' }
};

export class HomeClaimNoticePresenter {
    private readonly root: Node;
    private readonly noticeNodes: NoticeNodes = {
        dailyTask: null,
        signInTask: null,
        offlineReward: null
    };

    constructor(root: Node) {
        this.root = root;
    }

    render(snapshot: HomeClaimNoticeSnapshot, changedKeys: readonly HomeClaimNoticeKey[] = HOME_CLAIM_NOTICE_KEYS): void {
        changedKeys.forEach((key) => {
            this.ensureNode(key);
            this.setNodeActive(this.noticeNodes[key], snapshot.entries[key].visible);
        });
    }

    private ensureNode(key: HomeClaimNoticeKey): void {
        const cached = this.noticeNodes[key];
        if (cached && cached.isValid) {
            return;
        }

        const query = NOTICE_NODE_QUERIES[key];
        const target = this.findNodeByName(this.root, query.target);
        this.noticeNodes[key] = target ? target.getChildByName(query.notice) : null;
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
