import type { StaffAuthAccessResponse } from "@valet/contracts";
import {
  classifyEmployeeAuthorizationRefreshFailure,
  type EmployeeAuthorizationRefreshFailureKind,
} from "@valet/employee-client";
import { EmployeeApiError } from "../api/employee-api-errors";

export type StaffRefreshFailureKind = EmployeeAuthorizationRefreshFailureKind;

export class StaffAuthRefreshError extends Error {
  readonly code: string;
  readonly kind: StaffRefreshFailureKind;
  readonly status: number;

  constructor(kind: StaffRefreshFailureKind, cause: EmployeeApiError) {
    super(cause.message);
    this.name = "StaffAuthRefreshError";
    this.code = cause.code;
    this.kind = kind;
    this.status = cause.status;
  }
}

export function classifyRefreshFailure(
  error: unknown,
): StaffRefreshFailureKind {
  return classifyEmployeeAuthorizationRefreshFailure(error);
}

export type StaffSessionRestoreResult =
  | {
      readonly kind: "AUTHENTICATED";
      readonly response: StaffAuthAccessResponse;
    }
  | { readonly kind: "DEFINITIVE_INVALID" }
  | {
      readonly kind: "REFRESH_UNAVAILABLE";
      readonly message: string;
    };

interface RefreshCapableClient {
  getSession(): { sessionExpiresAt: string } | null;
  refresh(signal?: AbortSignal | undefined): Promise<StaffAuthAccessResponse>;
}

/**
 * Distinguishes a definitive refresh rejection (invalid/expired/revoked
 * refresh credential) from a transient refresh-service failure so callers
 * never treat an outage as proof that authentication ended.
 */
export async function restoreStaffSession(
  client: RefreshCapableClient,
  signal?: AbortSignal | undefined,
): Promise<StaffSessionRestoreResult> {
  try {
    const response = await client.refresh(signal);
    if (client.getSession() === null) {
      return { kind: "DEFINITIVE_INVALID" };
    }
    return { kind: "AUTHENTICATED", response };
  } catch (error: unknown) {
    if (error instanceof StaffAuthRefreshError) {
      if (error.kind === "definitive") {
        return { kind: "DEFINITIVE_INVALID" };
      }
      return { kind: "REFRESH_UNAVAILABLE", message: error.message };
    }
    return {
      kind: "REFRESH_UNAVAILABLE",
      message:
        "Staff sign-in service is temporarily unavailable. Please retry.",
    };
  }
}

export interface AccessTokenOutcome {
  readonly failureKind: StaffRefreshFailureKind | null;
  readonly token: string | null;
}

interface TokenCapableClient {
  getAccessToken(): string | null;
  isTokenFresh(bufferSeconds?: number): boolean;
  refresh(signal?: AbortSignal | undefined): Promise<StaffAuthAccessResponse>;
}

export async function ensureAccessTokenDetailed(
  client: TokenCapableClient,
  bufferSeconds = 60,
  signal?: AbortSignal | undefined,
): Promise<AccessTokenOutcome> {
  if (client.isTokenFresh(bufferSeconds)) {
    return { failureKind: null, token: client.getAccessToken() };
  }
  try {
    const refreshed = await client.refresh(signal);
    return { failureKind: null, token: refreshed.accessToken };
  } catch (error: unknown) {
    const failureKind =
      error instanceof StaffAuthRefreshError ? error.kind : "transient";
    return { failureKind, token: null };
  }
}
