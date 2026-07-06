import { _decorator, Component, Node, Graphics, Label, Sprite, UITransform, Vec3, view, Color, EventTouch, tween, Widget, Button, Rect, Tween, UIOpacity } from 'cc';

const { ccclass, property } = _decorator;

export interface GuideStepOptions {
    targetNode: Node | null;
    targetNodes?: Node[];
    handTargetNode?: Node | null;
    text: string;
    direction: 'up' | 'down' | 'left' | 'right';
    isClickTarget: boolean; // If true, player must click the target node. If false, player can click anywhere/Next button.
    callback: () => void;
}

@ccclass('GuideLayer')
export class GuideLayer extends Component {
    private _graphics: Graphics | null = null;
    private _dialogNode: Node | null = null;
    private _dialogBg: Graphics | null = null;
    private _dialogLabel: Label | null = null;
    private _handNode: Node | null = null;
    private _handSprite: Sprite | null = null;
    private _focusNode: Node | null = null;
    private _focusGraphics: Graphics | null = null;
    private _focusOpacity: UIOpacity | null = null;
    private _blockNode: Node | null = null;

    private _currentTargetNode: Node | null = null;
    private _currentOptions: GuideStepOptions | null = null;
    private _isClickingTarget = false;
    private _activeTouchedNode: Node | null = null;
    private _handTween: Tween<Node> | null = null;
    private _focusTween: Tween<Node> | null = null;

    onLoad() {
        this.initUI();
        this.registerEvents();
    }

    private initUI() {
        // 1. Ensure the GuideLayer node itself has a UITransform and Widget to fit the screen
        const selfTrans = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        const winSize = view.getVisibleSize();
        selfTrans.setContentSize(winSize.width, winSize.height);

        const selfWidget = this.node.getComponent(Widget) || this.node.addComponent(Widget);
        selfWidget.isAlignLeft = true;
        selfWidget.isAlignRight = true;
        selfWidget.isAlignTop = true;
        selfWidget.isAlignBottom = true;
        selfWidget.left = 0;
        selfWidget.right = 0;
        selfWidget.top = 0;
        selfWidget.bottom = 0;

        // 2. Create the Block/Overlay node which contains the Graphics component for the dark mask
        this._blockNode = new Node('GuideBlock');
        const blockTrans = this._blockNode.addComponent(UITransform);
        blockTrans.setContentSize(winSize.width, winSize.height);
        
        const blockWidget = this._blockNode.addComponent(Widget);
        blockWidget.isAlignLeft = true;
        blockWidget.isAlignRight = true;
        blockWidget.isAlignTop = true;
        blockWidget.isAlignBottom = true;
        blockWidget.left = 0;
        blockWidget.right = 0;
        blockWidget.top = 0;
        blockWidget.bottom = 0;

        this._graphics = this._blockNode.addComponent(Graphics);
        this.node.addChild(this._blockNode);

        this._focusNode = new Node('GuideFocusFrame');
        this._focusNode.addComponent(UITransform);
        this._focusGraphics = this._focusNode.addComponent(Graphics);
        this._focusOpacity = this._focusNode.addComponent(UIOpacity);
        this.node.addChild(this._focusNode);
        this._focusNode.active = false;

        // 3. Create the Dialogue Box Node
        this._dialogNode = new Node('GuideDialog');
        const dialogTrans = this._dialogNode.addComponent(UITransform);
        dialogTrans.setContentSize(520, 160);
        this._dialogBg = this._dialogNode.addComponent(Graphics);
        this.node.addChild(this._dialogNode);

        // Draw Dialog Box Background dynamically
        this.drawDialogBg(this._dialogBg, 520, 160);

        // Add Label to the Dialogue Box
        const labelNode = new Node('GuideText');
        const labelTrans = labelNode.addComponent(UITransform);
        labelTrans.setContentSize(480, 120);
        this._dialogLabel = labelNode.addComponent(Label);
        this._dialogLabel.fontSize = 24;
        this._dialogLabel.lineHeight = 32;
        this._dialogLabel.color = Color.WHITE;
        this._dialogLabel.overflow = Label.Overflow.SHRINK;
        this._dialogLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._dialogLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._dialogLabel.string = '新手引导文本';
        this._dialogNode.addChild(labelNode);

        // 4. Create the Pointing Finger Hand Node
        this._handNode = new Node('GuideHand');
        const handTrans = this._handNode.addComponent(UITransform);
        handTrans.setContentSize(100, 100);
        this._handSprite = this._handNode.addComponent(Sprite);
        this.node.addChild(this._handNode);

        this._handNode.active = false;
        this._dialogNode.active = false;
    }

    private drawDialogBg(graphics: Graphics, w: number, h: number) {
        graphics.clear();
        // Modern, premium glassmorphic dark background
        graphics.fillColor = new Color(20, 24, 35, 235);
        graphics.strokeColor = new Color(255, 215, 0, 255); // Premium Gold Border
        graphics.lineWidth = 4;
        graphics.roundRect(-w / 2, -h / 2, w, h, 18);
        graphics.fill();
        graphics.stroke();
    }

    private registerEvents() {
        if (!this._blockNode) return;

        // Register touch events on the block overlay node
        this._blockNode.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this._blockNode.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this._blockNode.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this._blockNode.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    public showStep(options: GuideStepOptions) {
        this._currentOptions = options;
        this._currentTargetNode = options.targetNode;

        this.node.active = true;
        
        // Ensure GuideLayer is on top
        if (this.node.parent) {
            this.node.setSiblingIndex(this.node.parent.children.length - 1);
        }

        // 1. Update text
        if (this._dialogLabel) {
            this._dialogLabel.string = options.text;
        }

        // 2. Refresh Overlay & Position Elements
        this.refreshGuideLayout();
    }

    public hide() {
        this.stopHandTween();
        this.stopFocusTween();
        this.node.active = false;
        this._currentTargetNode = null;
        this._currentOptions = null;
    }

    private refreshGuideLayout() {
        const winSize = view.getVisibleSize();
        const W = winSize.width;
        const H = winSize.height;

        if (!this._currentTargetNode || !this._currentTargetNode.isValid) {
            // No target node: draw full darkened overlay (dialogue-only step)
            if (this._graphics) {
                this._graphics.clear();
                this._graphics.fillColor = new Color(0, 0, 0, 180);
                this._graphics.rect(-W / 2, -H / 2, W, H);
                this._graphics.fill();
            }

            if (this._handNode) {
                this._handNode.active = false;
            }
            this.hideFocusFrame();

            // Position dialogue box in the lower-middle part
            if (this._dialogNode) {
                this._dialogNode.active = true;
                this._dialogNode.setPosition(0, -150, 0);
            }
            return;
        }

        // Get target bounding box
        const targetTrans = this._currentTargetNode.getComponent(UITransform);
        const selfTrans = this.node.getComponent(UITransform);

        if (!targetTrans || !selfTrans) {
            console.error('[GuideLayer] UITransform missing');
            return;
        }

        // Calculate world rect of the target node
        const worldRect = targetTrans.getBoundingBoxToWorld();
        if (this._currentOptions?.targetNodes && this._currentOptions.targetNodes.length > 0) {
            let minX = worldRect.x;
            let minY = worldRect.y;
            let maxX = worldRect.x + worldRect.width;
            let maxY = worldRect.y + worldRect.height;
            this._currentOptions.targetNodes.forEach(node => {
                if (node && node.isValid) {
                    const trans = node.getComponent(UITransform);
                    if (trans) {
                        const r = trans.getBoundingBoxToWorld();
                        minX = Math.min(minX, r.x);
                        minY = Math.min(minY, r.y);
                        maxX = Math.max(maxX, r.x + r.width);
                        maxY = Math.max(maxY, r.y + r.height);
                    }
                }
            });
            worldRect.x = minX;
            worldRect.y = minY;
            worldRect.width = maxX - minX;
            worldRect.height = maxY - minY;
        }

        // Convert world center position to local coordinates of this GuideLayer node
        const worldCenter = new Vec3(worldRect.x + worldRect.width / 2, worldRect.y + worldRect.height / 2, 0);
        const localPos = selfTrans.convertToNodeSpaceAR(worldCenter);

        const holeW = worldRect.width + 16; // Add minor padding
        const holeH = worldRect.height + 16;
        const hx = localPos.x - holeW / 2;
        const hy = localPos.y - holeH / 2;

        // Draw overlay with hole using the 4-rectangle method
        if (this._graphics) {
            this._graphics.clear();
            this._graphics.fillColor = new Color(0, 0, 0, 180); // Semi-transparent black

            // Left
            this._graphics.rect(-W / 2, -H / 2, hx - (-W / 2), H);
            // Right
            this._graphics.rect(hx + holeW, -H / 2, W / 2 - (hx + holeW), H);
            // Top (middle column)
            this._graphics.rect(hx, hy + holeH, holeW, H / 2 - (hy + holeH));
            // Bottom (middle column)
            this._graphics.rect(hx, -H / 2, holeW, hy - (-H / 2));

            this._graphics.fill();

            // Highlight border around the hole
            this._graphics.strokeColor = new Color(255, 215, 0, 255); // Gold border
            this._graphics.lineWidth = 3;
            this._graphics.roundRect(hx, hy, holeW, holeH, 12);
            this._graphics.stroke();
        }

        this.showFocusFrame(localPos, holeW, holeH);

        // The old hand texture is a cyan empty frame and can look like a wrong target.
        // Keep guidance on the verified target frame only.
        if (this._handNode) {
            this.stopHandTween();
            this._handNode.active = false;
        }

        // Position dialogue card dynamically to avoid overlapping the target node
        if (this._dialogNode) {
            this._dialogNode.active = true;
            if (localPos.y > 0) {
                // Target is in the upper half of screen, place dialog card in lower half
                this._dialogNode.setPosition(0, -220, 0);
            } else {
                // Target is in the lower half of screen, place dialog card in upper half
                this._dialogNode.setPosition(0, 220, 0);
            }
        }
    }

    private playHandTween(startPos: Vec3, moveOffset: Vec3) {
        if (!this._handNode) return;
        this._handNode.setPosition(startPos);
        const endPos = startPos.clone().add(moveOffset);

        this._handTween = tween(this._handNode)
            .to(0.5, { position: endPos }, { easing: 'sineOut' })
            .to(0.4, { position: startPos }, { easing: 'sineIn' })
            .union()
            .repeatForever()
            .start();
    }

    private showFocusFrame(center: Vec3, width: number, height: number) {
        if (!this._focusNode || !this._focusGraphics || !this._focusOpacity) return;

        const frameWidth = width + 22;
        const frameHeight = height + 22;
        const transform = this._focusNode.getComponent(UITransform) || this._focusNode.addComponent(UITransform);
        transform.setContentSize(frameWidth, frameHeight);
        this._focusNode.active = true;
        this._focusNode.setPosition(center);
        this._focusNode.setScale(1, 1, 1);
        this._focusOpacity.opacity = 255;

        this.drawFocusFrame(this._focusGraphics, frameWidth, frameHeight);
        this.playFocusTween(center);
    }

    private hideFocusFrame() {
        this.stopFocusTween();
        if (this._focusNode) this._focusNode.active = false;
    }

    private drawFocusFrame(graphics: Graphics, w: number, h: number) {
        graphics.clear();
        const x = -w / 2;
        const y = -h / 2;

        graphics.fillColor = new Color(28, 20, 66, 72);
        graphics.roundRect(x + 5, y + 5, w - 10, h - 10, 18);
        graphics.fill();

        graphics.fillColor = new Color(255, 219, 70, 28);
        graphics.roundRect(x + 15, y + 15, w - 30, h - 30, 12);
        graphics.fill();

        graphics.strokeColor = new Color(255, 203, 0, 92);
        graphics.lineWidth = 12;
        graphics.roundRect(x, y, w, h, 18);
        graphics.stroke();

        graphics.strokeColor = new Color(255, 224, 30, 255);
        graphics.lineWidth = 5;
        graphics.roundRect(x, y, w, h, 16);
        graphics.stroke();

        graphics.strokeColor = new Color(255, 255, 206, 225);
        graphics.lineWidth = 2;
        graphics.roundRect(x + 7, y + 7, w - 14, h - 14, 12);
        graphics.stroke();

        this.drawCornerBracket(graphics, x, y, 1, 1);
        this.drawCornerBracket(graphics, x + w, y, -1, 1);
        this.drawCornerBracket(graphics, x, y + h, 1, -1);
        this.drawCornerBracket(graphics, x + w, y + h, -1, -1);
        this.drawDiamond(graphics, 0, h / 2 + 10, 10);
        this.drawDiamond(graphics, 0, -h / 2 - 10, 8);
    }

    private drawCornerBracket(graphics: Graphics, x: number, y: number, sx: number, sy: number) {
        const long = 52;
        const short = 18;
        graphics.strokeColor = new Color(255, 96, 244, 218);
        graphics.lineWidth = 3;
        graphics.moveTo(x + sx * short, y);
        graphics.lineTo(x + sx * long, y);
        graphics.moveTo(x, y + sy * short);
        graphics.lineTo(x, y + sy * long);
        graphics.stroke();
    }

    private drawDiamond(graphics: Graphics, x: number, y: number, size: number) {
        graphics.fillColor = new Color(255, 232, 62, 235);
        graphics.moveTo(x, y + size);
        graphics.lineTo(x + size, y);
        graphics.lineTo(x, y - size);
        graphics.lineTo(x - size, y);
        graphics.close();
        graphics.fill();
    }

    private playFocusTween(center: Vec3) {
        if (!this._focusNode) return;
        this.stopFocusTween();
        const left = new Vec3(center.x - 4, center.y, center.z);
        const right = new Vec3(center.x + 4, center.y, center.z);

        this._focusTween = tween(this._focusNode)
            .to(0.22, { scale: new Vec3(1.026, 1.026, 1), position: right }, { easing: 'sineOut' })
            .to(0.12, { position: left }, { easing: 'sineInOut' })
            .to(0.18, { scale: new Vec3(1, 1, 1), position: center }, { easing: 'sineIn' })
            .delay(0.55)
            .union()
            .repeatForever()
            .start();
    }

    private stopFocusTween() {
        if (this._focusTween) {
            this._focusTween.stop();
            this._focusTween = null;
        }
        if (this._focusNode) {
            Tween.stopAllByTarget(this._focusNode);
        }
    }

    private stopHandTween() {
        if (this._handTween) {
            this._handTween.stop();
            this._handTween = null;
        }
        if (this._handNode) {
            Tween.stopAllByTarget(this._handNode);
        }
    }

    private isTouchInHole(event: EventTouch): boolean {
        if (!this._currentTargetNode || !this._currentTargetNode.isValid) {
            return false;
        }

        const targetTrans = this._currentTargetNode.getComponent(UITransform);
        if (!targetTrans) return false;

        const worldRect = targetTrans.getBoundingBoxToWorld();
        if (this._currentOptions?.targetNodes && this._currentOptions.targetNodes.length > 0) {
            let minX = worldRect.x;
            let minY = worldRect.y;
            let maxX = worldRect.x + worldRect.width;
            let maxY = worldRect.y + worldRect.height;
            this._currentOptions.targetNodes.forEach(node => {
                if (node && node.isValid) {
                    const trans = node.getComponent(UITransform);
                    if (trans) {
                        const r = trans.getBoundingBoxToWorld();
                        minX = Math.min(minX, r.x);
                        minY = Math.min(minY, r.y);
                        maxX = Math.max(maxX, r.x + r.width);
                        maxY = Math.max(maxY, r.y + r.height);
                    }
                }
            });
            worldRect.x = minX;
            worldRect.y = minY;
            worldRect.width = maxX - minX;
            worldRect.height = maxY - minY;
        }

        // Add minor padding to make clicking easier for players
        const paddedRect = new Rect(
            worldRect.x - 8,
            worldRect.y - 8,
            worldRect.width + 16,
            worldRect.height + 16
        );

        const touchUILoc = event.getUILocation();
        return paddedRect.contains(touchUILoc);
    }

    private getTouchedNode(event: EventTouch): Node | null {
        const touchUILoc = event.getUILocation();
        if (this._currentOptions?.targetNodes) {
            for (let i = 0; i < this._currentOptions.targetNodes.length; i++) {
                const node = this._currentOptions.targetNodes[i];
                if (node && node.isValid) {
                    const trans = node.getComponent(UITransform);
                    if (trans) {
                        const r = trans.getBoundingBoxToWorld();
                        if (r.contains(touchUILoc)) {
                            return node;
                        }
                    }
                }
            }
        }
        
        if (this._currentTargetNode && this._currentTargetNode.isValid) {
            const trans = this._currentTargetNode.getComponent(UITransform);
            if (trans) {
                const r = trans.getBoundingBoxToWorld();
                if (r.contains(touchUILoc)) {
                    return this._currentTargetNode;
                }
            }
        }
        
        return this._currentTargetNode;
    }

    private onTouchStart(event: EventTouch) {
        if (this._currentOptions?.isClickTarget) {
            if (this.isTouchInHole(event)) {
                this._isClickingTarget = true;
                this._activeTouchedNode = this.getTouchedNode(event);
                if (this._activeTouchedNode && this._activeTouchedNode.isValid) {
                    this._activeTouchedNode.dispatchEvent(event);
                }
            } else {
                this._isClickingTarget = false;
                event.propagationStopped = true;
                this.playReminderAnimation();
            }
        } else {
            // Dialogue-only or click anywhere to continue step
            event.propagationStopped = true;
        }
    }

    private onTouchMove(event: EventTouch) {
        if (this._currentOptions?.isClickTarget) {
            if (this._isClickingTarget && this._activeTouchedNode && this._activeTouchedNode.isValid) {
                this._activeTouchedNode.dispatchEvent(event);
            } else {
                event.propagationStopped = true;
            }
        } else {
            event.propagationStopped = true;
        }
    }

    private onTouchEnd(event: EventTouch) {
        if (this._currentOptions?.isClickTarget) {
            if (this._isClickingTarget) {
                if (this._activeTouchedNode && this._activeTouchedNode.isValid) {
                    this._activeTouchedNode.dispatchEvent(event);
                    this.triggerButtonComponent(this._activeTouchedNode);
                }

                // Call the step callback
                const cb = this._currentOptions?.callback;
                this.hide();
                if (cb) cb();
            } else {
                event.propagationStopped = true;
            }
        } else {
            // Dialogue-only step: proceed on any click
            event.propagationStopped = true;
            const cb = this._currentOptions?.callback;
            this.hide();
            if (cb) cb();
        }
        this._isClickingTarget = false;
        this._activeTouchedNode = null;
    }

    private onTouchCancel(event: EventTouch) {
        if (this._currentOptions?.isClickTarget && this._isClickingTarget) {
            if (this._activeTouchedNode && this._activeTouchedNode.isValid) {
                this._activeTouchedNode.dispatchEvent(event);
            }
        }
        this._isClickingTarget = false;
        this._activeTouchedNode = null;
        event.propagationStopped = true;
    }

    private forwardEvent(event: EventTouch, eventType: string) {
        if (!this._currentTargetNode || !this._currentTargetNode.isValid) return;
        
        // Re-dispatch event down to target
        this._currentTargetNode.dispatchEvent(event);
    }

    private triggerButtonComponent(node: Node | null) {
        if (!node) return;

        // Traverse up to find Button component (covers child nodes inside a Button node)
        let curr: Node | null = node;
        let button: Button | null = null;
        while (curr) {
            button = curr.getComponent(Button);
            if (button) break;
            curr = curr.parent;
        }

        if (button && button.interactable) {
            console.log('[GuideLayer] Programmatically triggering button click on:', button.node.name);
            if (button.clickEvents) {
                button.clickEvents.forEach(handler => {
                    if (handler && typeof handler.emit === 'function') {
                        handler.emit([button]);
                    }
                });
            }
            button.node.emit('click', button);
        }
    }

    private playReminderAnimation() {
        if (!this._dialogNode) return;

        // Wiggle the dialog card to grab user attention
        const originalPos = this._dialogNode.getPosition();
        Tween.stopAllByTarget(this._dialogNode);
        
        tween(this._dialogNode)
            .to(0.05, { position: new Vec3(originalPos.x - 10, originalPos.y, originalPos.z) })
            .to(0.1, { position: new Vec3(originalPos.x + 10, originalPos.y, originalPos.z) })
            .to(0.05, { position: new Vec3(originalPos.x, originalPos.y, originalPos.z) })
            .start();
    }
}
