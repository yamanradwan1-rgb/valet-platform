import { EmployeeApiError } from "../../lib/api/employee-api-errors";
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
  describeHandoffError,
  type HandoffState,
  type HandoffVerificationSnapshot,
} from "./handoff-types";

function errorMeta(error: unknown): {
  code: string;
  message: string;
  retryAfterSeconds: number | null;
} {
  if (error instanceof EmployeeApiError) {
    return {
      code: error.code,
      message: describeHandoffError(
        error.code,
        error.retryAfter ?? null,
      ),
      retryAfterSeconds: error.retryAfter ?? null,
    };
  }
  return {
    code: "UNKNOWN",
    message:
      error instanceof Error
        ? error.message
        : "Handoff operation failed. Please try again.",
    retryAfterSeconds: null,
  };
}

export interface HandoffControllerOptions {
  apiClient: EmployeeApiClient;
  readonly onComplete?: (() => void) | undefined;
  readonly onStateChange: (state: HandoffState) => void;
}

/**
 * Owns the post-READY handoff lifecycle. Every phase transition is adopted
 * from an authoritative backend response; failures never advance the phase.
 * A single synchronous mutation guard covers all six mutations so double
 * submits cannot issue parallel requests.
 */
export class HandoffController {
  private readonly options: HandoffControllerOptions;
  private state: HandoffState = {
    error: null,
    errorMeta: { code: null, retryAfterSeconds: null },
    phase: "idle",
    sessionVersion: null,
    verification: null,
  };
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

  /** Seeds authoritative facts (from A1 recovery or initiate response). */
  seed(input: {
    sessionVersion: number;
    verification?: HandoffVerificationSnapshot | null | undefined;
  }): void {
    this.state = {
      ...this.state,
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
    };
    this.emit();
  }

  reset(): void {
    this.state = {
      error: null,
      errorMeta: { code: null, retryAfterSeconds: null },
      phase: "idle",
      sessionVersion: null,
      verification: null,
    };
    this.emit();
  }

  private applyError(error: unknown): void {
    const meta = errorMeta(error);
    this.state = {
      ...this.state,
      error: meta.message,
      errorMeta: { code: meta.code, retryAfterSeconds: meta.retryAfterSeconds },
    };
    this.emit();
  }

  private emit(): void {
    this.options.onStateChange(this.state);
  }

  private async mutate(
    operation: () => Promise<void>,
  ): Promise<boolean> {
    if (this.mutationInFlight) return false;
    this.mutationInFlight = true;
    try {
      await operation();
      return true;
    } finally {
      this.mutationInFlight = false;
    }
  }

  initiate(sessionId: string, expectedSessionVersion: number): Promise<boolean> {
    return this.mutate(async () => {
      this.state = { ...this.state, error: null, phase: "initiating" };
      this.emit();
      try {
        const res = await initiateHandoff(
          this.options.apiClient,
          sessionId,
          expectedSessionVersion,
        );
        this.state = {
          ...this.state,
          error: null,
          errorMeta: { code: null, retryAfterSeconds: null },
          phase: "pending-unverified",
          sessionVersion: res.sessionVersion,
          verification: null,
        };
      } catch (error: unknown) {
        this.applyError(error);
        // Failure leaves READY truthfully.
        this.state = { ...this.state, phase: "idle", sessionVersion: expectedSessionVersion };
      }
      this.emit();
    });
  }

  verifyPickupCode(
    sessionId: string,
    pickupCode: string,
  ): Promise<boolean> {
    return this.mutate(async () => {
      const version = this.state.sessionVersion;
      if (version === null) {
        this.applyError(new Error("No active handoff to verify."));
        return;
      }
      this.state = { ...this.state, error: null, phase: "verifying" };
      this.emit();
      try {
        const res = await verifyPickupCode(this.options.apiClient, sessionId, {
          expectedSessionVersion: version,
          pickupCode,
        });
        this.adoptVerified(res.method, res.verifiedAt, res.sessionVersion);
      } catch (error: unknown) {
        this.applyError(error);
        this.state = { ...this.state, phase: "pending-unverified" };
      }
      this.emit();
    });
  }

  verifyDynamicQr(sessionId: string, qrPayload: string): Promise<boolean> {
    return this.mutate(async () => {
      const version = this.state.sessionVersion;
      if (version === null) {
        this.applyError(new Error("No active handoff to verify."));
        return;
      }
      this.state = { ...this.state, error: null, phase: "verifying" };
      this.emit();
      try {
        const res = await verifyDynamicQr(this.options.apiClient, sessionId, {
          expectedSessionVersion: version,
          qrPayload,
        });
        this.adoptVerified(res.method, res.verifiedAt, res.sessionVersion);
      } catch (error: unknown) {
        this.applyError(error);
        this.state = { ...this.state, phase: "pending-unverified" };
      }
      this.emit();
    });
  }

  supervisorOverride(sessionId: string, reason: string): Promise<boolean> {
    return this.mutate(async () => {
      const version = this.state.sessionVersion;
      if (version === null) {
        this.applyError(new Error("No active handoff to override."));
        return;
      }
      this.state = { ...this.state, error: null, phase: "verifying" };
      this.emit();
      try {
        const res = await supervisorOverrideHandoff(
          this.options.apiClient,
          sessionId,
          { expectedSessionVersion: version, reason },
        );
        this.adoptVerified(res.method, res.verifiedAt, res.sessionVersion);
      } catch (error: unknown) {
        this.applyError(error);
        this.state = { ...this.state, phase: "pending-unverified" };
      }
      this.emit();
    });
  }

  abort(sessionId: string, reason: string): Promise<boolean> {
    return this.mutate(async () => {
      const version = this.state.sessionVersion;
      if (version === null) {
        this.applyError(new Error("No active handoff to abort."));
        return;
      }
      this.state = { ...this.state, error: null, phase: "aborting" };
      this.emit();
      try {
        const res = await abortHandoff(this.options.apiClient, sessionId, {
          expectedSessionVersion: version,
          reason,
        });
        this.state = {
          ...this.state,
          error: null,
          errorMeta: { code: null, retryAfterSeconds: null },
          phase: "idle",
          sessionVersion: res.sessionVersion,
          verification: null,
        };
      } catch (error: unknown) {
        this.applyError(error);
        this.state = { ...this.state, phase: "pending-unverified" };
      }
      this.emit();
    });
  }

  complete(sessionId: string): Promise<boolean> {
    return this.mutate(async () => {
      const version = this.state.sessionVersion;
      if (version === null || this.state.phase !== "verified") {
        this.applyError(new Error("Handoff is not verified for release."));
        return;
      }
      this.state = { ...this.state, error: null, phase: "releasing" };
      this.emit();
      try {
        const res = await completeHandoff(
          this.options.apiClient,
          sessionId,
          version,
        );
        this.state = {
          ...this.state,
          error: null,
          errorMeta: { code: null, retryAfterSeconds: null },
          phase: "completed",
          sessionVersion: res.sessionVersion,
          verification: null,
        };
        this.options.onComplete?.();
      } catch (error: unknown) {
        this.applyError(error);
        // Financial guard and conflicts keep VERIFIED HANDOFF_PENDING.
        this.state = { ...this.state, phase: "verified" };
      }
      this.emit();
    });
  }

  private adoptVerified(
    method: HandoffVerificationSnapshot["method"],
    verifiedAt: string,
    sessionVersion: number,
  ): void {
    this.state = {
      ...this.state,
      error: null,
      errorMeta: { code: null, retryAfterSeconds: null },
      phase: "verified",
      sessionVersion,
      verification: { method, status: "VERIFIED", verifiedAt },
    };
  }
}
