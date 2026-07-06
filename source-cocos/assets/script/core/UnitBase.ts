import { Component } from "cc";
import { ISkill } from "db://assets/utils/skill";
import { IUnit } from "./IUnit";
import { UNIT_ATTR, UNIT_CAMP, UNIT_TYPE } from "../../utils/data/dict/base/UnitAttrList";

export abstract class UnitBase extends Component implements IUnit {
    id: number;
    unitName: string;
    desc: string;
    type: string;
    camp: string;
    attr: any;
    level: number;
    maxLevel: number;
    star: number;
    maxStar: number;
    hp: number;
    hpRecover?: number;
    hpRecoverSpeed?: number;
    detectRange: number;
    moveSpeed: number;
    defense: number;
    canMove: boolean;
    canAttack: boolean;
    canSkill: boolean;
    atk: number;
    attackRange: number;
    attackSpeed: number;
    attackCriticalStrike?: number;
    attackCriticalDamage?: number;
    skillDamageRange?: number;
    duration?: number;
    frequency?: number;
    pierce?: number;
    quantity?: number;
    repeat?: number;
    rare?: number;
    skills?: number[];
    unlockSkills?: number[];
    icon?: string;
    url?: string;
    path?: string;
    spriteConfig?: any;
    unlockCondition?: any;
    // [key: string]: any;

    init(data: IUnit) {
        this.id = data.id;
        this.unitName = data.name ?? '';
        this.desc = data.desc ?? '';
        this.type = data.type ?? UNIT_TYPE.MONSTER;
        this.camp = data.camp ?? UNIT_CAMP.HUMAN;
        this.attr = data.attr ?? UNIT_ATTR.DARK;
        this.level = Number(data.level ?? 1);
        this.maxLevel = Number(data.max_level ?? 2);
        this.star = Number(data.star ?? 1);
        this.maxStar = Number(data.max_star ?? 2);

        this.detectRange = Number(data.detect_range ?? data.detectRange ?? 50);
        this.moveSpeed = Number(data.move_speed ?? data.moveSpeed ?? 50);
        this.defense = Number(data.defense ?? 0);

        this.canMove = data.can_move ?? data.canMove ?? true;
        this.canAttack = data.can_attack ?? data.canAttack ?? true;
        this.canSkill = data.can_skill ?? data.canSkill ?? false;

        this.atk = Number(data.atk ?? 18);
        this.attackCriticalStrike = Number(data.atk_CD ?? data.attackCriticalStrike ?? 0.01);
        this.attackCriticalDamage = Number(data.atk_CRD ?? data.attackCriticalDamage ?? 2);
        this.attackRange = Number(data.atk_range ?? data.attackRange ?? 50);
        this.attackSpeed = Number(data.cooldown ?? data.attackSpeed ?? 1);
        this.skillDamageRange = Number(data.dmg_range ?? data.skillDamageRange ?? 0);
        this.duration = Number(data.duration ?? 0);
        this.frequency = Number(data.frequency ?? 1);
        this.pierce = Number(data.pierce ?? 0);
        this.quantity = Number(data.quantity ?? 0);
        this.repeat = Number(data.repeat ?? 0);
        this.rare = Number(data.rare ?? 1);

        this.hp = Number(data.hp ?? 50);
        this.hpRecover = Number(data.hp_recover ?? data.hpRecover ?? 1);
        this.hpRecoverSpeed = Number(data.hp_recover_speed ?? data.hpRecoverSpeed ?? 5);

        this.skills = data.skills ?? [];
        this.spriteConfig = data.sprite_config ?? data.spriteConfig ?? data.sprite ?? {};

        this.unlockSkills = data.unlockSkills ?? [];
        this.icon = data.icon ?? '';
        this.url = data.url ?? '';
        this.path = data.path ?? '';
        this.unlockCondition = data.unlockCondition ?? {};
        // console.log('[UnitBase][init] id', this.id, 'UnitBase', this, 'this.moveSpeed', this.moveSpeed, 'data', data);
    }

    getUnitById(id: number): IUnit {
        return this.getUnitById(id);
    }

    getSkillsById(id: number): ISkill[] {
        return this.getSkillsById(id);
    }

    getUnitByIdAndType(id: number, type: string): IUnit {
        return this.getUnitByIdAndType(id, type);
    }

    getUnitByIdAndCamp(id: number, camp: string): IUnit {
        return this.getUnitByIdAndCamp(id, camp);
    }

    getUnitByIdAndAttr(id: number, attr: any): IUnit {
        return this.getUnitByIdAndAttr(id, attr);
    }
}

export const defaultSkillSpriteConfig = {
    "blow": {
        "scale": [2, 2, 2],
        "width": 96,
        "height": 16,
        "item_width": 16,
        "item_height": 16
    },
    "release": {
        "scale": [2, 2, 2],
        "width": 96,
        "height": 16,
        "item_width": 16,
        "item_height": 16
    }
}