import type { IntakeRequest } from "@valet/contracts";

import { createdCheckInSession } from "./employee-check-in-domain";
import { continuationForSession } from "./employee-check-in-continuation";
import {
  hydrateCheckInSession,
  loadCheckInRecoverables,
} from "./employee-check-in-discovery";
import {
  runEmployeeCheckInIntake,
  type EmployeeCheckInIntakeOutcome,
} from "./employee-check-in-intake";
import { emptyEmployeeCheckInSnapshot } from "./employee-check-in-state";
import type {
  EmployeeCheckInRecoverable,
  EmployeeCheckInSessionOptions,
  EmployeeCheckInSnapshot,
} from "./employee-check-in-types";
import { operationalFailure } from "./employee-operational-recovery";

export class EmployeeCheckInSessionCore {
  protected pendingRequest: IntakeRequest | null = null;
  protected sequence = 0;
  protected snapshot = emptyEmployeeCheckInSnapshot();
  protected workflowOwner: string | null = null;
  private readonly subscribers = new Set<
    (snapshot: EmployeeCheckInSnapshot) => void
  >();

  constructor(protected readonly options: EmployeeCheckInSessionOptions) {}

  current(): EmployeeCheckInSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: EmployeeCheckInSnapshot) => void): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  activate(
    identityGeneration: number,
    locationId: string,
    workflowOwner = locationId,
  ): Promise<void> {
    if (
      this.snapshot.phase !== "inactive" &&
      this.snapshot.identityGeneration === identityGeneration &&
      this.snapshot.locationId === locationId &&
      this.workflowOwner === workflowOwner
    ) {
      return Promise.resolve();
    }
    this.invalidate(identityGeneration, locationId, workflowOwner);
    return this.discover(false);
  }

  clear(): void {
    this.sequence += 1;
    this.pendingRequest = null;
    this.workflowOwner = null;
    this.publish(emptyEmployeeCheckInSnapshot());
  }

  startNew(): void {
    const { identityGeneration, locationId } = this.snapshot;
    if (identityGeneration === null || locationId === null) return;
    this.pendingRequest = null;
    this.publish({
      ...emptyEmployeeCheckInSnapshot(),
      identityGeneration,
      locationId,
      phase: "capture",
    });
  }

  retryIntake(): Promise<void> {
    if (
      this.snapshot.phase !== "intake-ambiguous" ||
      !this.snapshot.recoveryChecked ||
      this.pendingRequest === null
    ) {
      return Promise.resolve();
    }
    return this.retryPending(this.pendingRequest);
  }

  recoverAmbiguous(): Promise<void> {
    if (this.snapshot.phase !== "intake-ambiguous") return Promise.resolve();
    return this.discover(true);
  }

  resume(recoverable: EmployeeCheckInRecoverable): Promise<void> {
    return this.hydrate(recoverable.value.sessionId);
  }

  retryDiscovery(): Promise<void> {
    if (this.snapshot.phase !== "discovery-error") return Promise.resolve();
    return this.discover(false);
  }

  protected applyIntakeOutcome(outcome: EmployeeCheckInIntakeOutcome): void {
    if (outcome.kind === "SUCCESS") {
      const active = createdCheckInSession(
        outcome.result,
        this.snapshot.vehicle,
      );
      this.pendingRequest = null;
      this.publish({
        ...this.snapshot,
        active,
        continuation: {
          ...continuationForSession(active, "select-condition"),
          conditionSelection: "No visible issue",
        },
        error: null,
        phase: "created",
        recoverables: [],
      });
      return;
    }
    if (outcome.kind === "AMBIGUOUS") {
      this.publish({
        ...this.snapshot,
        error: outcome.failure,
        phase: "intake-ambiguous",
        recoveryChecked: false,
      });
      return;
    }
    const stale = outcome.failure.code === "RETURNING_CUSTOMER_INTENT_INVALID";
    this.pendingRequest = null;
    this.publish({
      ...this.snapshot,
      error: outcome.failure,
      phase: "customer",
      recognizedVehicle:
        stale && this.snapshot.recognizedVehicle
          ? { ...this.snapshot.recognizedVehicle, returningCustomer: null }
          : this.snapshot.recognizedVehicle,
    });
  }

  protected fail(error: { readonly code: string; readonly message: string }) {
    this.publish({ ...this.snapshot, error });
  }

  protected isCurrent(request: number): boolean {
    return request === this.sequence;
  }

  protected publishRecognitionFailure(error: unknown): void {
    this.publish({
      ...this.snapshot,
      error: operationalFailure(error),
      phase: "confirm",
    });
  }

  protected publish(snapshot: EmployeeCheckInSnapshot): void {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }

  protected requiredLocation(): string {
    if (this.snapshot.locationId === null)
      throw new Error("Check-in location is unavailable.");
    return this.snapshot.locationId;
  }

  private async retryPending(input: IntakeRequest): Promise<void> {
    const request = ++this.sequence;
    this.publish({ ...this.snapshot, error: null, phase: "submitting" });
    const outcome = await runEmployeeCheckInIntake(
      this.options.transport,
      input,
    );
    if (this.isCurrent(request)) this.applyIntakeOutcome(outcome);
  }

  private async discover(ambiguousRecovery: boolean): Promise<void> {
    const request = ++this.sequence;
    const locationId = this.requiredLocation();
    this.publish({
      ...this.snapshot,
      error: null,
      phase: ambiguousRecovery ? "intake-ambiguous" : "discovering",
    });
    try {
      const recoverables = await loadCheckInRecoverables(
        this.options.transport,
        locationId,
      );
      if (!this.isCurrent(request)) return;
      if (recoverables.length === 1 && recoverables[0] !== undefined) {
        await this.hydrate(recoverables[0].value.sessionId);
      } else if (recoverables.length > 1) {
        this.publish({ ...this.snapshot, phase: "recoverables", recoverables });
      } else if (ambiguousRecovery) {
        this.publish({
          ...this.snapshot,
          phase: "intake-ambiguous",
          recoveryChecked: true,
        });
      } else {
        this.startNew();
      }
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.publish({
        ...this.snapshot,
        error: operationalFailure(error),
        phase: ambiguousRecovery ? "intake-ambiguous" : "discovery-error",
      });
    }
  }

  private async hydrate(sessionId: string): Promise<void> {
    const request = ++this.sequence;
    this.publish({ ...this.snapshot, error: null, phase: "discovering" });
    try {
      const active = await hydrateCheckInSession(
        this.options.transport,
        this.requiredLocation(),
        sessionId,
      );
      if (!this.isCurrent(request)) return;
      this.pendingRequest = null;
      const checkingIn = active.state === "CHECKING_IN";
      this.publish({
        ...this.snapshot,
        active,
        continuation: checkingIn
          ? {
              ...continuationForSession(active, "select-condition"),
              conditionSelection: "No visible issue",
            }
          : continuationForSession(active),
        error: null,
        phase: checkingIn ? "created" : "continuation",
        recoverables: [],
      });
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.publish({
        ...this.snapshot,
        error: operationalFailure(error),
        phase: "discovery-error",
      });
    }
  }

  private invalidate(
    identityGeneration: number,
    locationId: string,
    workflowOwner: string,
  ): void {
    this.sequence += 1;
    this.pendingRequest = null;
    this.workflowOwner = workflowOwner;
    this.publish({
      ...emptyEmployeeCheckInSnapshot(),
      identityGeneration,
      locationId,
      phase: "discovering",
    });
  }
}
