import {
  guestAccessIssueRequestSchema,
  guestAccessIssueResponseSchema,
  guestAccessRevokeResponseSchema,
  staffValetSessionDetailResponseSchema,
  type EmployeeClient,
} from "@valet/employee-client";
import type { NativeContextualTarget } from "../shell/native-contextual-route";
import {
  buildNativeGuestAccessUrl,
  currentNativeCustomerAppOrigin,
  type NativeCustomerAppOriginResult,
} from "./native-customer-app-origin";
import { NativeGuestAccessCredentialMemory } from "./native-guest-access-credential-memory";
import {
  inactiveNativeGuestAccessSnapshot as inactive,
  nativeGuestAccessTargetMatchesDetail,
  type NativeGuestAccessError,
  type NativeGuestAccessSnapshot,
} from "./native-guest-access-types";
import {
  ambiguousGuestAccessError,
  issueNativeGuestAccess,
  loadNativeGuestAccess,
  revokeNativeGuestAccess,
} from "./native-guest-access-transport";

export interface NativeGuestAccessSessionOptions {
  readonly customerOrigin?: NativeCustomerAppOriginResult | undefined;
  readonly isOnline?: (() => boolean) | undefined;
}

export class NativeGuestAccessSession {
  private readonly customerOrigin: NativeCustomerAppOriginResult;
  private readonly credential = new NativeGuestAccessCredentialMemory();
  private generation = 0;
  private readonly isOnline: () => boolean;
  private snapshot: NativeGuestAccessSnapshot = inactive;
  private readonly subscribers = new Set<
    (value: NativeGuestAccessSnapshot) => void
  >();

  constructor(
    private readonly client: () => EmployeeClient,
    options: NativeGuestAccessSessionOptions = {},
  ) {
    this.customerOrigin = options.customerOrigin ?? currentNativeCustomerAppOrigin();
    this.isOnline = options.isOnline ?? (() => true);
  }
  current = () => this.snapshot;
  freshCredentialUrl = () => this.credential.current(this.snapshot);
  hasValidCustomerOrigin(): boolean {
    return this.customerOrigin.ok;
  }
  subscribe(listener: (value: NativeGuestAccessSnapshot) => void): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }
  async open(target: NativeContextualTarget): Promise<void> {
    this.generation += 1;
    this.credential.clear();
    this.publish({ ...inactive, phase: "loading", target });
    await this.loadAuthoritative(this.generation, target, null, "LOAD_FAILED");
  }
  async retry(): Promise<void> {
    const target = this.snapshot.target;
    if (target === null || this.snapshot.phase !== "load-error") return;
    this.generation += 1;
    this.credential.clear();
    this.publish({ ...this.snapshot, error: null, phase: "loading" });
    await this.loadAuthoritative(this.generation, target, null, "LOAD_FAILED");
  }

  async issue(): Promise<boolean> {
    const current = this.snapshot;
    if (
      current.phase !== "ready" ||
      current.status === null ||
      current.mutation !== null ||
      current.target === null
    ) {
      return false;
    }
    if (!this.isOnline()) {
      this.publish({ ...current, error: "OFFLINE" });
      return false;
    }
    if (!this.customerOrigin.ok) {
      this.publish({ ...current, error: "CONFIG_INVALID" });
      return false;
    }

    const request =
      current.status === "REVOKED"
        ? guestAccessIssueRequestSchema.safeParse({
            expectedRevokedAt: current.revokedAt,
            intent: "REISSUE_REVOKED",
          })
        : guestAccessIssueRequestSchema.safeParse({
            intent: "ISSUE_OR_ROTATE",
          });
    const generation = this.generation;
    const target = current.target;
    this.publish({
      ...current,
      error: null,
      mutation: current.status === "NOT_ISSUED" ? "creating" : "reissuing",
    });
    if (!request.success) {
      await this.recover(generation, target, "INTENT_CONFLICT");
      return false;
    }

    let raw: unknown;
    try {
      raw = await issueNativeGuestAccess(
        this.client(),
        target.sessionId,
        request.data,
      );
    } catch (error: unknown) {
      if (generation !== this.generation) return false;
      const outcome = ambiguousGuestAccessError(error);
      if (outcome !== null) {
        await this.recover(generation, target, outcome);
      } else {
        this.publish({ ...current, error: "UPDATE_FAILED", mutation: null });
      }
      return false;
    }

    const result = guestAccessIssueResponseSchema.safeParse(raw);
    const url = result.success
      ? buildNativeGuestAccessUrl(
          this.customerOrigin.origin,
          result.data.rawToken,
        )
      : null;
    if (
      !result.success ||
      url === null ||
      result.data.valetSessionId !== target.sessionId
    ) {
      await this.recover(generation, target, "GENERATED_CREDENTIAL_INVALID");
      return false;
    }
    if (generation !== this.generation) return false;
    this.credential.replace(target.sessionId, url);
    this.publish({
      ...current,
      error: null,
      expiresAt: result.data.expiresAt,
      mutation: null,
      revokedAt: null,
      status: "ACTIVE",
    });
    return true;
  }

  async revoke(): Promise<boolean> {
    const current = this.snapshot;
    if (
      current.phase !== "ready" ||
      current.status !== "ACTIVE" ||
      current.mutation !== null ||
      current.target === null
    ) {
      return false;
    }
    if (!this.isOnline()) {
      this.publish({ ...current, error: "OFFLINE" });
      return false;
    }
    const generation = this.generation;
    const target = current.target;
    this.publish({ ...current, error: null, mutation: "revoking" });
    try {
      const raw = await revokeNativeGuestAccess(
        this.client(),
        target.sessionId,
      );
      const result = guestAccessRevokeResponseSchema.safeParse(raw);
      if (!result.success || result.data.valetSessionId !== target.sessionId) {
        await this.recover(generation, target, "OUTCOME_UNKNOWN");
        return false;
      }
      if (generation !== this.generation) return false;
      this.credential.clear();
      this.publish({
        ...current,
        error: null,
        expiresAt: null,
        mutation: null,
        revokedAt: result.data.revokedAt,
        status: "REVOKED",
      });
      return true;
    } catch (error: unknown) {
      if (generation !== this.generation) return false;
      if (ambiguousGuestAccessError(error) !== null) {
        await this.recover(generation, target, "OUTCOME_UNKNOWN");
      } else {
        this.publish({ ...current, error: "REVOKE_FAILED", mutation: null });
      }
      return false;
    }
  }

  suspendForBackground(): void {
    const target = this.snapshot.target;
    this.credential.clear();
    if (target === null) {
      this.publish(this.snapshot);
      return;
    }
    this.generation += 1;
    if (this.snapshot.mutation === null) {
      this.publish(this.snapshot);
      return;
    }
    this.publish({
      ...this.snapshot,
      error: "OUTCOME_UNKNOWN",
      mutation: null,
    });
  }

  async revalidate(): Promise<void> {
    const target = this.snapshot.target;
    if (target === null || this.snapshot.mutation !== null) return;
    this.generation += 1;
    this.credential.clear();
    this.publish({ ...this.snapshot, error: null, phase: "loading" });
    await this.loadAuthoritative(this.generation, target, null, "LOAD_FAILED");
  }

  clear(): void {
    this.generation += 1;
    this.credential.clear();
    this.publish(inactive);
  }

  private async recover(
    generation: number,
    target: NativeContextualTarget,
    outcome: NativeGuestAccessError,
  ): Promise<void> {
    if (generation !== this.generation) return;
    this.credential.clear();
    this.publish({ ...this.snapshot, error: null, mutation: null });
    await this.loadAuthoritative(generation, target, outcome, outcome);
  }

  private async loadAuthoritative(
    generation: number,
    target: NativeContextualTarget,
    successError: NativeGuestAccessError | null,
    failureError: NativeGuestAccessError,
  ): Promise<void> {
    try {
      const raw = await loadNativeGuestAccess(this.client(), target.sessionId);
      const detail = staffValetSessionDetailResponseSchema.parse(raw);
      if (!nativeGuestAccessTargetMatchesDetail(target, detail))
        throw new Error("Invalid target");
      if (generation !== this.generation) return;
      if (detail.guestAccess.status !== "ACTIVE") this.credential.clear();
      this.publish({
        error: successError,
        expiresAt: detail.guestAccess.expiresAt,
        mutation: null,
        phase: "ready",
        revokedAt: detail.guestAccess.revokedAt,
        status: detail.guestAccess.status,
        target,
      });
    } catch {
      if (generation !== this.generation) return;
      this.credential.clear();
      this.publish({
        ...inactive,
        error: failureError,
        phase: "load-error",
        target,
      });
    }
  }

  private publish(
    value: Omit<NativeGuestAccessSnapshot, "credentialFresh"> & {
      readonly credentialFresh?: boolean;
    },
  ): void {
    this.snapshot = {
      ...value,
      credentialFresh: this.credential.isFreshFor(value),
    };
    for (const listener of this.subscribers) listener(this.snapshot);
  }
}
