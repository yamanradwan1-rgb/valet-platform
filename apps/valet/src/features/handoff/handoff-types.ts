export interface HandoffApiRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

export type HandoffVerificationMethod =
  | "DYNAMIC_QR"
  | "PICKUP_CODE"
  | "SUPERVISOR_OVERRIDE";

export interface HandoffVerificationSnapshot {
  readonly method: HandoffVerificationMethod;
  readonly status: "PENDING" | "VERIFIED";
  readonly verifiedAt: string | null;
}

/**
 * Employee-facing handoff lifecycle phases. All transitions originate from
 * authoritative backend responses; the UI never derives verification or
 * release success locally.
 */
export type HandoffPhase =
  | "idle"
  | "initiating"
  | "pending-unverified"
  | "verifying"
  | "verified"
  | "releasing"
  | "completed"
  | "aborting";

export interface HandoffState {
  readonly error: string | null;
  readonly errorMeta: {
    readonly code: string | null;
    readonly retryAfterSeconds: number | null;
  };
  readonly phase: HandoffPhase;
  /** Latest authoritative session version (adopted from responses/A1). */
  readonly sessionVersion: number | null;
  readonly verification: HandoffVerificationSnapshot | null;
}

/** Safe user-facing messages; backend codes never leak proof details. */
export function describeHandoffError(
  code: string,
  retryAfterSeconds: number | null,
): string {
  switch (code) {
    case "HANDOFF_VERIFICATION_FAILED":
      return "Verification failed. Ask the guest for the current code or QR and try again.";
    case "HANDOFF_VERIFICATION_RATE_LIMITED":
      return retryAfterSeconds !== null && retryAfterSeconds > 0
        ? `Too many attempts. Please wait ${String(retryAfterSeconds)}s before retrying.`
        : "Too many attempts. Please wait briefly before retrying.";
    case "HANDOFF_METHOD_NOT_ALLOWED":
      return "This handoff method is not available at this location. Use the other method.";
    case "HANDOFF_VERIFICATION_ALREADY_VERIFIED":
      return "This handoff is already verified.";
    case "VERSION_CONFLICT":
      return "Session changed elsewhere. Refreshing authoritative status…";
    case "FINANCIAL_RELEASE_NOT_SATISFIED":
      return "Release is blocked: the outstanding payment requirement is not satisfied yet.";
    case "TASK_NOT_FOUND_OR_FORBIDDEN":
      return "This task is no longer available to you.";
    default:
      return "Handoff operation failed. Please try again.";
  }
}

export const PICKUP_CODE_PATTERN = /^\d{4}$/;
export const DYNAMIC_QR_PATTERN = /^vhq1\.[A-Za-z0-9_-]{43}$/;
