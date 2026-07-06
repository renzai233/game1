/**
 * 本地化按钮组件
 * 自动根据当前语言显示对应的按钮文本
 */

import { _decorator, Component, Button, Label } from 'cc';
import { languageDataManager } from './LanguageDataManager';
import { gameBus } from '../../signal/GameBus';
import { SIGNAL_TYPES } from '../../signal/ISignal';

const { ccclass, property } = _decorator;

@ccclass('LocalizedButton')
export class LocalizedButton extends Component {
  @property
  textKey: string = '';

  @property
  fallbackText: string = '';

  private button: Button | null = null;
  private label: Label | null = null;

  start() {
    this.initComponent();
    this.updateText();

    gameBus.on(SIGNAL_TYPES.LANGUAGE_CHANGED, this.onLanguageChanged.bind(this));
  }

  onDestroy() {
    gameBus.off(SIGNAL_TYPES.LANGUAGE_CHANGED, this.onLanguageChanged.bind(this));
  }

  private initComponent(): void {
    this.button = this.getComponent(Button);

    const labelNode = this.node.getChildByName('Label');
    if (labelNode) {
      this.label = labelNode.getComponent(Label);
    }
  }

  public updateText(): void {
    const text = languageDataManager.getText(this.textKey);
    const finalText = text || this.fallbackText || '';

    if (this.label) {
      this.label.string = finalText;
    }
  }

  public setTextKey(key: string): void {
    this.textKey = key;
    this.updateText();
  }

  private onLanguageChanged(): void {
    this.updateText();
  }
} 