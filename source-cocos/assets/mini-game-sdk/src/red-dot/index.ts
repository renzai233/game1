import {
  defineModuleBoundary,
  type ModuleBoundary,
  type ModulePlaceholder,
} from "../core/module-boundary";

export const RED_DOT_MODULE_BOUNDARY: ModuleBoundary = defineModuleBoundary({
  name: "red-dot",
  targetStage: "Stage 5",
  implemented: false,
  owns: [
    "Red-dot tree boundary",
    "Synchronous evaluator boundary",
    "Subscription and invalidation boundary",
  ],
  nonGoals: [
    "No red-dot tree implementation in Stage 0",
    "No async data fetching orchestration",
    "No UI node ownership",
  ],
});

export interface RedDotServicePlaceholder
  extends ModulePlaceholder<typeof RED_DOT_MODULE_BOUNDARY> {}
