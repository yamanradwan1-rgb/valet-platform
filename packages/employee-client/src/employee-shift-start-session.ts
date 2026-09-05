import { EmployeeApiError } from "./api-error";
import {
  employeeShiftStartAuthorityKey,
  isSameEmployeeShiftStartAuthority,
  resolveEmployeeShiftStartContext,
  type EmployeeShiftStartAuthority,
  type EmployeeShiftStartContext,
} from "./employee-shift-start-context";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";
import type {
  EmployeeShiftStartSessionOptions,
  EmployeeShiftStartSnapshot,
} from "./employee-shift-start-types";
import type { StaffOperationalContextResponse } from "@valet/contracts";

function emptyShiftStartSnapshot(): EmployeeShiftStartSnapshot {
  return {
    failure: null,
    identityGeneration: null,
    phase: "inactive",
    selectedLocationId: null,
    startableLocations: [],
    targetLocationId: null,
  };
}

export class EmployeeShiftStartSession {
  private activeSend: Promise<void> | undefined;
  private authorities = new Map<string, EmployeeShiftStartAuthority>();
  private context: EmployeeShiftStartContext = { active: [], startable: [] };
  private pending: EmployeeShiftStartAuthority | undefined;
  private selectedAuthorityKey: string | null = null;
  private snapshot = emptyShiftStartSnapshot();
  private readonly subscribers = new Set<
    (snapshot: EmployeeShiftStartSnapshot) => void
  >();

  constructor(private readonly options: EmployeeShiftStartSessionOptions) {}

  current(): EmployeeShiftStartSnapshot {
    return this.snapshot;
  }

  subscribe(
    listener: (snapshot: EmployeeShiftStartSnapshot) => void,
  ): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  activate(identityGeneration: number): void {
    if (this.snapshot.identityGeneration === identityGeneration) return;
    this.reset(identityGeneration);
  }

  clear(): void {
    this.reset(null);
  }

  observeOperationalContext(
    identityGeneration: number,
    response: StaffOperationalContextResponse,
  ): void {
    if (identityGeneration !== this.snapshot.identityGeneration) return;
    const context = resolveEmployeeShiftStartContext(
      identityGeneration,
      response,
    );
    this.context = context;
    this.authorities = new Map(
      context.startable.map((authority) => [
        authority.location.locationId,
        authority,
      ]),
    );

    if (this.pending !== undefined) {
      this.reconcilePending(context);
      return;
    }
    this.publishContext(context);
  }

  selectLocation(locationId: string): void {
    if (!["conflict", "denied", "error", "ready"].includes(this.snapshot.phase))
      return;
    const authority = this.authorities.get(locationId);
    if (authority === undefined) return;
    this.selectedAuthorityKey = employeeShiftStartAuthorityKey(authority);
    this.publish({
      ...this.snapshot,
      failure: null,
      phase: "ready",
      selectedLocationId: locationId,
      targetLocationId: null,
    });
  }

  start(): Promise<void> {
    if (this.activeSend !== undefined) return this.activeSend;
    if (!["conflict", "denied", "error", "ready"].includes(this.snapshot.phase))
      return Promise.resolve();
    const locationId = this.snapshot.selectedLocationId;
    const authority =
      locationId === null ? undefined : this.authorities.get(locationId);
    if (
      authority === undefined ||
      employeeShiftStartAuthorityKey(authority) !== this.selectedAuthorityKey
    ) {
      return Promise.resolve();
    }
    return this.send(authority);
  }

  retry(): Promise<void> {
    if (this.activeSend !== undefined) return this.activeSend;
    const attempt = this.pending;
    if (this.snapshot.phase !== "uncertain" || attempt === undefined) {
      return Promise.resolve();
    }
    const current = this.authorities.get(attempt.location.locationId);
    if (
      current === undefined ||
      !isSameEmployeeShiftStartAuthority(current, attempt)
    ) {
      this.clearPending();
      this.publishContext(this.context);
      return Promise.resolve();
    }
    return this.send(attempt);
  }

  dismissUncertain(): void {
    if (this.snapshot.phase !== "uncertain") return;
    this.clearPending();
    this.publishContext(this.context);
  }

  private send(attempt: EmployeeShiftStartAuthority): Promise<void> {
    this.pending = attempt;
    this.publish({
      ...this.snapshot,
      failure: null,
      phase: "submitting",
      targetLocationId: attempt.location.locationId,
    });
    const operation = this.execute(attempt).finally(() => {
      if (this.activeSend === operation) this.activeSend = undefined;
    });
    this.activeSend = operation;
    return operation;
  }

  private async execute(attempt: EmployeeShiftStartAuthority): Promise<void> {
    try {
      await this.options.transport.startShift(attempt.location.locationId);
      if (this.pending !== attempt) return;
      this.publish({ ...this.snapshot, phase: "verifying" });
      await this.options.refreshOperationalContext();
    } catch (error) {
      if (this.pending !== attempt) return;
      const failure = operationalFailure(error);
      if (isAmbiguousMutationFailure(error)) {
        this.publish({ ...this.snapshot, failure, phase: "uncertain" });
        return;
      }
      this.pending = undefined;
      this.publish({
        ...this.snapshot,
        failure,
        phase:
          error instanceof EmployeeApiError &&
          error.code === "ACTIVE_SHIFT_CONFLICT"
            ? "conflict"
            : error instanceof EmployeeApiError &&
                [401, 403, 404].includes(error.status)
              ? "denied"
              : "error",
        targetLocationId: null,
      });
    }
  }

  private reconcilePending(context: EmployeeShiftStartContext): void {
    const attempt = this.pending!;
    const active = context.active.length === 1 ? context.active[0] : undefined;
    if (
      active !== undefined &&
      active.location.locationId === attempt.location.locationId &&
      isSameEmployeeShiftStartAuthority(active, attempt)
    ) {
      this.clearPending();
      this.publish({
        ...emptyShiftStartSnapshot(),
        identityGeneration: this.snapshot.identityGeneration,
        phase: "active",
      });
      return;
    }
    const current = this.authorities.get(attempt.location.locationId);
    if (
      current === undefined ||
      !isSameEmployeeShiftStartAuthority(current, attempt)
    ) {
      this.clearPending();
      this.publishContext(context);
      return;
    }
    this.publish({
      ...this.snapshot,
      startableLocations: context.startable.map(({ location }) => location),
    });
  }

  private publishContext(context: EmployeeShiftStartContext): void {
    if (context.active.length > 0) {
      this.selectedAuthorityKey = null;
      this.publish({
        ...emptyShiftStartSnapshot(),
        identityGeneration: this.snapshot.identityGeneration,
        phase: context.active.length === 1 ? "active" : "inactive",
      });
      return;
    }
    const previousSelection = this.snapshot.selectedLocationId;
    const previousKey = this.selectedAuthorityKey;
    const retained =
      previousSelection === null
        ? undefined
        : this.authorities.get(previousSelection);
    const selected =
      retained !== undefined &&
      employeeShiftStartAuthorityKey(retained) === previousKey
        ? retained
        : context.startable.length === 1
          ? context.startable[0]
          : undefined;
    this.selectedAuthorityKey = selected
      ? employeeShiftStartAuthorityKey(selected)
      : null;
    this.publish({
      failure: null,
      identityGeneration: this.snapshot.identityGeneration,
      phase: "ready",
      selectedLocationId: selected?.location.locationId ?? null,
      startableLocations: context.startable.map(({ location }) => location),
      targetLocationId: null,
    });
  }

  private clearPending(): void {
    this.pending = undefined;
    this.activeSend = undefined;
  }

  private reset(identityGeneration: number | null): void {
    this.authorities.clear();
    this.context = { active: [], startable: [] };
    this.clearPending();
    this.selectedAuthorityKey = null;
    this.publish({ ...emptyShiftStartSnapshot(), identityGeneration });
  }

  private publish(snapshot: EmployeeShiftStartSnapshot): void {
    this.snapshot = snapshot;
    this.options.onStateChange?.(snapshot);
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}
