import { Singleton } from '../../common/Singleton';
import { Language, ILanguageConfig, ILanguageData, ILanguageManagerConfig } from './ILanguageConfig';
import { zhDict } from './CLzh';
import { enDict } from './CLen';
import { jaDict } from './CLja';
import { koDict } from './CLko';
import { gameBus } from '../../signal/GameBus';
import { SIGNAL_TYPES } from '../../signal/ISignal';

export class LanguageDataManager extends Singleton {
    private static readonly LANGUAGE_KEY = 'language';
    private _currentLanguage: Language = 'zh';
    private _supportedLanguages: ILanguageConfig[] = [
        { code: 'zh', name: 'Chinese', nativeName: '中文' },
        { code: 'en', name: 'English', nativeName: 'English' },
        { code: 'ja', name: 'Japanese', nativeName: '日本語' },
        { code: 'ko', name: 'Korean', nativeName: '한국어' }
    ];
    private _languageData: { [key in Language]: ILanguageData } = {
        zh: zhDict,
        en: enDict,
        ja: jaDict,
        ko: koDict
    };

    async initialize(): Promise<boolean> {
        this.loadSavedLanguage();
        return true;
    }

    private loadSavedLanguage(): void {
        const saved = localStorage.getItem(LanguageDataManager.LANGUAGE_KEY);
        if (saved && this.isLanguageSupported(saved as Language)) {
            this._currentLanguage = saved as Language;
        }
    }

    public getCurrentLanguage(): Language {
        return this._currentLanguage;
    }

    public setLanguage(language: Language): void {
        if (!this.isLanguageSupported(language)) {
            console.warn(`[LanguageDataManager] 不支持的语言: ${language}`);
            return;
        }

        if (this._currentLanguage === language) {
            return;
        }

        this._currentLanguage = language;
        localStorage.setItem(LanguageDataManager.LANGUAGE_KEY, language);
        
        gameBus.emit(SIGNAL_TYPES.LANGUAGE_CHANGED, language);
    }

    public getText(key: string, language?: Language): string {
        const lang = language || this._currentLanguage;
        const dict = this._languageData[lang];
        
        if (!dict) {
            console.warn(`[LanguageDataManager] 未找到语言字典: ${lang}`);
            return '';
        }
        
        const text = dict[key];
        if (!text) {
            console.warn(`[LanguageDataManager] 未找到文本键: ${key} (语言: ${lang})`);
            return '';
        }
        
        return text;
    }

    public getSupportedLanguages(): ILanguageConfig[] {
        return [...this._supportedLanguages];
    }

    public isLanguageSupported(code: string): code is Language {
        return this._supportedLanguages.some(lang => lang.code === code);
    }

    public getLanguageDisplayName(code: Language, useNative: boolean = false): string {
        const config = this._supportedLanguages.find(lang => lang.code === code);
        if (!config) {
            return code;
        }
        return useNative ? config.nativeName : config.name;
    }

    public switchToNextLanguage(): Language {
        const currentIndex = this._supportedLanguages.findIndex(lang => lang.code === this._currentLanguage);
        const nextIndex = (currentIndex + 1) % this._supportedLanguages.length;
        const nextLanguage = this._supportedLanguages[nextIndex].code;
        
        this.setLanguage(nextLanguage);
        return nextLanguage;
    }
}

export const languageDataManager = LanguageDataManager.instance();
