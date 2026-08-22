import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import { fetchSessionDetail } from "../retrieval/retrieval-api";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  describeHandoffError,
  type HandoffState,
  type HandoffVerificationSnapshot,
} from "./handoff-types";

export interface HandoffErrorMeta {
  readonly code: string;
  readonly message: string;
  readonly retryAfterSeconds: number | null;
}

export function toHandoffErrorMeta(error: unknown): HandoffErrorMeta {
  if (error instanceof EmployeeApiError) {
    return {
      code: error.code,
      message: describeHandoffError(error.code, error.retryAfter ?? null),
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

/**
 * A mutation error MAY mean the backend committed while the response was
 * lost. Only transport-level failures and VERSION_CONFLICT qualify;
 * authoritative business rejections (failed proof, financial block, rate
 * limit, forbidden) do not.
 */
export function isPossibleResponseLoss(error: unknown): boolean {
  if (error instanceof EmployeeApiError) {
    if (error.status === 0) return true;
    if (error.isNetworkError === true) return true;
    if (
      error.code === "NETWORK_ERROR" ||
      error.code === "STAFF_SESSION_SERVICE_UNAVAILABLE"
    ) {
      return true;
    }
    if (error.code === "VERSION_CONFLICT") return true;
    return false;
  }
  // Unknown throwables are treated as possible transport loss so the next
  // action re-syncs against the server instead of trusting local guesses.
  return true;
}

export interface AuthoritativeHandoffAdoption {
  readonly onComplete: () => void;
  readonly state: HandoffState;
}

function verificationFrom(detail: {
  handoff: {
    pendingAt: string | null;
    verification:
      | {
          method: "DYNAMIC_QR" | "PICKUP_CODE" | "SUPERVISOR_OVERRIDE";
          status: "PENDING" | "VERIFIED";
          verifiedAt: string | null;
        }
      | null;
  };
}): HandoffVerificationSnapshot | null {
  return detail.handoff.verification;
}

/**
 * Rehydrates A1 and maps authoritative state onto the controller. Returns
 * the next state, or null when A1 itself could not be read (original error
 * should then remain surfaced).
 */
export async function adoptAuthoritativeHandoff(
  apiClient: EmployeeApiClient,
  sessionId: string,
  current: HandoffState,
  onComplete: () => void,
): Promise<AuthoritativeHandoffAdoption | null> {
  try {
    const detail = await fetchSessionDetail(apiClient, sessionId);
    const verification = verificationFrom(detail);
    const base = {
      ...current,
      error: null,
      errorMeta: { code: null, retryAfterSeconds: null },
      sessionVersion: detail.version,
      verification,
    };
    if (detail.state === "COMPLETED") {
      onComplete();
      return {
        onComplete,
        state: { ...base, phase: "completed", verification: null },
      };
    }
    if (detail.state === "READY") {
      return { onComplete, state: { ...base, phase: "idle", verification: null } };
    }
    if (detail.state === "HANDOFF_PENDING") {
      if (verification?.status === "VERIFIED") {
        return { onComplete, state: { ...base, phase: "verified" } };
      }
      return { onComplete, state: { ...base, phase: "pending-unverified" } };
    }
    // READY-family states above HANDOFF (RETRIEVING etc.) are not handoff
    // phases; treat like abort-landed READY only when actually READY.
    return null;
  } catch {
    return null;
  }
}
