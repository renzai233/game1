/**
 * 本地化文本组件
 * 自动根据当前语言显示对应的文本
 */

import { _decorator, Component, Label, RichText } from 'cc';
import { languageDataManager } from './LanguageDataManager';
import { gameBus } from '../../signal/GameBus';
import { SIGNAL_TYPES } from '../../signal/ISignal';

const { ccclass, property } = _decorator;

@ccclass('LocalizedText')
export class LocalizedText extends Component {
  @property
  textKey: string = '';

  @property
  fallbackText: string = '';

  private label: Label | null = null;
  private richText: RichText | null = null;

  start() {
    this.initComponent();
    this.updateText();

    gameBus.on(SIGNAL_TYPES.LANGUAGE_CHANGED, this.onLanguageChanged.bind(this));
  }

  onDestroy() {
    gameBus.off(SIGNAL_TYPES.LANGUAGE_CHANGED, this.onLanguageChanged.bind(this));
  }

  private initComponent(): void {
    this.label = this.getComponent(Label);
    this.richText = this.getComponent(RichText);
  }

  public updateText(): void {
    const text = languageDataManager.getText(this.textKey);
    const finalText = text || this.fallbackText || '';

    if (this.label) {
      this.label.string = finalText;
    }

    if (this.richText) {
      this.richText.string = finalText;
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