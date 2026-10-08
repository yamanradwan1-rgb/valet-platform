import { GuestApiError } from "../../lib/api/api-error";
import type { GuestApiClient } from "../../lib/api/guest-api-client";
import type {
  GuestHandoffMaterial,
  HandoffStandardMethod,
} from "../../lib/api/guest-api-types";

export type HandoffRecoveryState = "ALREADY_ISSUED" | "ALREADY_VERIFIED" | null;

export interface HandoffUiState {
  readonly client: GuestApiClient | null;
  readonly valetSessionId: string | undefined;
  readonly method: HandoffStandardMethod;
  readonly material: GuestHandoffMaterial | null;
  readonly operation: "ISSUE" | "ROTATE" | null;
  readonly error: string | null;
  readonly recoveryState: HandoffRecoveryState;
  readonly secondsRemaining: number | undefined;
}

export function emptyUiState(
  client: GuestApiClient | null,
  valetSessionId: string | undefined,
  method: HandoffStandardMethod,
): HandoffUiState {
  return {
    client,
    valetSessionId,
    method,
    material: null,
    operation: null,
    error: null,
    recoveryState: null,
    secondsRemaining: undefined,
  };
}

export function classifyHandoffRecovery(error: unknown): HandoffRecoveryState {
  if (!(error instanceof GuestApiError)) return null;
  if (error.code === "HANDOFF_VERIFICATION_ALREADY_ISSUED") {
    return "ALREADY_ISSUED";
  }
  if (error.code === "HANDOFF_VERIFICATION_ALREADY_VERIFIED") {
    return "ALREADY_VERIFIED";
  }
  return null;
}

export function handoffSecondsRemaining(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}
