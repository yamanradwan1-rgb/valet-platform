import {
  createEmployeeGpsIngestionTransport,
  type EmployeeConfirmParkedSession,
  type EmployeeGpsIngestionTransport,
  type EmployeeOperationalSession,
  type EmployeeRetrievalSession,
  type NativeAuthSession,
} from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import { createNativeEmployeeClient } from "../tasks/native-operational-http";
import { NativeTaskGpsPublisher } from "./native-task-gps-publisher";
import type { NativeTaskLocationPort } from "./native-task-location-adapter";
import {
  nativeTaskTrackingBinding,
  type NativeTaskTrackingBinding,
  type NativeTaskTrackingStatus,
} from "./native-task-tracking-types";

interface PauseFence {
  readonly key: string;
  readonly snapshotCount: number;
}

export interface NativeTaskTrackingRuntimeOptions {
  readonly auth: Pick<NativeAuthSession, "current" | "subscribe">;
  readonly createId: () => string;
  readonly location?: NativeTaskLocationPort | undefined;
  readonly now?: (() => number) | undefined;
  readonly operations: Pick<
    EmployeeOperationalSession,
    "current" | "refreshQueue" | "subscribe"
  >;
  readonly transport: EmployeeGpsIngestionTransport;
}

export class NativeTaskTrackingRuntime {
  private completionFence: PauseFence | undefined;
  private disposed = false;
  private foreground = false;
  private networkFence: PauseFence | undefined;
  private online = true;
  private readonly publisher: NativeTaskGpsPublisher;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly options: NativeTaskTrackingRuntimeOptions) {
    this.publisher = new NativeTaskGpsPublisher({
      createId: options.createId,
      isAuthorized: (binding) => this.authorityMatches(binding),
      location: options.location,
      now: options.now,
      onDefinitiveFailure: () => {
        void this.options.operations.refreshQueue();
      },
      onUnknown: (binding) => this.pauseFence(binding),
      transport: options.transport,
    });
    this.unsubscribers.push(
      options.operations.subscribe(() => this.reconcile()),
      options.auth.subscribe(() => this.reconcile()),
      nativeIdentityState.register(() => this.retire()),
    );
  }

  current(): NativeTaskTrackingStatus {
    return this.publisher.current();
  }

  subscribe(listener: (status: NativeTaskTrackingStatus) => void): () => void {
    return this.publisher.subscribe(listener);
  }

  bindMovementCompletion(
    confirmation: Pick<EmployeeConfirmParkedSession, "current" | "subscribe">,
    retrieval: Pick<EmployeeRetrievalSession, "current" | "subscribe">,
  ): void {
    let confirmPhase = confirmation.current().phase;
    let retrievalPhase = retrieval.current().phase;
    this.unsubscribers.push(
      confirmation.subscribe((snapshot) => {
        const previous = confirmPhase;
        confirmPhase = snapshot.phase;
        if (snapshot.phase === "submitting" && previous !== "submitting") {
          this.suspendForCompletion();
        } else if (previous === "submitting" && snapshot.phase !== "submitting") {
          void this.options.operations.refreshQueue();
        }
        if (snapshot.phase === "parked") this.retire();
      }),
      retrieval.subscribe((snapshot) => {
        const previous = retrievalPhase;
        retrievalPhase = snapshot.phase;
        if (
          snapshot.phase === "submitting-ready" &&
          previous !== "submitting-ready"
        ) {
          this.suspendForCompletion();
        } else if (
          previous === "submitting-ready" &&
          snapshot.phase !== "submitting-ready"
        ) {
          void this.options.operations.refreshQueue();
        } else if (
          previous === "submitting-start" &&
          snapshot.phase !== "submitting-start"
        ) {
          void this.options.operations.refreshQueue();
        }
        if (snapshot.phase === "ready") this.retire();
      }),
    );
  }

  setForeground(foreground: boolean): void {
    if (this.disposed || this.foreground === foreground) return;
    this.foreground = foreground;
    if (!foreground) this.retire();
    else this.reconcile();
  }

  setOnline(online: boolean): void {
    if (this.disposed || this.online === online) return;
    this.online = online;
    if (!online) this.pauseForNetwork({ kind: "offline" });
    else this.reconcile();
  }

  retry(): void {
    if (this.disposed || !this.foreground || !this.online) return;
    if (this.networkFence !== undefined || this.completionFence !== undefined) {
      void this.options.operations.refreshQueue();
      return;
    }
    this.reconcile(true);
  }

  openSettings(): Promise<void> {
    return this.publisher.openSettings();
  }

  clear(): void {
    if (!this.disposed) this.retire();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.publisher.dispose();
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }

  private reconcile(requestPermission = false): void {
    if (this.disposed || !this.foreground) return;
    const auth = this.options.auth.current();
    const snapshot = this.options.operations.current();
    if (
      auth.phase !== "authenticated" ||
      snapshot.phase !== "ready" ||
      snapshot.scope === null ||
      snapshot.identityGeneration !== auth.authGeneration
    ) {
      this.retire();
      return;
    }
    if (!this.online) {
      this.pauseForNetwork({ kind: "offline" });
      return;
    }
    if (snapshot.queueHardStopped) {
      this.retire();
      return;
    }
    if (snapshot.queueFailure !== null) {
      if (this.publisher.currentBindingKey() !== undefined) {
        this.pauseForNetwork({ kind: "unavailable" });
      }
      return;
    }
    const projection = snapshot.taskTracking;
    const candidate = nativeTaskTrackingBinding(snapshot);
    if (!this.resolveFence("network", candidate)) return;
    if (!this.resolveFence("completion", candidate)) return;
    if (projection?.status === "AMBIGUOUS") {
      this.publisher.retire({ kind: "ambiguous" });
      return;
    }
    if (candidate === null) {
      this.publisher.retire({ kind: "idle" });
      return;
    }
    this.publisher.start(candidate, requestPermission);
  }

  private resolveFence(
    kind: "network" | "completion",
    candidate: NativeTaskTrackingBinding | null,
  ): boolean {
    const fence = kind === "network" ? this.networkFence : this.completionFence;
    if (fence === undefined) return true;
    const snapshot = this.options.operations.current();
    if (snapshot.successfulQueueSnapshotCount <= fence.snapshotCount) return false;
    if (kind === "network") this.networkFence = undefined;
    else this.completionFence = undefined;
    if (candidate !== null && candidate.key === fence.key) return true;
    this.publisher.retire(
      snapshot.taskTracking?.status === "AMBIGUOUS"
        ? { kind: "ambiguous" }
        : { kind: "idle" },
    );
    return false;
  }

  private authorityMatches(binding: NativeTaskTrackingBinding): boolean {
    const auth = this.options.auth.current();
    return (
      !this.disposed &&
      this.foreground &&
      this.online &&
      auth.phase === "authenticated" &&
      auth.authGeneration === binding.identityGeneration &&
      nativeTaskTrackingBinding(this.options.operations.current())?.key === binding.key
    );
  }

  private pauseFence(binding: NativeTaskTrackingBinding): void {
    if (this.networkFence !== undefined) return;
    this.networkFence = {
      key: binding.key,
      snapshotCount:
        this.options.operations.current().successfulQueueSnapshotCount,
    };
  }

  private pauseForNetwork(status: NativeTaskTrackingStatus): void {
    const key = this.publisher.currentBindingKey();
    if (key !== undefined && this.networkFence === undefined) {
      this.networkFence = {
        key,
        snapshotCount:
          this.options.operations.current().successfulQueueSnapshotCount,
      };
    }
    this.publisher.pause(status);
  }

  private suspendForCompletion(): void {
    const key = this.publisher.currentBindingKey();
    if (key === undefined) return;
    this.completionFence = {
      key,
      snapshotCount:
        this.options.operations.current().successfulQueueSnapshotCount,
    };
    this.publisher.retire({ kind: "checking" });
  }

  private retire(): void {
    this.networkFence = undefined;
    this.completionFence = undefined;
    this.publisher.retire({ kind: "idle" });
  }
}

function uuid(): string {
  return globalThis.expo.uuidv4();
}

export function createNativeTaskTrackingRuntime(
  apiOrigin: string,
  auth: NativeAuthSession,
  operations: EmployeeOperationalSession,
): NativeTaskTrackingRuntime {
  return new NativeTaskTrackingRuntime({
    auth,
    createId: uuid,
    operations,
    transport: createEmployeeGpsIngestionTransport((signal) =>
      createNativeEmployeeClient(apiOrigin, auth, signal),
    ),
  });
}
