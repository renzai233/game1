import { Color } from 'cc';

export interface IHeroBackgroundConfig {
    backgroundPath: string;
    bgPath: string;
    backgroundColor?: string;
    borderColor?: string;
    enableGlow: boolean;
    glowColor?: string;
}

export class HeroBackgroundConfig {
    private static readonly DEFAULT_BACKGROUND: IHeroBackgroundConfig = {
        backgroundPath: 'textures/ui/bg/card/card-bg-normal',
        bgPath: 'textures/ui/bg/win/winbg-normal',
        enableGlow: false
    };

    private static readonly HERO_RARITY_BACKGROUNDS: Record<string, IHeroBackgroundConfig> = {
        'common': {
            backgroundPath: 'textures/ui/bg/card/card-bg01/spriteFrame',
            bgPath: 'textures/ui/bg/win/winbg01',
            backgroundColor: '#8A8A8A',
            borderColor: '#8A8A8A',
            enableGlow: false
        },
        'rare': {
            backgroundPath: 'textures/ui/bg/card/card-bg02/spriteFrame',
            bgPath: 'textures/ui/bg/win/winbg02',
            backgroundColor: '#b9dd94',
            borderColor: '#b9dd94',
            enableGlow: false
        },
        'epic': {
            backgroundPath: 'textures/ui/bg/card/card-bg03/spriteFrame',
            bgPath: 'textures/ui/bg/win/winbg03',
            backgroundColor: '#4A7BC8',
            borderColor: '#4A7BC8',
            enableGlow: false,
        },
        'legendary': {
            backgroundPath: 'textures/ui/bg/card/card-bg04/spriteFrame',
            bgPath: 'textures/ui/bg/win/winbg04',
            backgroundColor: '#B464DC',
            borderColor: '#8A4AA8',
            enableGlow: false,
            glowColor: '#B464DC'
        }
    };

    public static getHeroBackgroundConfig(rarity: string): IHeroBackgroundConfig {
        const config = this.HERO_RARITY_BACKGROUNDS[rarity];
        if (!config) {
            console.warn(`[HeroBackgroundConfig] 未找到稀有度 ${rarity} 的背景配置，使用默认配置`);
            return this.DEFAULT_BACKGROUND;
        }
        return config;
    }

    public static getHeroBackgroundPath(rarity: string): string {
        const config = this.getHeroBackgroundConfig(rarity);
        return config.backgroundPath;
    }

    public static getHeroBgPath(rarity: string): string {
        const config = this.getHeroBackgroundConfig(rarity);
        return config.bgPath;
    }

    public static getHeroBackgroundColor(rarity: string): string | null {
        const config = this.getHeroBackgroundConfig(rarity);
        return config.backgroundColor || null;
    }

    public static getHeroBorderColor(rarity: string): string | null {
        const config = this.getHeroBackgroundConfig(rarity);
        return config.borderColor || null;
    }

    public static isHeroGlowEnabled(rarity: string): boolean {
        const config = this.getHeroBackgroundConfig(rarity);
        return config.enableGlow;
    }

    public static getHeroGlowColor(rarity: string): string | null {
        const config = this.getHeroBackgroundConfig(rarity);
        return config.glowColor || config.backgroundColor || null;
    }

    public static hasBackgroundColor(rarity: string): boolean {
        const config = this.getHeroBackgroundConfig(rarity);
        return !!config.backgroundColor;
    }

    public static hasBorderColor(rarity: string): boolean {
        const config = this.getHeroBackgroundConfig(rarity);
        return !!config.borderColor;
    }
}

export interface IProgressBarStyle {
    backgroundColor: Color;
    progressColor: Color;
    borderColor: Color;
    borderWidth: number;
    cornerRadius: number;
    height: number;
    showGlow: boolean;
    glowColor: Color;
    glowIntensity: number;
}

export class ProgressBarStyleManager {
    private static readonly DEFAULT_STYLE: IProgressBarStyle = {
        backgroundColor: new Color(50, 50, 50, 255),
        progressColor: new Color(0, 255, 0, 255),
        borderColor: new Color(100, 100, 100, 255),
        borderWidth: 2,
        cornerRadius: 5,
        height: 20,
        showGlow: false,
        glowColor: new Color(0, 255, 0, 255),
        glowIntensity: 0.5
    };

    public static getDefaultStyle(): IProgressBarStyle {
        return { ...this.DEFAULT_STYLE };
    }

    public static getStyleByRarity(rarity: string): IProgressBarStyle {
        const baseStyle = this.getDefaultStyle();

        switch (rarity) {
            case 'common':
                return {
                    ...baseStyle,
                    progressColor: new Color(150, 150, 150, 255),
                    glowColor: new Color(150, 150, 150, 255)
                };
            case 'rare':
                return {
                    ...baseStyle,
                    progressColor: new Color(0, 150, 255, 255),
                    glowColor: new Color(0, 150, 255, 255),
                    showGlow: true
                };
            case 'epic':
                return {
                    ...baseStyle,
                    progressColor: new Color(150, 0, 255, 255),
                    glowColor: new Color(150, 0, 255, 255),
                    showGlow: true
                };
            case 'legendary':
                return {
                    ...baseStyle,
                    progressColor: new Color(255, 215, 0, 255),
                    glowColor: new Color(255, 215, 0, 255),
                    showGlow: true,
                    glowIntensity: 0.8
                };
            default:
                return baseStyle;
        }
    }

    public static getCustomStyle(
        backgroundColor: Color,
        progressColor: Color,
        borderColor?: Color,
        showGlow: boolean = false,
        glowColor?: Color
    ): IProgressBarStyle {
        return {
            backgroundColor,
            progressColor,
            borderColor: borderColor || new Color(100, 100, 100, 255),
            borderWidth: 2,
            cornerRadius: 5,
            height: 20,
            showGlow,
            glowColor: glowColor || progressColor,
            glowIntensity: 0.5
        };
    }
}
