import {
  EmployeeRevalidationCoordinator,
  isSameEmployeeOperationalScope,
  shouldAttemptEmployeeConnectivityRecovery,
  type EmployeeConnectivityStatus,
  type EmployeeOperationalScope,
  type EmployeeRevalidationBatch,
} from "@valet/employee-client";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { retireNativeWorkflowScope } from "./native-workflow-scope-retirement";
import {
  deriveProductionShellState,
  productionShellStateRetiresOperationalAuthority,
} from "./production-shell-controller";

interface ConfirmedOperationalAuthority {
  readonly generation: number;
  readonly scope: EmployeeOperationalScope;
}

export class NativeProductionLifecycleOwner {
  private connectivity: EmployeeConnectivityStatus;
  private confirmedAuthority: ConfirmedOperationalAuthority | undefined;
  private disposed = false;
  private foreground = false;
  private operationsForeground = false;
  private readonly revalidation: EmployeeRevalidationCoordinator;

  constructor(private readonly runtime: NativeEmployeeRuntime) {
    this.connectivity = runtime.connectivity.current();
    this.revalidation = new EmployeeRevalidationCoordinator((batch) =>
      this.revalidate(batch),
    );
    this.applyConnectivity(this.connectivity, false);
  }

  setAppActive(active: boolean): void {
    if (this.disposed || this.foreground === active) return;
    this.foreground = active;
    this.revalidation.setForeground(active);
    if (!active) {
      this.operationsForeground = false;
      void this.runtime.operations.setForeground(false);
      this.runtime.shiftStart.suspendForBackground();
      this.runtime.shiftEnd.suspendForBackground();
      this.runtime.checkIn.suspendForBackground();
      this.runtime.release.suspendForBackground();
      this.runtime.handoff.suspendForBackground();
      this.runtime.confirmParking.suspendForBackground();
      this.runtime.parking.suspendForBackground();
      this.runtime.retrieval.suspendForBackground();
      this.runtime.guestAccess.suspendForBackground();
      this.runtime.incident.suspendForBackground();
      this.runtime.vehicleDirectory.suspendForBackground();
    }
  }

  setConnectivity(status: EmployeeConnectivityStatus): void {
    if (this.disposed || status === this.connectivity) return;
    const recovered = shouldAttemptEmployeeConnectivityRecovery(
      this.connectivity,
      status,
    );
    this.connectivity = status;
    this.applyConnectivity(status, recovered);
  }

  requestPushAttention(): void {
    this.revalidation.request("push-attention");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.revalidation.dispose();
    void this.runtime.operations.setForeground(false);
  }

  whenIdle(): Promise<void> {
    return this.revalidation.whenIdle();
  }

  private applyConnectivity(
    status: EmployeeConnectivityStatus,
    recovered: boolean,
  ): void {
    this.runtime.shiftEnd.setOnline(status !== "offline");
    if (status === "offline") {
      this.operationsForeground = false;
      void this.runtime.operations.setForeground(false);
    }
    if (recovered) this.revalidation.request("network-recovery");
  }

  private async revalidate(batch: EmployeeRevalidationBatch): Promise<void> {
    if (this.disposed || !this.foreground || this.connectivity === "offline") {
      return;
    }
    let auth = this.runtime.auth.current();
    if (
      auth.phase === "restoration-unavailable" &&
      batch.reasons.has("network-recovery")
    ) {
      await this.runtime.auth.refresh();
      auth = this.runtime.auth.current();
    }
    if (!this.canContinue(auth.authGeneration)) return;
    if (auth.phase !== "authenticated") return;
    const generation = auth.authGeneration;
    this.rememberReadyAuthority(generation);
    if (this.operationsForeground) {
      await this.runtime.operations.refresh();
    } else {
      this.operationsForeground = true;
      await this.runtime.operations.setForeground(true);
    }
    if (!this.canContinue(generation)) return;
    const current = this.runtime.operations.current();
    const shellState = deriveProductionShellState(auth, current);
    if (productionShellStateRetiresOperationalAuthority(shellState)) {
      this.confirmedAuthority = undefined;
      retireNativeWorkflowScope(this.runtime);
      return;
    }
    if (shellState.kind !== "active") return;
    const previous = this.confirmedAuthority;
    const authorityChanged =
      previous !== undefined &&
      (previous.generation !== generation ||
        !isSameEmployeeOperationalScope(previous.scope, shellState.scope));
    this.confirmedAuthority = { generation, scope: shellState.scope };
    if (authorityChanged) {
      retireNativeWorkflowScope(this.runtime);
      return;
    }
    if (this.canContinue(generation)) await this.revalidateActiveWorkflow();
  }

  private rememberReadyAuthority(generation: number): void {
    if (this.confirmedAuthority !== undefined) return;
    const current = this.runtime.operations.current();
    if (
      current.identityGeneration === generation &&
      current.phase === "ready" &&
      current.scope !== null
    ) {
      this.confirmedAuthority = { generation, scope: current.scope };
    }
  }

  private async revalidateActiveWorkflow(): Promise<void> {
    const runtime = this.runtime;
    if (runtime.incident.current().target !== null) {
      await runtime.incident.revalidate();
    } else if (runtime.guestAccess.current().target !== null) {
      await runtime.guestAccess.revalidate();
    } else if (runtime.release.current().phase !== "inactive") {
      await runtime.release.checkServerState();
    } else if (runtime.handoff.current().phase !== "inactive") {
      await runtime.handoff.checkServerState();
    } else if (runtime.confirmParking.current().phase !== "inactive") {
      await runtime.confirmParking.checkServerState();
    } else if (runtime.parking.current().phase !== "inactive") {
      await runtime.parking.checkServerState();
    } else if (runtime.retrieval.current().phase !== "inactive") {
      await runtime.retrieval.checkServerState();
    } else if (runtime.vehicleDirectory.current().phase !== "inactive") {
      await runtime.vehicleDirectory.refresh();
    }
  }

  private canContinue(generation: number): boolean {
    const auth = this.runtime.auth.current();
    return (
      !this.disposed &&
      this.foreground &&
      this.connectivity !== "offline" &&
      auth.phase === "authenticated" &&
      auth.authGeneration === generation
    );
  }
}
