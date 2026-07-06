import { Collider2D, Node, RigidBody2D } from 'cc';

type PhysicsComponent = Collider2D | RigidBody2D;

const getNodePath = (node: Node | null): string => {
    if (!node || !node.isValid) return '<invalid-node>';
    const names: string[] = [];
    let current: Node | null = node;
    while (current && current.isValid) {
        names.unshift(current.name || '<unnamed>');
        current = current.parent;
    }
    return names.join('/');
};

const collectValidNodes = (root: Node | null, includeChildren: boolean): Node[] => {
    if (!root || !root.isValid) return [];
    if (!includeChildren) return [root];

    const result: Node[] = [];
    const stack: Node[] = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || !current.isValid) continue;
        result.push(current);

        let children: readonly Node[] | null = null;
        try {
            children = current.children || null;
        } catch (error) {
            console.warn(`[SafePhysics2D] read children failed: ${getNodePath(current)}`, error);
            continue;
        }

        if (!children || children.length === 0) continue;
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            if (child && child.isValid) {
                stack.push(child);
            }
        }
    }
    return result;
};

const collectComponents = <T extends PhysicsComponent>(
    node: Node | null,
    type: new (...args: any[]) => T,
    includeChildren: boolean,
): T[] => {
    const nodes = collectValidNodes(node, includeChildren);
    const components: T[] = [];
    nodes.forEach((current) => {
        try {
            current.getComponents(type).forEach((component) => {
                if (component && component.isValid) {
                    components.push(component);
                }
            });
        } catch (error) {
            console.warn(`[SafePhysics2D] get components failed: ${getNodePath(current)}`, error);
        }
    });
    return components;
};

export const safeDisablePhysics2D = (node: Node | null, includeChildren: boolean = true): void => {
    if (!node || !node.isValid) return;

    const colliders = collectComponents(node, Collider2D, includeChildren);
    colliders.forEach((collider) => {
        if (collider && collider.isValid && collider.enabled) {
            try {
                collider.enabled = false;
            } catch (error) {
                console.warn(`[SafePhysics2D] disable collider failed: ${getNodePath(collider.node)}`, error);
            }
        }
    });

    const bodies = collectComponents(node, RigidBody2D, includeChildren);
    bodies.forEach((body) => {
        if (body && body.isValid && body.enabled) {
            try {
                body.enabled = false;
            } catch (error) {
                console.warn(`[SafePhysics2D] disable rigid body failed: ${getNodePath(body.node)}`, error);
            }
        }
    });
};

export const safeRestorePhysics2D = (node: Node | null, includeChildren: boolean = true): void => {
    if (!node || !node.isValid) return;

    const bodies = collectComponents(node, RigidBody2D, includeChildren);
    bodies.forEach((body) => {
        if (body && body.isValid && !body.enabled) {
            try {
                body.enabled = true;
            } catch (error) {
                console.warn(`[SafePhysics2D] restore rigid body failed: ${getNodePath(body.node)}`, error);
            }
        }
    });

    const colliders = collectComponents(node, Collider2D, includeChildren);
    colliders.forEach((collider) => {
        if (collider && collider.isValid && !collider.enabled) {
            try {
                collider.enabled = true;
            } catch (error) {
                console.warn(`[SafePhysics2D] restore collider failed: ${getNodePath(collider.node)}`, error);
            }
        }
    });
};

export const safeApplyColliderShape = (collider: Collider2D | null, label: string = ''): boolean => {
    if (!collider || !collider.isValid) return false;
    const node = collider.node;
    if (!node || !node.isValid || !node.parent || !node.activeInHierarchy || !collider.enabled) {
        return false;
    }

    try {
        collider.apply();
        return true;
    } catch (error) {
        console.warn(`[SafePhysics2D] collider.apply failed${label ? ` (${label})` : ''}: ${getNodePath(node)}`, error);
        return false;
    }
};
