import { EDM } from '../data/env/ConfigManager';

/**
 * 导航栏测试脚本
 */
export class NavigationTest {
    
    /**
     * 测试语言切换
     */
    public static testLanguageSwitch(): void {
        console.log('=== 导航栏语言切换测试 ===');
        
        // 确保EDM已初始化
        EDM.initLanguage();
        
        // 测试中文
        EDM.setLanguage('zh');
        console.log('当前语言:', EDM.currentLanguage);
        console.log('home.menu.home ->', EDM.getText('home.menu.home'));
        console.log('home.menu.store ->', EDM.getText('home.menu.store'));
        console.log('home.menu.bag ->', EDM.getText('home.menu.bag'));
        console.log('home.menu.hero ->', EDM.getText('home.menu.hero'));
        
        // 测试英文
        EDM.setLanguage('en');
        console.log('当前语言:', EDM.currentLanguage);
        console.log('home.menu.home ->', EDM.getText('home.menu.home'));
        console.log('home.menu.store ->', EDM.getText('home.menu.store'));
        console.log('home.menu.bag ->', EDM.getText('home.menu.bag'));
        console.log('home.menu.hero ->', EDM.getText('home.menu.hero'));
        
        // 测试日文
        EDM.setLanguage('ja');
        console.log('当前语言:', EDM.currentLanguage);
        console.log('home.menu.home ->', EDM.getText('home.menu.home'));
        console.log('home.menu.store ->', EDM.getText('home.menu.store'));
        console.log('home.menu.bag ->', EDM.getText('home.menu.bag'));
        console.log('home.menu.hero ->', EDM.getText('home.menu.hero'));
        
        // 测试韩文
        EDM.setLanguage('ko');
        console.log('当前语言:', EDM.currentLanguage);
        console.log('home.menu.home ->', EDM.getText('home.menu.home'));
        console.log('home.menu.store ->', EDM.getText('home.menu.store'));
        console.log('home.menu.bag ->', EDM.getText('home.menu.bag'));
        console.log('home.menu.hero ->', EDM.getText('home.menu.hero'));
        
        console.log('=== 语言切换测试完成 ===');
    }
    
    /**
     * 测试ConfigManager
     */
    public static testConfigManager(): void {
        console.log('=== ConfigManager测试 ===');
        
        console.log('当前语言:', EDM.currentLanguage);
        console.log('支持的语言:', EDM.getSupportedLanguages());
        console.log('home.menu.home ->', EDM.getText('home.menu.home'));
        console.log('home.menu.store ->', EDM.getText('home.menu.store'));
        console.log('home.menu.bag ->', EDM.getText('home.menu.bag'));
        console.log('home.menu.hero ->', EDM.getText('home.menu.hero'));
        
        console.log('=== ConfigManager测试完成 ===');
    }
} 