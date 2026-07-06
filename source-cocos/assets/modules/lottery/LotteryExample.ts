import { LCM } from './LotteryConfigManager';
import { LTM } from './LotteryManager';
import { LotteryType } from './LotteryTypes';
import { ItemRarity } from '../material/ItemTypes';

export class LotteryExample {
    static async runBasicExample(): Promise<void> {
        console.log('=== 抽奖系统基础示例 ===\n');

        await LCM.initialize();

        console.log('1. 单抽示例：');
        const singleResult = LTM.draw('hero_fragment_lottery', false);
        if (singleResult.success) {
            console.log(`   抽奖成功！消耗 ${singleResult.totalCost.quantity} 宝石`);
            console.log('   获得奖励：');
            singleResult.draws.forEach((draw, index) => {
                console.log(`   ${index + 1}. ${draw.item.name} x${draw.quantity} (${draw.rarity})`);
            });
            console.log(`   当前保底计数: ${singleResult.pityCounter}\n`);
        }

        console.log('2. 十连抽示例：');
        const multiResult = LTM.draw('hero_fragment_lottery', true);
        if (multiResult.success) {
            console.log(`   连抽成功！消耗 ${multiResult.totalCost.quantity} 宝石`);
            console.log('   获得奖励：');
            multiResult.draws.forEach((draw, index) => {
                const guaranteed = draw.isGuaranteed ? ' [保底]' : '';
                console.log(`   ${index + 1}. ${draw.item.name} x${draw.quantity} (${draw.rarity})${guaranteed}`);
            });
            console.log(`   当前保底计数: ${multiResult.pityCounter}\n`);
        }
    }

    static async runCustomConfigExample(): Promise<void> {
        console.log('=== 自定义抽奖配置示例 ===\n');

        const customPool = {
            poolId: 'example_pool',
            name: '示例奖励池',
            rewards: [
                {
                    configId: 4001,
                    minQuantity: 1,
                    maxQuantity: 5,
                    weight: 60,
                    rarity: ItemRarity.COMMON
                },
                {
                    configId: 4002,
                    minQuantity: 1,
                    maxQuantity: 3,
                    weight: 30,
                    rarity: ItemRarity.RARE
                },
                {
                    configId: 4003,
                    minQuantity: 1,
                    maxQuantity: 1,
                    weight: 10,
                    rarity: ItemRarity.EPIC
                }
            ],
            totalWeight: 100
        };

        const customConfig = LCM.createCustomLotteryConfig({
            id: 'example_lottery',
            name: '示例抽奖',
            type: LotteryType.HERO_FRAGMENT,
            description: '消耗100金币进行抽奖',
            icon: 'textures/ui/popup/fragment/spriteFrame',
            singleDrawCost: {
                itemId: 200,
                quantity: 100
            },
            multiDrawCost: {
                itemId: 200,
                quantity: 900
            },
            multiDrawCount: 10,
            multiDrawDiscount: 0.1,
            pools: [customPool],
            maxDailyDraws: 20,
            guaranteeMechanic: {
                pityCount: 10,
                guaranteedRewardConfigId: 4003,
                guaranteedRewardQuantity: 1
            }
        });

        if (customConfig) {
            LCM.registerConfig(customConfig);
            console.log('自定义配置已注册\n');

            console.log('执行自定义抽奖：');
            const result = LTM.draw('example_lottery', false);
            if (result.success) {
                console.log(`消耗 ${result.totalCost.quantity} 金币`);
                result.draws.forEach(draw => {
                    console.log(`获得 ${draw.item.name} x${draw.quantity} (${draw.rarity})`);
                });
            }
        }
    }

    static async runStatisticsExample(): Promise<void> {
        console.log('=== 抽奖统计示例 ===\n');

        await LCM.initialize();

        console.log('执行20次抽奖...');
        for (let i = 0; i < 20; i++) {
            LTM.draw('hero_fragment_lottery', false);
        }

        const stats = LTM.getStatistics('hero_fragment_lottery');
        if (stats) {
            console.log('\n统计结果：');
            console.log(`总抽奖次数: ${stats.totalDraws}`);
            console.log(`总消耗: ${stats.totalCost.quantity} 宝石`);
            console.log('\n按稀有度统计：');
            stats.rewardsByRarity.forEach((count, rarity) => {
                console.log(`  ${rarity}: ${count} 个`);
            });
            console.log('\n按物品统计：');
            stats.rewardsByItemId.forEach((count, itemId) => {
                console.log(`  物品ID ${itemId}: ${count} 个`);
            });
        }
    }

    static async runCheckExample(): Promise<void> {
        console.log('=== 抽奖条件检查示例 ===\n');

        await LCM.initialize();

        const check = LTM.canDraw('hero_fragment_lottery', false);
        if (check.canDraw) {
            console.log('可以抽奖');
        } else {
            console.log(`无法抽奖: ${check.reason}`);
        }

        const multiCheck = LTM.canDraw('hero_fragment_lottery', true);
        if (multiCheck.canDraw) {
            console.log('可以连抽');
        } else {
            console.log(`无法连抽: ${multiCheck.reason}`);
        }
    }
}

export async function runAllExamples(): Promise<void> {
    await LotteryExample.runBasicExample();
    console.log('\n' + '='.repeat(50) + '\n');
    await LotteryExample.runCustomConfigExample();
    console.log('\n' + '='.repeat(50) + '\n');
    await LotteryExample.runStatisticsExample();
    console.log('\n' + '='.repeat(50) + '\n');
    await LotteryExample.runCheckExample();
}
