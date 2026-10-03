import { parkingSpotValidationResponseSchema } from "@valet/contracts";
import { EmployeeApiError } from "./api-error";
import { operationalFailure } from "./employee-operational-recovery";
import {
  classifyConfirmParkedFailure,
  isActiveParkingCanonical,
  targetMatches,
  type EmployeeConfirmParkedTarget,
} from "./employee-confirm-parked-state";
import type {
  EmployeeConfirmParkedSnapshot,
  EmployeeConfirmParkedTransport,
} from "./employee-confirm-parked-types";

interface Owner {
  current(): EmployeeConfirmParkedSnapshot;
  target(): EmployeeConfirmParkedTarget | null;
  publish(snapshot: EmployeeConfirmParkedSnapshot): void;
  readonly transport: EmployeeConfirmParkedTransport;
}

/** Memory-only read coordinator. Revisions fence A -> B -> A and unabortable reads. */
export class EmployeeParkingSpotValidation {
  private revision = 0;
  private active: Promise<void> | undefined;

  constructor(private readonly owner: Owner) {}

  invalidate(): void {
    this.revision += 1;
    this.active = undefined;
  }

  continueToKeySlot(): Promise<void> {
    if (this.active !== undefined) return this.active;
    const snapshot = this.owner.current();
    const target = this.owner.target();
    if (
      target === null ||
      snapshot.phase !== "spot" ||
      snapshot.parkingSpotCandidate.trim() === "" ||
      snapshot.session === null ||
      !isActiveParkingCanonical(
        target,
        snapshot.task ?? undefined,
        snapshot.session,
      )
    ) {
      return Promise.resolve();
    }
    const revision = ++this.revision;
    const input = {
      taskId: target.taskId,
      expectedShiftId: target.shiftId,
      expectedSessionVersion: snapshot.session.version,
      expectedTaskVersion: snapshot.task!.version,
      parkingSpotCode: snapshot.parkingSpotCandidate.trim(),
      ...(snapshot.parkingSpotResourceId === null
        ? {}
        : { parkingSpotId: snapshot.parkingSpotResourceId }),
    };
    const isCurrent = () => {
      const current = this.owner.current();
      return (
        this.revision === revision &&
        this.owner.target() === target &&
        targetMatches(current, target) &&
        current.phase === "spot" &&
        current.session !== null &&
        isActiveParkingCanonical(
          target,
          current.task ?? undefined,
          current.session,
        ) &&
        current.session.version === input.expectedSessionVersion &&
        current.task!.version === input.expectedTaskVersion &&
        current.parkingSpotCandidate.trim() === input.parkingSpotCode &&
        current.parkingSpotResourceId === (input.parkingSpotId ?? null)
      );
    };
    this.owner.publish({
      ...snapshot,
      conflict: null,
      failure: null,
      parkingSpotValidation: null,
      parkingSpotValidationPending: true,
    });
    const operation = (async () => {
      try {
        const raw = await this.owner.transport.validateParkingSpot(
          target.sessionId,
          input,
        );
        if (!isCurrent()) return;
        const parsed = parkingSpotValidationResponseSchema.safeParse(raw);
        if (
          !parsed.success ||
          parsed.data.sessionId !== target.sessionId ||
          parsed.data.taskId !== target.taskId ||
          parsed.data.sessionVersion !== input.expectedSessionVersion ||
          parsed.data.taskVersion !== input.expectedTaskVersion ||
          parsed.data.parkingSpotCode !== input.parkingSpotCode ||
          (input.parkingSpotId !== undefined &&
            parsed.data.parkingSpotId !== input.parkingSpotId)
        ) {
          throw new EmployeeApiError({
            code: "PARKING_SPOT_VALIDATION_RESPONSE_INVALID",
            status: 502,
            message: "Parking Spot validation did not match the current work.",
          });
        }
        this.owner.publish({
          ...this.owner.current(),
          phase: "slot",
          parkingSpotValidation: parsed.data,
          parkingSpotValidationPending: false,
        });
      } catch (error) {
        if (!isCurrent()) return;
        const conflict = classifyConfirmParkedFailure(error);
        this.owner.publish({
          ...this.owner.current(),
          conflict,
          failure: operationalFailure(error),
          phase:
            conflict === "authority" || conflict === "stale"
              ? "unavailable"
              : "spot",
          parkingSpotValidation: null,
          parkingSpotValidationPending: false,
        });
      }
    })().finally(() => {
      if (this.active === operation) this.active = undefined;
    });
    this.active = operation;
    return operation;
  }
}
