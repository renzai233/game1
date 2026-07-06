import { instantiate, Prefab } from 'cc';
import { UnitDataLoader } from './UnitDataLoader';
import { UnitController } from './prefab/UnitController';
import { PetController } from './prefab/PetController';
import { HeroController } from './prefab/HeroController';
import { MonsterController } from './prefab/MonsterController';
import { DemonController } from './prefab/DemonController';
import { UNIT_TYPE } from '../../utils/data/dict/base/UnitAttrList';


export class UnitFactory {
    static async createUnit(unitId: number, unitType: string, unitPrefab?: Prefab, skillEffectPrefab?: Prefab, isStand: boolean = false): Promise<any | null> {
        const data = await UnitDataLoader.loadUnitData(unitId, unitType);
        if (!data || data === null) return null;
        const unitNode = instantiate(unitPrefab);
        let unitClass = this.getUnitClass(unitType);
        // 获取单位控制器
        let unitCtrl = unitNode.getComponent(unitClass);
        // 如果单位控制器不存在，则添加单位控制器
        if (!unitCtrl) unitCtrl = unitNode.addComponent(unitClass);
        if (skillEffectPrefab) unitCtrl.skillEffectPrefab = skillEffectPrefab;
        // console.log('[UnitFactory][createUnit]', unitCtrl, unitNode, unitId, unitType, data);
        // 初始化单位控制器
        unitCtrl.init(data, isStand);
        if (!unitNode) return null;
        // 不显示单位名称
        const nameLabel = unitNode.getChildByName('Label');
        nameLabel.active = false;
        return unitNode;
    }

    static getUnitClass(unitType: string) {
        switch (unitType) {
            case UNIT_TYPE.PET: return PetController;
            case UNIT_TYPE.HERO: return HeroController;
            case UNIT_TYPE.MONSTER: return MonsterController;
            case UNIT_TYPE.DEMON: return DemonController;
            default: return UnitController;
        }
    }
} 