import { director, Node, Vec3 } from "cc";

/**
 * 节点和场景相关工具函数
 */

/**
 * 计算两个节点之间的角度
 * @param source 源节点
 * @param target 目标节点
 * @returns 角度值（度）或null
 */
export const computedAngle = (source: Node | null, target: Node | null): number | null => {
    if (!source || !target) {
        return null;
    }

    const startPos = source.getWorldPosition();
    const endPos = target.getWorldPosition();

    // 计算方向向量
    const direction = new Vec3(endPos.x - startPos.x, endPos.y - startPos.y, 0);
    direction.normalize();

    // 计算角度
    const angle = Math.atan2(direction.y, direction.x) * 180 / Math.PI;

    return angle;
};

/**
 * 根据名称获取当前场景下的节点（第一个匹配的）
 * @param nodeName 节点名称
 * @returns 找到的节点或null
 */
export const getNode = (nodeName: string): Node | null => {
    const scene = director.getScene();
    if (!scene) return null;

    const canvasNode = scene.children.find(v => v.name === "Canvas");
    if (!canvasNode) return null;

    let foundNode: Node | null = null;

    const inter = (arr: Node[]) => {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].name === nodeName) {
                foundNode = arr[i];
                break;
            }
            if (arr[i].children && arr[i].children.length > 0) {
                inter(arr[i].children);
            }
        }
    };

    inter(canvasNode.children);
    return foundNode;
};

/**
 * 根据名称获取当前场景下的所有匹配节点
 * @param nodeName 节点名称
 * @returns 节点数组
 */
export const getNodes = (nodeName: string): Node[] => {
    const scene = director.getScene();
    if (!scene) return [];

    const canvasNode = scene.children.find(v => v.name === "Canvas");
    if (!canvasNode) return [];

    const nodeArr: Node[] = [];

    const inter = (arr: Node[]) => {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].name === nodeName) {
                nodeArr.push(arr[i]);
            }
            if (arr[i].children && arr[i].children.length > 0) {
                inter(arr[i].children);
            }
        }
    };

    inter(canvasNode.children);
    return nodeArr;
};