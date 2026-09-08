interface ClearableWorkflow {
  clear(): void;
}

export interface NativeShiftRetirementTargets {
  readonly checkIn: ClearableWorkflow;
  readonly confirmParking: ClearableWorkflow;
  readonly handoff: ClearableWorkflow;
  readonly operations: ClearableWorkflow;
  readonly parking: ClearableWorkflow;
  readonly release: ClearableWorkflow;
  readonly retrieval: ClearableWorkflow;
  readonly shiftStart: ClearableWorkflow;
}

/** Retires every authority-bound workflow only after strict End Shift success. */
export function retireNativeShiftScope(
  targets: NativeShiftRetirementTargets,
): void {
  targets.operations.clear();
  targets.confirmParking.clear();
  targets.handoff.clear();
  targets.parking.clear();
  targets.release.clear();
  targets.retrieval.clear();
  targets.shiftStart.clear();
  targets.checkIn.clear();
}
