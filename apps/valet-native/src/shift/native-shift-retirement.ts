interface ClearableWorkflow {
  clear(): void;
}

interface ShiftStartWorkflow extends ClearableWorkflow {
  activate(identityGeneration: number): void;
}

interface OperationalWorkflow extends ClearableWorkflow {
  activate(identityGeneration: number): Promise<void>;
}

export interface NativeShiftRetirementTargets {
  readonly checkIn: ClearableWorkflow;
  readonly confirmParking: ClearableWorkflow;
  readonly guestAccess: ClearableWorkflow;
  readonly handoff: ClearableWorkflow;
  readonly operations: OperationalWorkflow;
  readonly parking: ClearableWorkflow;
  readonly release: ClearableWorkflow;
  readonly retrieval: ClearableWorkflow;
  readonly shiftStart: ShiftStartWorkflow;
  readonly vehicleDirectory: ClearableWorkflow;
}

/** Retires every authority-bound workflow only after strict End Shift success. */
export function retireNativeShiftScope(
  targets: NativeShiftRetirementTargets,
  identityGeneration: number,
): void {
  targets.operations.clear();
  targets.confirmParking.clear();
  targets.guestAccess.clear();
  targets.handoff.clear();
  targets.parking.clear();
  targets.release.clear();
  targets.retrieval.clear();
  targets.shiftStart.clear();
  targets.shiftStart.activate(identityGeneration);
  targets.checkIn.clear();
  targets.vehicleDirectory.clear();
  void targets.operations.activate(identityGeneration);
}
