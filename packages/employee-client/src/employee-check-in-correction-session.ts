import {
  applyDetailsCorrection,
  applyIdentityCorrection,
  authoritativeMatchesCorrection,
  continuationForSession,
  detailsCorrectionIntent,
  identityCorrectionIntent,
  isCheckInVehicleVersionConflict,
} from "./employee-check-in-continuation";
import { hydrateCheckInSession } from "./employee-check-in-discovery";
import { EmployeeCheckInSessionCore } from "./employee-check-in-session-core";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInContinuationMode,
  EmployeeCheckInCorrectionIntent,
} from "./employee-check-in-types";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";

interface CorrectionAttempt {
  readonly identityGeneration: number;
  readonly intent: EmployeeCheckInCorrectionIntent;
  readonly locationId: string;
  readonly request: number;
  readonly sessionId: string;
  readonly vehicleId: string;
  readonly workflowOwner: string;
}

export abstract class EmployeeCheckInCorrectionSession extends EmployeeCheckInSessionCore {
  async submitVehicleDetails(): Promise<void> {
    const active = this.mutableActive();
    if (active === null || this.snapshot.continuation.mode !== "edit-details")
      return;
    const validation = detailsCorrectionIntent(
      this.snapshot.continuation.detailsDraft,
      active.vehicle.vehicleUpdatedAt,
    );
    if (validation.error !== undefined || validation.value === undefined) {
      this.fail(
        validation.error ?? {
          code: "VEHICLE_DETAILS_INVALID",
          message: "Vehicle details are invalid.",
        },
      );
      return;
    }
    await this.runCorrection(validation.value, "edit-details", active);
  }

  async submitIdentityCorrection(): Promise<void> {
    const active = this.mutableActive();
    const mode = this.snapshot.continuation.mode;
    const draft = this.snapshot.continuation.identityDraft;
    if (
      active === null ||
      (draft.mode === "CONFIRMED_PLATE"
        ? mode !== "confirm-identity"
        : mode !== "edit-identity")
    )
      return;
    const validation = identityCorrectionIntent(
      draft,
      active.vehicle.vehicleUpdatedAt,
      mode === "confirm-identity",
    );
    if (validation.error !== undefined || validation.value === undefined) {
      this.fail(
        validation.error ?? {
          code: "VEHICLE_IDENTITY_INVALID",
          message: "Vehicle identity is invalid.",
        },
      );
      return;
    }
    await this.runCorrection(validation.value, mode, active);
  }

  retryCorrectionRecovery(): Promise<void> {
    const intent = this.snapshot.continuation.pendingIntent;
    if (
      this.mutableActive() === null ||
      intent === null ||
      this.snapshot.continuation.mode !== "ambiguous"
    )
      return Promise.resolve();
    return this.reconcileCorrection(this.createAttempt(intent), false);
  }

  protected abstract mutableActive(): EmployeeCheckInAuthoritativeSession | null;

  private async runCorrection(
    intent: EmployeeCheckInCorrectionIntent,
    editMode: EmployeeCheckInContinuationMode,
    active: EmployeeCheckInAuthoritativeSession,
  ): Promise<void> {
    const attempt = this.createAttempt(intent);
    this.publish({
      ...this.snapshot,
      continuation: {
        ...this.snapshot.continuation,
        mode: "submitting",
        pendingIntent: intent,
      },
      error: null,
    });
    try {
      if (intent.kind === "DETAILS") {
        const response = await this.options.transport.correctDetails(
          attempt.sessionId,
          intent.request,
        );
        if (!this.attemptIsCurrent(attempt)) return;
        this.requireMatchingResponse(attempt, response);
        this.publishCorrectionSuccess(
          applyDetailsCorrection(active, response),
          response.mutationKind === "NO_CHANGE"
            ? "DETAILS_NO_CHANGE"
            : "DETAILS_UPDATED",
        );
      } else {
        const response = await this.options.transport.correctIdentity(
          attempt.sessionId,
          intent.request,
        );
        if (!this.attemptIsCurrent(attempt)) return;
        this.requireMatchingResponse(attempt, response);
        this.publishCorrectionSuccess(
          applyIdentityCorrection(active, response),
          "IDENTITY_UPDATED",
        );
      }
    } catch (error) {
      await this.handleCorrectionFailure(attempt, error, editMode);
    }
  }

  private createAttempt(
    intent: EmployeeCheckInCorrectionIntent,
  ): CorrectionAttempt {
    const active = this.snapshot.active;
    if (
      active === null ||
      this.snapshot.identityGeneration === null ||
      this.snapshot.locationId === null ||
      this.workflowOwner === null
    )
      throw new Error("Authoritative check-in context is unavailable.");
    return {
      identityGeneration: this.snapshot.identityGeneration,
      intent,
      locationId: this.snapshot.locationId,
      request: ++this.sequence,
      sessionId: active.sessionId,
      vehicleId: active.vehicle.vehicleId,
      workflowOwner: this.workflowOwner,
    };
  }

  private attemptIsCurrent(attempt: CorrectionAttempt): boolean {
    const active = this.snapshot.active;
    return (
      this.isCurrent(attempt.request) &&
      this.snapshot.identityGeneration === attempt.identityGeneration &&
      this.snapshot.locationId === attempt.locationId &&
      this.workflowOwner === attempt.workflowOwner &&
      active?.sessionId === attempt.sessionId &&
      active.vehicle.vehicleId === attempt.vehicleId &&
      active.vehicle.vehicleUpdatedAt ===
        attempt.intent.request.expectedVehicleUpdatedAt
    );
  }

  private requireMatchingResponse(
    attempt: CorrectionAttempt,
    response: { readonly valetSessionId: string; readonly vehicleId: string },
  ): void {
    if (
      response.valetSessionId !== attempt.sessionId ||
      response.vehicleId !== attempt.vehicleId
    )
      throw new Error("Correction response did not match the active vehicle.");
  }

  private publishCorrectionSuccess(
    active: EmployeeCheckInAuthoritativeSession,
    lastMutationKind:
      | "DETAILS_NO_CHANGE"
      | "DETAILS_UPDATED"
      | "IDENTITY_UPDATED"
      | "RECONCILED",
  ): void {
    this.publish({
      ...this.snapshot,
      active,
      continuation: { ...continuationForSession(active), lastMutationKind },
      error: null,
    });
  }

  private async handleCorrectionFailure(
    attempt: CorrectionAttempt,
    error: unknown,
    editMode: EmployeeCheckInContinuationMode,
  ): Promise<void> {
    if (!this.attemptIsCurrent(attempt)) return;
    if (isAmbiguousMutationFailure(error)) {
      await this.reconcileCorrection(attempt, false);
    } else if (isCheckInVehicleVersionConflict(error)) {
      await this.reconcileCorrection(attempt, true, error);
    } else {
      this.publish({
        ...this.snapshot,
        continuation: {
          ...this.snapshot.continuation,
          mode: editMode,
          pendingIntent: null,
        },
        error: operationalFailure(error),
      });
    }
  }

  private async reconcileCorrection(
    attempt: CorrectionAttempt,
    conflict: boolean,
    originalError?: unknown,
  ): Promise<void> {
    if (!this.attemptIsCurrent(attempt)) return;
    this.publish({
      ...this.snapshot,
      continuation: {
        ...this.snapshot.continuation,
        mode: "reconciling",
        pendingIntent: attempt.intent,
      },
      error: null,
    });
    try {
      const current = await hydrateCheckInSession(
        this.options.transport,
        attempt.locationId,
        attempt.sessionId,
      );
      if (!this.isCurrent(attempt.request)) return;
      if (current.vehicle.vehicleId !== attempt.vehicleId) return;
      if (current.state !== "CHECKING_IN") {
        this.publish({
          ...this.snapshot,
          active: current,
          continuation: continuationForSession(current),
          error: originalError ? operationalFailure(originalError) : null,
          phase: "continuation",
        });
      } else if (
        !conflict &&
        authoritativeMatchesCorrection(current, attempt.intent)
      ) {
        this.publishCorrectionSuccess(current, "RECONCILED");
      } else {
        this.publish({
          ...this.snapshot,
          active: current,
          continuation: continuationForSession(current, "conflict"),
          error:
            originalError === undefined
              ? {
                  code: "VEHICLE_CORRECTION_CONFLICT",
                  message:
                    "The vehicle changed on the server. Review the current values.",
                }
              : operationalFailure(originalError),
        });
      }
    } catch (error) {
      if (!this.isCurrent(attempt.request)) return;
      this.publish({
        ...this.snapshot,
        continuation: {
          ...this.snapshot.continuation,
          mode: "ambiguous",
          pendingIntent: attempt.intent,
        },
        error: operationalFailure(error),
      });
    }
  }
}
