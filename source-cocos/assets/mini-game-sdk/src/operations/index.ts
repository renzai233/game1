import {
  defineModuleBoundary,
  type ModuleBoundary,
  type ModulePlaceholder,
} from "../core/module-boundary";

export const OPERATIONS_MODULE_BOUNDARY: ModuleBoundary = defineModuleBoundary({
  name: "operations",
  targetStage: "Stage 4",
  implemented: false,
  owns: [
    "Weekly sign-in logic boundary",
    "Daily gift logic boundary",
    "Daily shop logic boundary",
  ],
  nonGoals: [
    "No operation state machine implementation in Stage 0",
    "No commerce claim integration in Stage 0",
    "No UI, sorting, or activity presentation implementation",
  ],
});

export interface OperationsServicePlaceholder
  extends ModulePlaceholder<typeof OPERATIONS_MODULE_BOUNDARY> {}
