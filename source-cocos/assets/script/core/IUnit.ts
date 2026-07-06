import { ISkill } from "../../utils/skill/ISkill";

/**
 * 单位数据接口
 */
export interface IUnit {
    id: number;
    name: string;
    desc?: string;
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
    url?: string;
    spriteConfig?: any;
    unlockCondition?: any;
    [key: string]: any;

    getUnitById(id: number): IUnit;
    getSkillsById(id: number): ISkill[];
    getUnitByIdAndType(id: number, type: string): IUnit;
    getUnitByIdAndCamp(id: number, camp: string): IUnit;
    getUnitByIdAndAttr(id: number, attr: any): IUnit;
}