export interface ModuleBoundary {
  readonly name: string;
  readonly targetStage: string;
  readonly implemented: boolean;
  readonly owns: readonly string[];
  readonly nonGoals: readonly string[];
}

export interface ModulePlaceholder<TBoundary extends ModuleBoundary = ModuleBoundary> {
  readonly boundary: TBoundary;
}

export function defineModuleBoundary(boundary: ModuleBoundary): ModuleBoundary {
  return boundary;
}
