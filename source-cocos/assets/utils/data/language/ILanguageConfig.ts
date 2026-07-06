export type Language = 'zh' | 'en' | 'ja' | 'ko';

export interface ILanguageConfig {
    code: Language;
    name: string;
    nativeName: string;
}

export interface ILanguageData {
    [key: string]: string;
}

export interface ILanguageManagerConfig {
    currentLanguage: Language;
    supportedLanguages: ILanguageConfig[];
    languageData: { [key in Language]: ILanguageData };
}
