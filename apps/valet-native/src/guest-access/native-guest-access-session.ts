import {
  guestAccessRevokeResponseSchema,
  staffValetSessionDetailResponseSchema,
  EmployeeApiError,
  type EmployeeClient,
} from "@valet/employee-client";
import type { NativeContextualTarget } from "../shell/native-contextual-route";
import type { NativeGuestAccessSnapshot } from "./native-guest-access-types";

const inactive: NativeGuestAccessSnapshot = {
  error: null,
  expiresAt: null,
  mutation: null,
  phase: "inactive",
  revokedAt: null,
  status: null,
  target: null,
};

export class NativeGuestAccessSession {
  private generation = 0;
  private snapshot: NativeGuestAccessSnapshot = inactive;
  private readonly subscribers = new Set<
    (value: NativeGuestAccessSnapshot) => void
  >();

  constructor(private readonly client: () => EmployeeClient) {}

  current(): NativeGuestAccessSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (value: NativeGuestAccessSnapshot) => void): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  async open(target: NativeContextualTarget): Promise<void> {
    this.generation += 1;
    this.publish({ ...inactive, phase: "loading", target });
    await this.load(this.generation, target);
  }

  async retry(): Promise<void> {
    const target = this.snapshot.target;
    if (target === null || this.snapshot.phase !== "load-error") return;
    this.generation += 1;
    this.publish({ ...this.snapshot, error: null, phase: "loading" });
    await this.load(this.generation, target);
  }

  async revoke(): Promise<boolean> {
    const current = this.snapshot;
    if (
      current.phase !== "ready" ||
      current.status !== "ACTIVE" ||
      current.mutation
    )
      return false;
    const generation = this.generation;
    this.publish({ ...current, error: null, mutation: "revoking" });
    try {
      const raw = await this.client().request<unknown>({
        body: {},
        method: "POST",
        path: `/v1/staff/check-in/sessions/${current.target!.sessionId}/guest-access/revoke`,
      });
      const result = guestAccessRevokeResponseSchema.parse(raw);
      if (generation !== this.generation) return false;
      this.publish({
        ...current,
        error: null,
        expiresAt: null,
        mutation: null,
        revokedAt: result.revokedAt,
        status: "REVOKED",
      });
      return true;
    } catch (error: unknown) {
      if (generation === this.generation) {
        if (
          error instanceof EmployeeApiError &&
          (error.isNetworkError ||
            error.code === "GUEST_ACCESS_INTENT_CONFLICT")
        ) {
          this.publish({ ...current, error: null, mutation: null });
          await this.load(generation, current.target!);
          if (
            generation === this.generation &&
            this.snapshot.phase === "ready"
          ) {
            this.publish({ ...this.snapshot, error: "OUTCOME_UNKNOWN" });
          }
        } else {
          this.publish({ ...current, error: "REVOKE_FAILED", mutation: null });
        }
      }
      return false;
    }
  }

  clear(): void {
    this.generation += 1;
    this.publish(inactive);
  }

  private async load(
    generation: number,
    target: NativeContextualTarget,
  ): Promise<void> {
    try {
      const raw = await this.client().request<unknown>({
        method: "GET",
        path: `/v1/staff/valet-sessions/${target.sessionId}`,
      });
      const detail = staffValetSessionDetailResponseSchema.parse(raw);
      if (generation !== this.generation) return;
      this.publish({
        error: null,
        expiresAt: detail.guestAccess.expiresAt,
        mutation: null,
        phase: "ready",
        revokedAt: detail.guestAccess.revokedAt,
        status: detail.guestAccess.status,
        target,
      });
    } catch {
      if (generation === this.generation) {
        this.publish({
          ...inactive,
          error: "LOAD_FAILED",
          phase: "load-error",
          target,
        });
      }
    }
  }

  private publish(value: NativeGuestAccessSnapshot): void {
    this.snapshot = value;
    for (const listener of this.subscribers) listener(value);
  }
}
