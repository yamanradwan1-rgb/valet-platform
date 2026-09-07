import {
  continuationForSession,
  identityCorrectionIntent,
} from "./employee-check-in-continuation";
import { EmployeeCheckInConditionSession } from "./employee-check-in-condition-session";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInConditionSelection,
  EmployeeCheckInVehicleDraft,
} from "./employee-check-in-types";

export class EmployeeCheckInContinuationSession extends EmployeeCheckInConditionSession {
  editVehicleDetails(): void {
    const active = this.mutableActive();
    if (active === null) return;
    this.publish({
      ...this.snapshot,
      continuation: continuationForSession(active, "edit-details"),
      error: null,
    });
  }

  setVehicleDetails(
    patch: Partial<{
      readonly color: string;
      readonly make: string;
      readonly model: string;
    }>,
  ): void {
    if (this.snapshot.continuation.mode !== "edit-details") return;
    this.publish({
      ...this.snapshot,
      continuation: {
        ...this.snapshot.continuation,
        detailsDraft: { ...this.snapshot.continuation.detailsDraft, ...patch },
      },
      error: null,
    });
  }

  editVehicleIdentity(): void {
    const active = this.mutableActive();
    if (active === null) return;
    this.publish({
      ...this.snapshot,
      continuation: continuationForSession(active, "edit-identity"),
      error: null,
    });
  }

  setVehicleIdentity(patch: Partial<EmployeeCheckInVehicleDraft>): void {
    if (this.snapshot.continuation.mode !== "edit-identity") return;
    this.publish({
      ...this.snapshot,
      continuation: {
        ...this.snapshot.continuation,
        identityDraft: {
          ...this.snapshot.continuation.identityDraft,
          ...patch,
        },
      },
      error: null,
    });
  }

  reviewVehicleIdentity(): void {
    const active = this.mutableActive();
    if (
      active === null ||
      this.snapshot.continuation.mode !== "edit-identity"
    ) {
      return;
    }
    const draft = this.snapshot.continuation.identityDraft;
    if (draft.mode === "TEMPORARY_DESCRIPTOR") {
      void this.submitIdentityCorrection();
      return;
    }
    const validation = identityCorrectionIntent(
      draft,
      active.vehicle.vehicleUpdatedAt,
      true,
    );
    if (validation.error !== undefined) {
      this.fail(validation.error);
      return;
    }
    const identity =
      validation.value?.kind === "IDENTITY"
        ? validation.value.request.identity
        : undefined;
    this.publish({
      ...this.snapshot,
      continuation: {
        ...this.snapshot.continuation,
        identityDraft:
          identity?.mode === "CONFIRMED_PLATE"
            ? {
                ...draft,
                plateCountry: identity.plateCountry,
                plateNumberRaw: identity.plateNumberRaw,
              }
            : draft,
        mode: "confirm-identity",
      },
      error: null,
    });
  }

  cancelVehicleEdit(): void {
    const active = this.snapshot.active;
    if (active === null || this.continuationBusy()) return;
    this.sequence += 1;
    this.publish({
      ...this.snapshot,
      continuation: continuationForSession(active),
      error: null,
    });
  }

  continueVehicleIntake(): void {
    const active = this.mutableActive();
    if (active === null || this.continuationBusy()) return;
    this.publish({
      ...this.snapshot,
      continuation: {
        ...continuationForSession(active),
        // Employee Web parity: "No visible issue" is the pre-selected
        // low-friction default on the condition step.
        conditionSelection:
          active.conditionCompletedAt === null
            ? ("No visible issue" as EmployeeCheckInConditionSelection)
            : null,
        mode: "select-condition",
      },
      error: null,
    });
  }

  setConditionSelection(selection: EmployeeCheckInConditionSelection): void {
    if (
      this.mutableActive() === null ||
      this.snapshot.continuation.mode !== "select-condition" ||
      this.snapshot.continuation.conditionSelection === selection
    ) {
      return;
    }
    this.publish({
      ...this.snapshot,
      continuation: {
        ...this.snapshot.continuation,
        conditionSelection: selection,
      },
      error: null,
    });
  }

  protected mutableActive(): EmployeeCheckInAuthoritativeSession | null {
    const active = this.snapshot.active;
    return this.snapshot.phase === "created" && active?.state === "CHECKING_IN"
      ? active
      : null;
  }
}
