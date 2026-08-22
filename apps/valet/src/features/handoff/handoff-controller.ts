import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  abortHandoff,
  completeHandoff,
  initiateHandoff,
  supervisorOverrideHandoff,
  verifyDynamicQr,
  verifyPickupCode,
} from "./handoff-api";
import {
  adoptAuthoritativeHandoff,
  isPossibleResponseLoss,
  toHandoffErrorMeta,
} from "./handoff-recovery";
import type {
  HandoffPhase,
  HandoffState,
  HandoffVerificationMethod,
  HandoffVerificationSnapshot,
} from "./handoff-types";

export interface HandoffControllerOptions {
  apiClient: EmployeeApiClient;
  readonly onComplete?: (() => void) | undefined;
  readonly onStateChange: (state: HandoffState) => void;
}

const INITIAL_STATE: HandoffState = {
  error: null,
  errorMeta: { code: null, retryAfterSeconds: null },
  phase: "idle",
  sessionVersion: null,
  verification: null,
};

/**
 * Owns the post-READY handoff lifecycle. Phase transitions are adopted from
 * authoritative backend responses only. On transport-level failures or
 * VERSION_CONFLICT — where the backend may have committed while the response
 * was lost — the controller rehydrates the staff A1 read and adopts the
 * authoritative state instead of trusting local guesses. Business
 * rejections never trigger recovery and never advance the phase.
 */
export class HandoffController {
  private readonly options: HandoffControllerOptions;
  private state: HandoffState = INITIAL_STATE;
  private mutationInFlight = false;

  constructor(options: HandoffControllerOptions) {
    this.options = options;
  }

  getState(): HandoffState {
    return this.state;
  }

  setApiClient(client: EmployeeApiClient): void {
    this.options.apiClient = client;
  }

  /** Seeds authoritative facts (from A1 recovery). */
  seed(input: {
    sessionVersion: number;
    verification?: HandoffVerificationSnapshot | null | undefined;
  }): void {
    this.patch({
      error: null,
      errorMeta: { code: null, retryAfterSeconds: null },
      phase:
        input.verification?.status === "VERIFIED"
          ? "verified"
          : this.state.phase === "idle"
            ? "pending-unverified"
            : this.state.phase,
      sessionVersion: input.sessionVersion,
      verification: input.verification ?? null,
    });
  }

  reset(): void {
    this.state = INITIAL_STATE;
    this.emit();
  }

  private patch(state: HandoffState): void {
    this.state = state;
    this.emit();
  }

  private setPhase(phase: HandoffPhase): void {
    this.state = { ...this.state, phase };
    this.emit();
  }

  private emit(): void {
    this.options.onStateChange(this.state);
  }

  private async mutate(operation: () => Promise<void>): Promise<boolean> {
    if (this.mutationInFlight) return false;
    this.mutationInFlight = true;
    try {
      await operation();
      return true;
    } finally {
      this.mutationInFlight = false;
    }
  }

  /**
   * Surfaces the failure, then rehydrates A1 when the server may have
   * committed (network/unknown/VERSION_CONFLICT). Adoption replaces the
   * error state; otherwise `fallbackPhase` applies.
   */
  private async recoverOrFail(
    sessionId: string | null,
    fallbackPhase: HandoffPhase,
    error: unknown,
    onComplete?: () => void,
  ): Promise<void> {
    const meta = toHandoffErrorMeta(error);
    this.state = {
      ...this.state,
      error: meta.message,
      errorMeta: { code: meta.code, retryAfterSeconds: meta.retryAfterSeconds },
    };
    if (!isPossibleResponseLoss(error) || sessionId === null) {
      this.setPhase(fallbackPhase);
      return;
    }
    const adoption = await adoptAuthoritativeHandoff(
      this.options.apiClient,
      sessionId,
      this.state,
      () => {
        this.options.onComplete?.();
        onComplete?.();
      },
    );
    if (adoption !== null) {
      this.state = adoption.state;
      this.emit();
      return;
    }
    this.setPhase(fallbackPhase);
  }

  initiate(sessionId: string, expectedSessionVersion: number): Promise<boolean> {
    return this.mutate(async () => {
      this.setPhase("initiating");
      try {
        const res = await initiateHandoff(
          this.options.apiClient,
          sessionId,
          expectedSessionVersion,
        );
        this.patch({
          ...this.state,
          error: null,
          errorMeta: { code: null, retryAfterSeconds: null },
          phase: "pending-unverified",
          sessionVersion: res.sessionVersion,
          verification: null,
        });
      } catch (error: unknown) {
        await this.recoverOrFail(sessionId, "idle", error, () => undefined);
        if (this.state.phase === "initiating") {
          this.state = {
            ...this.state,
            sessionVersion: expectedSessionVersion,
          };
          this.setPhase("idle");
        }
      }
    });
  }

  verifyPickupCode(sessionId: string, pickupCode: string): Promise<boolean> {
    return this.performVerify(sessionId, "PICKUP_CODE", pickupCode);
  }

  verifyDynamicQr(sessionId: string, qrPayload: string): Promise<boolean> {
    return this.performVerify(sessionId, "DYNAMIC_QR", qrPayload);
  }

  supervisorOverride(sessionId: string, reason: string): Promise<boolean> {
    return this.performVerify(sessionId, "SUPERVISOR_OVERRIDE", reason);
  }

  private performVerify(
    sessionId: string,
    kind: Exclude<HandoffVerificationMethod, never>,
    materialOrReason: string,
  ): Promise<boolean> {
    return this.mutate(async () => {
      const version = this.state.sessionVersion;
      if (version === null) {
        this.recoverOrFail(null, this.state.phase, new Error("No active handoff to verify."));
        return;
      }
      this.setPhase("verifying");
      try {
        const res =
          kind === "PICKUP_CODE"
            ? await verifyPickupCode(this.options.apiClient, sessionId, {
                expectedSessionVersion: version,
                pickupCode: materialOrReason,
              })
            : kind === "DYNAMIC_QR"
              ? await verifyDynamicQr(this.options.apiClient, sessionId, {
                  expectedSessionVersion: version,
                  qrPayload: materialOrReason,
                })
              : await supervisorOverrideHandoff(this.options.apiClient, sessionId, {
                  expectedSessionVersion: version,
                  reason: materialOrReason,
                });
        this.adoptVerified(res.method, res.verifiedAt, res.sessionVersion);
      } catch (error: unknown) {
        await this.recoverOrFail(sessionId, "pending-unverified", error, () => undefined);
      }
    });
  }

  abort(sessionId: string, reason: string): Promise<boolean> {
    return this.mutate(async () => {
      const version = this.state.sessionVersion;
      if (version === null) {
        this.recoverOrFail(null, this.state.phase, new Error("No active handoff to abort."));
        return;
      }
      this.setPhase("aborting");
      try {
        const res = await abortHandoff(this.options.apiClient, sessionId, {
          expectedSessionVersion: version,
          reason,
        });
        this.patch({
          ...this.state,
          error: null,
          errorMeta: { code: null, retryAfterSeconds: null },
          phase: "idle",
          sessionVersion: res.sessionVersion,
          verification: null,
        });
      } catch (error: unknown) {
        await this.recoverOrFail(sessionId, "pending-unverified", error, () => undefined);
      }
    });
  }

  complete(sessionId: string): Promise<boolean> {
    return this.mutate(async () => {
      const version = this.state.sessionVersion;
      if (version === null || this.state.phase !== "verified") {
        this.recoverOrFail(null, this.state.phase, new Error("Handoff is not verified for release."));
        return;
      }
      this.setPhase("releasing");
      try {
        const res = await completeHandoff(
          this.options.apiClient,
          sessionId,
          version,
        );
        this.patch({
          ...this.state,
          error: null,
          errorMeta: { code: null, retryAfterSeconds: null },
          phase: "completed",
          sessionVersion: res.sessionVersion,
          verification: null,
        });
        this.options.onComplete?.();
      } catch (error: unknown) {
        // Financial/business blocks keep VERIFIED HANDOFF_PENDING.
        await this.recoverOrFail(sessionId, "verified", error);
      }
    });
  }

  private adoptVerified(
    method: HandoffVerificationMethod,
    verifiedAt: string,
    sessionVersion: number,
  ): void {
    this.patch({
      ...this.state,
      error: null,
      errorMeta: { code: null, retryAfterSeconds: null },
      phase: "verified",
      sessionVersion,
      verification: { method, status: "VERIFIED", verifiedAt },
    });
  }
}
