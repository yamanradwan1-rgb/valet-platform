import type { StaffValetSessionDetailResponse } from "@valet/employee-client";
import type { NativeContextualTarget } from "../shell/native-contextual-route";

export type NativeGuestAccessStatus =
  StaffValetSessionDetailResponse["guestAccess"]["status"];

export type NativeGuestAccessError =
  | "CONFIG_INVALID"
  | "GENERATED_CREDENTIAL_INVALID"
  | "INTENT_CONFLICT"
  | "LOAD_FAILED"
  | "OFFLINE"
  | "OUTCOME_UNKNOWN"
  | "REVOKE_FAILED"
  | "UPDATE_FAILED";

export interface NativeGuestAccessSnapshot {
  /** Nonsecret signal; the credential URL itself stays private to the session. */
  readonly credentialFresh: boolean;
  readonly error: NativeGuestAccessError | null;
  readonly expiresAt: string | null;
  readonly mutation: "creating" | "reissuing" | "revoking" | null;
  readonly phase: "inactive" | "loading" | "load-error" | "ready";
  readonly revokedAt: string | null;
  readonly status: NativeGuestAccessStatus | null;
  readonly target: NativeContextualTarget | null;
}

export const inactiveNativeGuestAccessSnapshot: NativeGuestAccessSnapshot = {
  credentialFresh: false,
  error: null,
  expiresAt: null,
  mutation: null,
  phase: "inactive",
  revokedAt: null,
  status: null,
  target: null,
};

export type NativeGuestAccessPrimaryAction = {
  readonly kind: "CREATE" | "CREATE_NEW" | "REISSUE";
  readonly confirm: boolean;
} | null;

export function nativeGuestAccessActions(
  status: NativeGuestAccessStatus | null,
): {
  readonly primary: NativeGuestAccessPrimaryAction;
  readonly revoke: boolean;
} {
  switch (status) {
    case "NOT_ISSUED":
      return { primary: { confirm: false, kind: "CREATE" }, revoke: false };
    case "ACTIVE":
      return { primary: { confirm: true, kind: "REISSUE" }, revoke: true };
    case "EXPIRED":
      return { primary: { confirm: false, kind: "REISSUE" }, revoke: false };
    case "REVOKED":
      return { primary: { confirm: false, kind: "CREATE_NEW" }, revoke: false };
    default:
      return { primary: null, revoke: false };
  }
}
