import {
  defineModuleBoundary,
  type ModuleBoundary,
  type ModulePlaceholder,
} from "../core/module-boundary";

export const COCOS_MODULE_BOUNDARY: ModuleBoundary = defineModuleBoundary({
  name: "cocos",
  targetStage: "Stage 2+",
  implemented: false,
  owns: [
    "Cocos storage adapter boundary",
    "Cocos lifecycle adapter boundary",
    "Optional scheduler adapter boundary",
    "Cocos audio backend boundary for SDK audio runtime",
  ],
  nonGoals: [
    "No Cocos adapter implementation in Stage 0",
    "No UI prefab or scene node binding",
    "No project-specific resource references",
  ],
});

export interface CocosIntegrationPlaceholder
  extends ModulePlaceholder<typeof COCOS_MODULE_BOUNDARY> {}

export * from "./audio";
