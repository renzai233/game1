import { EDM } from '../data/env/ConfigManager';

export class Localize {
    private static _instance: Localize;
    public static get instance(): Localize {
        if (!this._instance) this._instance = new Localize();
        return this._instance;
    }
    
    public setLanguage(lang: string): void { 
        EDM.setLanguage(lang as any);
    }
    
    public getLanguage(): string {
        return EDM.currentLanguage;
    }
    
    public t(key: string, params?: Record<string, any>): string {
        const text = EDM.getText(key);
        
        if (!params || Object.keys(params).length === 0) {
            return text;
        }
        
        return this._formatText(text, params);
    }
    
    private _formatText(text: string, params: Record<string, any>): string {
        return text.replace(/\{(\w+)\}/g, (match, key) => {
            return params[key] !== undefined ? String(params[key]) : match;
        });
    }
    
    public getSupportedLanguages(): string[] {
        return EDM.getSupportedLanguages();
    }
}
