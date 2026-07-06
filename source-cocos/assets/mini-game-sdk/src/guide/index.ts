import {
  defineModuleBoundary,
  type ModuleBoundary,
  type ModulePlaceholder,
} from "../core/module-boundary";

export const GUIDE_MODULE_BOUNDARY: ModuleBoundary = defineModuleBoundary({
  name: "guide",
  targetStage: "Stage 5",
  implemented: false,
  owns: [
    "Guide state machine boundary",
    "Guide condition registration boundary",
    "Guide event boundary",
  ],
  nonGoals: [
    "No guide state machine implementation in Stage 0",
    "No mask, pointer, Cocos node, or visual adapter implementation",
    "No scene binding implementation",
  ],
});

export interface GuideServicePlaceholder
  extends ModulePlaceholder<typeof GUIDE_MODULE_BOUNDARY> {}
