import { suspendedStartAttempt } from "./employee-shift-presence-parent-fence";
import {
  emptyShiftStartSnapshot,
  failedStartSnapshot,
  resolveShiftStartPresentation,
  pendingStartResolution,
  shiftStartAuthorities,
  suspendedShiftStartSnapshot,
} from "./employee-shift-start-presentation";
import {
  startPresenceTarget,
  matchesStartPresenceTarget,
} from "./employee-shift-presence-target";
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

  get presence() {
    return this.options.presence;
  }

  ownsPresenceTarget(
    target: import("./employee-shift-presence-types").PresenceTarget,
  ): boolean {
    return (
      this.snapshot.selectedLocationId === target.locationId &&
      matchesStartPresenceTarget(
        this.authorities.get(target.locationId),
        target,
      )
    );
  }

  resumePresenceRecovery(
    authority: EmployeeShiftStartAuthority,
    restore: () => void = () => undefined,
  ): Promise<void> {
    this.selectedAuthorityKey = employeeShiftStartAuthorityKey(authority);
    this.publish({
      ...this.snapshot,
      selectedLocationId: authority.location.locationId,
      phase: "uncertain",
    });
    restore();
    return this.send(authority);
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
    this.authorities = shiftStartAuthorities(
      context,
      this.options.presence !== undefined,
    );

    if (this.pending !== undefined) {
      this.reconcilePending(context);
      return;
    }
    this.publishContext(context);
  }

  selectLocation(locationId: string): void {
    if (this.options.presence?.snapshot().phase === "uncertain") return;
    if (!["conflict", "denied", "error", "ready"].includes(this.snapshot.phase))
      return;
    const authority = this.authorities.get(locationId);
    if (authority === undefined) return;
    if (
      locationId !== this.snapshot.selectedLocationId &&
      this.options.presence?.descriptor() !== undefined
    )
      this.options.presence?.clear();
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
    if (this.options.presence?.snapshot().phase === "uncertain")
      return this.retry();
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
      this.options.presence?.clear();
      this.clearPending();
      this.publishContext(this.context);
      return Promise.resolve();
    }
    return this.send(attempt);
  }

  dismissUncertain(): void {
    if (this.snapshot.phase !== "uncertain") return;
    if (this.options.presence !== undefined) return;
    this.clearPending();
    this.publishContext(this.context);
  }

  suspendForBackground(): void {
    this.options.presence?.suspend();
    const pending = suspendedStartAttempt(
      this.options.presence,
      this.pending,
      this.authorities,
      this.snapshot.phase,
    );
    if (pending === undefined) return;
    this.pending = pending;
    this.activeSend = undefined;
    this.publish(suspendedShiftStartSnapshot(this.snapshot));
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
      if (this.options.presence === undefined)
        await this.options.transport.startShift(attempt.location.locationId);
      else await this.options.presence.run(startPresenceTarget(attempt));
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
      this.publish(failedStartSnapshot(this.snapshot, error));
    }
  }

  private reconcilePending(context: EmployeeShiftStartContext): void {
    const attempt = this.pending!;
    const resolution = pendingStartResolution(
      context,
      this.authorities.get(attempt.location.locationId),
      attempt,
      this.options.presence === undefined ||
        this.options.presence.snapshot().phase === "confirmed",
      this.options.presence !== undefined,
    );
    if (resolution === "confirmed") {
      this.clearPending();
      this.publish({
        ...emptyShiftStartSnapshot(),
        identityGeneration: this.snapshot.identityGeneration,
        phase: "active",
      });
      return;
    }
    if (resolution === "retired") {
      this.options.presence?.clear();
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
    const presentation = resolveShiftStartPresentation(
      this.snapshot.identityGeneration,
      context,
      this.authorities,
      this.snapshot.selectedLocationId,
      this.selectedAuthorityKey,
    );
    this.selectedAuthorityKey = presentation.key;
    this.publish(presentation.snapshot);
  }
  private clearPending(): void {
    this.pending = undefined;
    this.activeSend = undefined;
  }

  private reset(identityGeneration: number | null): void {
    this.options.presence?.clear(this.snapshot.identityGeneration !== null);
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
