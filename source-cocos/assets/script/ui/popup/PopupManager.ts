/**
 * 弹窗管理器
 * 用于管理游戏中所有弹窗的显示顺序
 */
class PopupManager {
    private static instance: PopupManager = null;
    private popupQueue: Array<{
        type: string,
        callback: Function,
        params?: any
    }> = [];
    private isShowing: boolean = false;

    static getInstance(): PopupManager {
        if (!this.instance) {
            this.instance = new PopupManager();
        }
        return this.instance;
    }

    /**
     * 添加弹窗到队列
     * @param type 弹窗类型
     * @param callback 显示弹窗的回调函数
     * @param params 额外参数
     */
    addPopup(type: string, callback: Function, params?: any) {
        this.popupQueue.push({ type, callback, params });
        this.checkQueue();
    }

    /**
     * 关闭当前弹窗，显示下一个
     */
    closeCurrentPopup() {
        this.isShowing = false;
        this.checkQueue();
    }

    /**
     * 检查并显示队列中的下一个弹窗
     */
    private checkQueue() {
        if (this.isShowing || this.popupQueue.length === 0) return;

        const nextPopup = this.popupQueue.shift();
        this.isShowing = true;
        nextPopup.callback(nextPopup.params);
    }

    /**
     * 清空弹窗队列
     */
    clearQueue() {
        this.popupQueue = [];
        this.isShowing = false;
    }
}

export const popupManager = PopupManager.getInstance();
