import type { StaffNativeAuthResponse } from "@valet/contracts/staff-auth";

import type { NativeAuthReason, NativeAuthSnapshot } from "./native-auth-types";

export class NativeAuthMemoryState {
  private accessToken: string | undefined;
  private snapshot: NativeAuthSnapshot = {
    authGeneration: 0,
    phase: "restoring",
  };
  private readonly subscribers = new Set<(state: NativeAuthSnapshot) => void>();

  current(): NativeAuthSnapshot {
    return this.snapshot;
  }

  access(): string | undefined {
    return this.snapshot.phase === "authenticated"
      ? this.accessToken
      : undefined;
  }

  subscribe(listener: (state: NativeAuthSnapshot) => void): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  restoring(generation: number): void {
    this.accessToken = undefined;
    this.publish({ authGeneration: generation, phase: "restoring" });
  }

  unauthenticated(generation: number, reason: NativeAuthReason): void {
    this.accessToken = undefined;
    this.publish({
      authGeneration: generation,
      phase: "unauthenticated",
      reason,
    });
  }

  unavailable(generation: number): void {
    this.accessToken = undefined;
    this.publish({
      authGeneration: generation,
      phase: "restoration-unavailable",
      reason: "transient-failure",
    });
  }

  fatal(generation: number): void {
    this.accessToken = undefined;
    this.publish({
      authGeneration: generation,
      phase: "fatal",
      reason: "secure-storage-failure",
    });
  }

  authenticated(generation: number, response: StaffNativeAuthResponse): void {
    this.accessToken = response.accessToken;
    this.publish({
      accessExpiresAt: response.accessExpiresAt,
      authGeneration: generation,
      phase: "authenticated",
      sessionExpiresAt: response.sessionExpiresAt,
    });
  }

  private publish(snapshot: NativeAuthSnapshot): void {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}
