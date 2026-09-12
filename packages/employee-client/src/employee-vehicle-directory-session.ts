import { operationalFailure } from "./employee-operational-recovery";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import type {
  EmployeeVehicleDirectoryOptions,
  EmployeeVehicleDirectorySnapshot,
} from "./employee-vehicle-directory-types";

export class EmployeeVehicleDirectorySession {
  private active: AbortController | null = null;
  private request = 0;
  private snapshot: EmployeeVehicleDirectorySnapshot = emptySnapshot();
  private readonly subscribers = new Set<
    (snapshot: EmployeeVehicleDirectorySnapshot) => void
  >();

  constructor(private readonly options: EmployeeVehicleDirectoryOptions) {}

  current() {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: EmployeeVehicleDirectorySnapshot) => void) {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  activate(identityGeneration: number, scope: EmployeeOperationalScope) {
    const sameAuthority =
      this.snapshot.identityGeneration === identityGeneration &&
      this.snapshot.scope?.membershipId === scope.membershipId &&
      this.snapshot.scope.organizationId === scope.organizationId &&
      this.snapshot.scope.locationId === scope.locationId &&
      this.snapshot.scope.shiftId === scope.shiftId &&
      this.snapshot.scope.role === scope.role;
    if (!sameAuthority) {
      this.clearRequest();
      this.publish(emptySnapshot(identityGeneration, scope));
    }
    return this.load(identityGeneration, scope);
  }

  refresh() {
    const { identityGeneration, scope } = this.snapshot;
    return identityGeneration === null || scope === null
      ? Promise.resolve()
      : this.load(identityGeneration, scope);
  }

  suspendForBackground() {
    this.clearRequest();
  }

  clear() {
    this.clearRequest();
    this.publish(emptySnapshot());
  }

  private async load(
    identityGeneration: number,
    scope: EmployeeOperationalScope,
  ) {
    this.clearRequest();
    const request = ++this.request;
    const held =
      this.snapshot.page?.locationId === scope.locationId
        ? this.snapshot.page
        : null;
    this.publish({
      failure: null,
      identityGeneration,
      page: held,
      phase: held === null ? "loading" : "refreshing",
      scope,
    });
    const active = new AbortController();
    this.active = active;
    try {
      const page = await this.options.transport.load(
        scope.locationId,
        active.signal,
      );
      if (!this.isCurrent(request, identityGeneration, scope, active)) return;
      if (page.locationId !== scope.locationId) {
        throw new Error("Vehicle directory responded for another location.");
      }
      this.publish({
        failure: null,
        identityGeneration,
        page,
        phase: "ready",
        scope,
      });
    } catch (error) {
      if (!this.isCurrent(request, identityGeneration, scope, active)) return;
      this.publish({
        failure: operationalFailure(error),
        identityGeneration,
        page: held,
        phase: "error",
        scope,
      });
    } finally {
      if (this.active === active) this.active = null;
    }
  }

  private isCurrent(
    request: number,
    generation: number,
    scope: EmployeeOperationalScope,
    active: AbortController,
  ) {
    return (
      !active.signal.aborted &&
      request === this.request &&
      this.snapshot.identityGeneration === generation &&
      this.snapshot.scope?.locationId === scope.locationId &&
      this.snapshot.scope.membershipId === scope.membershipId &&
      this.snapshot.scope.organizationId === scope.organizationId &&
      this.snapshot.scope.shiftId === scope.shiftId &&
      this.snapshot.scope.role === scope.role
    );
  }

  private clearRequest() {
    this.request += 1;
    this.active?.abort();
    this.active = null;
  }

  private publish(snapshot: EmployeeVehicleDirectorySnapshot) {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}

function emptySnapshot(
  identityGeneration: number | null = null,
  scope: EmployeeOperationalScope | null = null,
): EmployeeVehicleDirectorySnapshot {
  return {
    failure: null,
    identityGeneration,
    page: null,
    phase: scope === null ? "inactive" : "loading",
    scope,
  };
}
