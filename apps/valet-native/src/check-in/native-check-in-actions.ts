import {
  isSameEmployeeOperationalScope,
  type EmployeeCheckInSession,
  type EmployeeCancelCheckInSession,
  type EmployeeVehicleDirectorySession,
  type EmployeeOperationalScope,
  type EmployeeOperationalSession,
  type NativeAuthSession,
} from "@valet/employee-client";
import { nativeCheckInWorkflowOwner } from "./native-check-in-ownership";

/** Small Vehicles origin and full-authority fence, shared by UI and lifecycle. */
export class NativeCheckInActions {
  private revision = 0;
  private loading = false;
  private foreground = true;
  private origin: {
    generation: number;
    scope: EmployeeOperationalScope;
  } | null = null;
  constructor(
    readonly cancelSession: EmployeeCancelCheckInSession,
    private readonly checkIn: EmployeeCheckInSession,
    private readonly directory: EmployeeVehicleDirectorySession,
    private readonly auth: NativeAuthSession,
    private readonly operations: EmployeeOperationalSession,
    private readonly isOnline: () => boolean,
  ) {}

  async continue(sessionId: string): Promise<boolean> {
    const owner = this.owner();
    if (
      !owner ||
      this.loading ||
      [
        "preparing",
        "confirm",
        "submitting",
        "unknown",
        "reconciling",
        "retry-available",
      ].includes(this.cancelSession.current().phase)
    )
      return false;
    const revision = ++this.revision;
    this.loading = true;
    this.origin = null;
    try {
      const prepared = await this.checkIn.openExistingCheckIn(
        owner.generation,
        owner.scope.locationId,
        nativeCheckInWorkflowOwner(owner.scope),
        sessionId,
      );
      if (!prepared || revision !== this.revision || !this.sameOwner(owner))
        return false;
      this.origin = owner;
      return true;
    } finally {
      if (revision === this.revision) this.loading = false;
    }
  }
  async prepareCancel(sessionId: string) {
    const owner = this.owner();
    if (!owner || this.loading) return;
    this.cancelSession.bind(owner.generation, owner.scope);
    await this.cancelSession.prepare(sessionId);
  }
  confirmCancel() {
    const owner = this.owner();
    if (owner) {
      this.cancelSession.bind(owner.generation, owner.scope);
      return this.cancelSession.confirm();
    }
    return Promise.resolve();
  }
  returnDestination(): "vehicles" | "tasks" {
    const origin = this.origin;
    this.origin = null;
    if (origin && this.sameOwner(origin)) {
      void this.directory.refresh();
      return "vehicles";
    }
    return "tasks";
  }
  clear() {
    this.revision += 1;
    this.loading = false;
    this.origin = null;
    this.cancelSession.clear();
  }
  suspendForBackground() {
    this.foreground = false;
    this.revision += 1;
    this.loading = false;
    this.cancelSession.suspendForBackground();
  }
  async reconcile() {
    this.foreground = true;
    const owner = this.owner();
    if (!owner) return false;
    this.cancelSession.bind(owner.generation, owner.scope);
    const pending = this.cancelSession.current().phase === "unknown";
    await this.cancelSession.reconcile();
    return pending && this.cancelSession.current().phase === "cancelled";
  }
  private owner() {
    const auth = this.auth.current();
    const current = this.operations.current();
    return this.foreground &&
      auth.phase === "authenticated" &&
      current.phase === "ready" &&
      current.identityGeneration === auth.authGeneration &&
      current.scope &&
      this.isOnline()
      ? { generation: auth.authGeneration, scope: { ...current.scope } }
      : null;
  }
  private sameOwner(owner: {
    generation: number;
    scope: EmployeeOperationalScope;
  }) {
    const current = this.owner();
    return (
      current?.generation === owner.generation &&
      current.scope.role === owner.scope.role &&
      isSameEmployeeOperationalScope(current.scope, owner.scope)
    );
  }
}
