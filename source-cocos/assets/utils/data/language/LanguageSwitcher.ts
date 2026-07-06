/**
 * 语言切换器组件
 * 用于在界面上切换语言
 */

import { _decorator, Component, Node, Label } from 'cc';
import { languageDataManager } from './LanguageDataManager';
import { Language } from './ILanguageConfig';

const { ccclass, property } = _decorator;

@ccclass('LanguageSwitcher')
export class LanguageSwitcher extends Component {
  @property(Node)
  languageMenu: Node | null = null;

  @property(Label)
  currentLanguageLabel: Label | null = null;

  start() {
    this.updateCurrentLanguageDisplay();
  }

  public showLanguageMenu(): void {
    if (this.languageMenu) {
      this.languageMenu.active = true;
    }
  }

  public hideLanguageMenu(): void {
    if (this.languageMenu) {
      this.languageMenu.active = false;
    }
  }

  public switchLanguage(lang: Language): void {
    languageDataManager.setLanguage(lang);
    this.updateCurrentLanguageDisplay();
    this.hideLanguageMenu();
  }

  private updateCurrentLanguageDisplay(): void {
    if (this.currentLanguageLabel) {
      const lang = languageDataManager.getCurrentLanguage();
      const displayName = languageDataManager.getLanguageDisplayName(lang, true);
      this.currentLanguageLabel.string = displayName;
    }
  }
} 