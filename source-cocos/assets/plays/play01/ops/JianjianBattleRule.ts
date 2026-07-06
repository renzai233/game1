import { Node } from "cc";
import { HeroController } from "db://assets/script/core/prefab/HeroController";
import { ISkill } from "db://assets/utils/skill";

// OPS_JIANJIAN_2026_05: single shutdown switch for the temporary hero-7 operation rule.
export const JIANJIAN_OPS_RULE_ENABLED = true;

const JIANJIAN_HERO_ID = 7;
const JIANJIAN_SKILL_ID = 1007;

const FLEE_RATE = 0.34;
const NO_ATTACK_RATE = 0.2;
// const POTENTIAL_RATE = 0.1;
const POTENTIAL_RATE = 0.46;

const FLEE_WINDOW_SECONDS = 10;
const POTENTIAL_DURATION_SECONDS = 10;
const POTENTIAL_QUANTITY = 16;
const POTENTIAL_REPEAT = 6;
const WALL_TRIGGER_RATIO = 0.5;

type JianjianBranch = "none" | "flee" | "no_attack" | "potential";

interface JianjianRuleHost {
  removeJianjianOpsHeroFromField(heroId: number): void;
}

interface ActivePotentialBoost {
  skill: ISkill;
  skillId: number;
  originalQuantity: number;
  originalRepeat: number;
  remainingSeconds: number;
}

interface SkillEffectDelta {
  id?: number;
  skill_id?: number;
  skillId?: number;
  quantity?: number;
  repeat?: number;
}

export class JianjianBattleRule {
  private readonly _host: JianjianRuleHost;
  private readonly _rng: () => number;
  private readonly _excludedHeroIds = new Set<number>();
  private readonly _enteredHeroIds = new Set<number>();

  private _branch: JianjianBranch = "none";
  private _heroNode: Node | null = null;
  private _fleeRemainingSeconds: number | null = null;
  private _fled = false;
  private _selectAllAdCompleted = false;
  private _lastWallHpRatio: number | null = null;
  private _potentialPending = false;
  private _potentialTriggered = false;
  private _activeBoost: ActivePotentialBoost | null = null;

  constructor(host: JianjianRuleHost, rng: () => number = Math.random) {
    this._host = host;
    this._rng = rng;
  }

  reset(): void {
    this.restorePotentialBoost();
    this._excludedHeroIds.clear();
    this._enteredHeroIds.clear();
    this._branch = "none";
    this._heroNode = null;
    this._fleeRemainingSeconds = null;
    this._fled = false;
    this._selectAllAdCompleted = false;
    this._lastWallHpRatio = null;
    this._potentialPending = false;
    this._potentialTriggered = false;
  }

  canOfferHero(heroId: number): boolean {
    if (!JIANJIAN_OPS_RULE_ENABLED) return true;

    return !this._excludedHeroIds.has(Number(heroId));
  }

  markSelectAllAdCompleted(): void {
    if (!JIANJIAN_OPS_RULE_ENABLED) return;

    this._selectAllAdCompleted = true;
  }

  onHeroVisible(heroId: number, heroNode: Node): void {
    if (!JIANJIAN_OPS_RULE_ENABLED) return;
    if (Number(heroId) !== JIANJIAN_HERO_ID || this._fled) return;
    if (this._enteredHeroIds.has(JIANJIAN_HERO_ID)) return;

    this._enteredHeroIds.add(JIANJIAN_HERO_ID);
    this._heroNode = heroNode;

    const roll = this._rng();
    if (roll < FLEE_RATE) {
      this._branch = "flee";
      this._fleeRemainingSeconds = this._rng() * FLEE_WINDOW_SECONDS;
      return;
    }

    if (roll < FLEE_RATE + NO_ATTACK_RATE) {
      this._branch = "no_attack";
      this.applyNoAttack(heroNode);
      return;
    }

    if (roll < FLEE_RATE + NO_ATTACK_RATE + POTENTIAL_RATE) {
      this._branch = "potential";
      return;
    }

    this._branch = "none";
  }

  onWallHpUpdated(currentHp: number, maxHp: number): void {
    if (!JIANJIAN_OPS_RULE_ENABLED) return;
    if (maxHp <= 0) return;

    const ratio = currentHp / maxHp;
    const previousRatio = this._lastWallHpRatio ?? 1;
    const crossedTrigger =
      previousRatio > WALL_TRIGGER_RATIO && ratio <= WALL_TRIGGER_RATIO;

    if (
      crossedTrigger &&
      this._branch === "potential" &&
      this._selectAllAdCompleted &&
      !this._potentialTriggered &&
      !this._fled
    ) {
      this._potentialPending = true;
    }

    this._lastWallHpRatio = ratio;
  }

  onSkillEffectApplied(heroId: number, effectData: SkillEffectDelta): void {
    if (!JIANJIAN_OPS_RULE_ENABLED) return;

    if (
      Number(heroId) !== JIANJIAN_HERO_ID ||
      !this._activeBoost ||
      !effectData
    )
      return;

    const effectSkillId = Number(
      effectData.skill_id ?? effectData.skillId ?? effectData.id,
    );
    if (effectSkillId !== this._activeBoost.skillId) return;

    this._activeBoost.originalQuantity += Number(effectData.quantity || 0);
    this._activeBoost.originalRepeat += Number(effectData.repeat || 0);
    this.applyPotentialValues(this._activeBoost.skill);
  }

  tick(deltaSeconds: number): void {
    if (!JIANJIAN_OPS_RULE_ENABLED) return;
    if (deltaSeconds <= 0) return;

    if (this._fleeRemainingSeconds !== null) {
      this._fleeRemainingSeconds -= deltaSeconds;
      if (this._fleeRemainingSeconds <= 0) {
        this.flee();
      }
    }

    if (this._potentialPending) {
      this.tryStartPotentialBoost();
    }

    if (this._activeBoost) {
      this._activeBoost.remainingSeconds -= deltaSeconds;
      if (this._activeBoost.remainingSeconds <= 0) {
        this.restorePotentialBoost();
      }
    }
  }

  dispose(): void {
    this.restorePotentialBoost();
  }

  private applyNoAttack(heroNode: Node): void {
    const heroCtrl = heroNode.getComponent(HeroController);
    if (!heroCtrl) return;

    heroCtrl.canAttack = false;
    heroCtrl.canSkill = false;
  }

  private flee(): void {
    if (this._fled) return;

    this._fled = true;
    this._fleeRemainingSeconds = null;
    this._potentialPending = false;
    this._excludedHeroIds.add(JIANJIAN_HERO_ID);
    this.restorePotentialBoost();
    this._host.removeJianjianOpsHeroFromField(JIANJIAN_HERO_ID);
  }

  private tryStartPotentialBoost(): void {
    if (
      this._branch !== "potential" ||
      this._potentialTriggered ||
      this._activeBoost ||
      this._fled ||
      !this._heroNode ||
      !this._heroNode.isValid
    ) {
      return;
    }

    const heroCtrl = this._heroNode.getComponent(HeroController);
    if (!heroCtrl || !Array.isArray(heroCtrl.hadSkills)) return;

    const skill = heroCtrl.hadSkills.find(
      (item) => Number(item.skillId ?? item.id) === JIANJIAN_SKILL_ID,
    );
    if (!skill) return;

    this._activeBoost = {
      skill,
      skillId: Number(skill.skillId ?? skill.id),
      originalQuantity: Number(skill.quantity || 0),
      originalRepeat: Number(skill.repeat || 0),
      remainingSeconds: POTENTIAL_DURATION_SECONDS,
    };
    this._potentialPending = false;
    this._potentialTriggered = true;
    this.applyPotentialValues(skill);
  }

  private applyPotentialValues(skill: ISkill): void {
    skill.quantity = POTENTIAL_QUANTITY;
    skill.repeat = POTENTIAL_REPEAT;
  }

  private restorePotentialBoost(): void {
    if (!this._activeBoost) return;

    const boost = this._activeBoost;
    boost.skill.quantity = boost.originalQuantity;
    boost.skill.repeat = boost.originalRepeat;
    this._activeBoost = null;
  }
}
