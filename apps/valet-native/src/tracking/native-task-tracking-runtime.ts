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
import { NativeTaskTrackingFences } from "./native-task-tracking-fences";
import type { NativeTaskLocationPort } from "./native-task-location-adapter";
import {
  nativeTaskTrackingBinding,
  type NativeTaskTrackingBinding,
  type NativeTaskTrackingStatus,
} from "./native-task-tracking-types";

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
  private disposed = false;
  private readonly fences: NativeTaskTrackingFences;
  private foreground = false;
  private lastScopeKey: string | undefined;
  private online = true;
  private readonly publisher: NativeTaskGpsPublisher;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly options: NativeTaskTrackingRuntimeOptions) {
    let lastAuthGeneration = options.auth.current().authGeneration;
    this.fences = new NativeTaskTrackingFences(
      () => options.operations.current().successfulQueueSnapshotCount,
    );
    this.publisher = new NativeTaskGpsPublisher({
      createId: options.createId,
      isAuthorized: (binding) => this.authorityMatches(binding),
      location: options.location,
      now: options.now,
      onDefinitiveFailure: () => {
        void this.options.operations.refreshQueue();
      },
      onUnknown: (binding) => this.fences.pauseNetwork(binding.key),
      transport: options.transport,
    });
    this.unsubscribers.push(
      options.operations.subscribe(() => this.reconcile()),
      options.auth.subscribe(() => {
        const auth = options.auth.current();
        if (
          auth.authGeneration !== lastAuthGeneration ||
          auth.phase === "unauthenticated" ||
          auth.phase === "fatal"
        ) {
          this.fences.clear();
        }
        lastAuthGeneration = auth.authGeneration;
        this.reconcile();
      }),
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
          this.suspendForCompletion("PARKING");
        }
        if (snapshot.phase === "parked" && previous !== "parked") {
          this.finishMovement("PARKING");
          if (previous === "submitting")
            void this.options.operations.refreshQueue(true);
        } else if (
          previous === "submitting" &&
          snapshot.phase !== "submitting"
        ) {
          void this.options.operations.refreshQueue();
        }
      }),
      retrieval.subscribe((snapshot) => {
        const previous = retrievalPhase;
        retrievalPhase = snapshot.phase;
        if (
          snapshot.phase === "submitting-ready" &&
          previous !== "submitting-ready"
        ) {
          this.suspendForCompletion("RETRIEVAL");
        }
        if (snapshot.phase === "ready" && previous !== "ready") {
          this.finishMovement("RETRIEVAL");
          if (
            previous === "submitting-ready" ||
            previous === "submitting-start"
          ) {
            void this.options.operations.refreshQueue(true);
          }
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
      }),
    );
  }

  setForeground(foreground: boolean): void {
    if (this.disposed || this.foreground === foreground) return;
    this.foreground = foreground;
    if (!foreground) this.retire(true);
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
    if (this.fences.hasPending()) {
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
      const authorityLost =
        auth.phase === "unauthenticated" ||
        auth.phase === "fatal" ||
        snapshot.phase === "inactive" ||
        snapshot.phase === "no-active-shift" ||
        snapshot.phase === "ambiguous-active-shifts" ||
        (snapshot.identityGeneration !== null &&
          snapshot.identityGeneration !== auth.authGeneration);
      this.retire(!authorityLost);
      return;
    }
    const scopeKey = [
      auth.authGeneration,
      snapshot.scope.organizationId,
      snapshot.scope.membershipId,
      snapshot.scope.locationId,
      snapshot.scope.shiftId,
    ].join(":");
    if (this.lastScopeKey !== undefined && this.lastScopeKey !== scopeKey)
      this.fences.clear();
    this.lastScopeKey = scopeKey;
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
    if (this.fences.isCompleted(candidate?.key)) {
      this.publisher.retire({ kind: "idle" });
      return;
    }
    if (!this.fences.release("network", candidate?.key)) return;
    if (!this.fences.release("completion", candidate?.key)) return;
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

  private authorityMatches(binding: NativeTaskTrackingBinding): boolean {
    const auth = this.options.auth.current();
    return (
      !this.disposed &&
      this.foreground &&
      this.online &&
      auth.phase === "authenticated" &&
      auth.authGeneration === binding.identityGeneration &&
      nativeTaskTrackingBinding(this.options.operations.current())?.key ===
        binding.key
    );
  }

  private pauseForNetwork(status: NativeTaskTrackingStatus): void {
    this.fences.pauseNetwork(this.publisher.currentBindingKey());
    this.publisher.pause(status);
  }

  private suspendForCompletion(type: "PARKING" | "RETRIEVAL"): void {
    if (
      !this.fences.suspendCompletion(this.publisher.currentBindingKey(), type)
    )
      return;
    this.publisher.retire({ kind: "checking" });
  }

  private finishMovement(type: "PARKING" | "RETRIEVAL"): void {
    const currentKey = this.publisher.currentBindingKey();
    const completedKey = this.fences.finishMovement(type, currentKey);
    if (currentKey === undefined || currentKey === completedKey)
      this.publisher.retire({ kind: "idle" });
  }

  private retire(preserveForBackground = false): void {
    this.fences.clear(preserveForBackground);
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
