import {
  EmployeeRevalidationCoordinator,
  isSameEmployeeOperationalScope,
  type EmployeeConnectivityStatus,
  type EmployeeRevalidationBatch,
} from "@valet/employee-client";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { retireNativeWorkflowScope } from "./native-workflow-scope-retirement";

export class NativeProductionLifecycleOwner {
  private connectivity: EmployeeConnectivityStatus;
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
    const recovered = this.connectivity !== "online" && status === "online";
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
    if (auth.phase !== "authenticated") return;
    const generation = auth.authGeneration;
    const previousScope = this.runtime.operations.current().scope;
    if (this.operationsForeground) {
      await this.runtime.operations.refresh();
    } else {
      this.operationsForeground = true;
      await this.runtime.operations.setForeground(true);
    }
    if (!this.isCurrent(generation)) return;
    const current = this.runtime.operations.current();
    if (
      current.phase !== "ready" ||
      current.scope === null ||
      (previousScope !== null &&
        !isSameEmployeeOperationalScope(previousScope, current.scope))
    ) {
      if (previousScope !== null) retireNativeWorkflowScope(this.runtime);
      return;
    }
    await this.revalidateActiveWorkflow();
  }

  private async revalidateActiveWorkflow(): Promise<void> {
    const runtime = this.runtime;
    if (runtime.release.current().phase !== "inactive") {
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
    } else if (runtime.guestAccess.current().target !== null) {
      await runtime.guestAccess.revalidate();
    }
  }

  private isCurrent(generation: number): boolean {
    const auth = this.runtime.auth.current();
    return auth.phase === "authenticated" && auth.authGeneration === generation;
  }
}
