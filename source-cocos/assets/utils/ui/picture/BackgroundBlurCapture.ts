import { _decorator, Component, RenderTexture, Sprite, SpriteFrame, UITransform, Vec4, view, Rect, Size, Vec2, Canvas, director } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('BackgroundBlurCapture')
export class BackgroundBlurCapture extends Component {
    @property(Sprite)
    targetSprite: Sprite = null!;

    @property
    downscale = 0.25;

    @property
    strength = 1.0;

    private _rt: RenderTexture | null = null;
    private _sf: SpriteFrame | null = null;

    onEnable() {
        this._setupRT();
        view.on('design-resolution-changed', this._setupRT, this);
    }

    onDisable() {
        view.off('design-resolution-changed', this._setupRT, this);
    }

    private _setupRT = () => {
        if (!this.targetSprite) return;

        const size = view.getVisibleSize();
        const width = Math.max(1, Math.floor(size.width * this.downscale));
        const height = Math.max(1, Math.floor(size.height * this.downscale));

        // 创建（或重置）用于截图的渲染纹理。
        if (!this._rt) this._rt = new RenderTexture();
        this._rt.reset({ width, height });

        if (!this._sf) this._sf = new SpriteFrame();
        this._sf.texture = this._rt;
        this.targetSprite.spriteFrame = this._sf;

        const uiTransform = this.targetSprite.getComponent(UITransform);
        uiTransform?.setContentSize(size);

        const mat = this.targetSprite.getMaterial(0);
        if (mat) {
            // 给模糊材质提供 texelSize 和强度参数。
            mat.setProperty('texelSize', new Vec4(1 / width, 1 / height, width, height));
            mat.setProperty('strength', this.strength);
        }
    };

    public setStrength(value: number) {
        this.strength = value;
        const mat = this.targetSprite?.getMaterial(0);
        if (mat) {
            mat.setProperty('strength', this.strength);
        }
    }

    public captureOnce(): void {
        this._setupRT();
        const camera = this._getCanvasCamera();
        if (!camera || !this._rt) {
            console.warn('[BackgroundBlurCapture] Canvas camera not found; capture skipped.');
            return;
        }

        const prevTarget = camera.targetTexture;
        const prevEnabled = camera.enabled;
        const prevSpriteEnabled = this.targetSprite?.enabled ?? true;

        // 避免相机写入 RT 的同一帧，BlurBg 采样同一 RT。
        if (this.targetSprite) this.targetSprite.enabled = false;

        // 用 Canvas 相机把当前 UI 渲到 RT（仅一帧）。
        camera.targetTexture = this._rt;
        camera.enabled = true;

        this.scheduleOnce(() => {
            // 还原相机状态并恢复 BlurBg 显示。
            camera.targetTexture = prevTarget;
            if (this.targetSprite) this.targetSprite.enabled = prevSpriteEnabled;
            camera.enabled = prevEnabled;
        }, 0);
    }

    private _getCanvasCamera(): Canvas['cameraComponent'] | null {
        // UI 由 Canvas 相机渲染，截图也应使用该相机。
        const canvas = director.getScene()?.getComponentInChildren(Canvas) || null;
        return canvas?.cameraComponent || null;
    }
}
