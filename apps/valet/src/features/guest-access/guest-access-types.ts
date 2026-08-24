import type { StaffValetSessionDetailResponse } from "@valet/contracts";

export type GuestAccessPhase = "error" | "loading" | "ready";

/**
 * Locale-neutral Guest Access error conditions. The controller/headless
 * state stores only these stable codes; bilingual user-visible copy lives
 * exclusively in the EN/AR dictionaries via the UI presenter.
 */
export type GuestAccessErrorCode =
  | "CONFIG_INVALID"
  | "GENERATED_CREDENTIAL_INVALID"
  | "INTENT_CONFLICT"
  | "LOAD_FAILED"
  | "OFFLINE"
  | "OUTCOME_UNKNOWN"
  | "REVOKE_FAILED"
  | "UPDATE_FAILED";

export interface GuestAccessView {
  /** Authoritative projection facts from the Staff detail read. */
  readonly expiresAt: string | null;
  readonly isMutating: boolean;
  readonly loadErrorCode: GuestAccessErrorCode | null;
  readonly mutationErrorCode: GuestAccessErrorCode | null;
  readonly phase: GuestAccessPhase;

  /**
   * Transient, memory-only shareable URL holding the raw guest token. It
   * exists only while the mounted flow holds a freshly issued credential and
   * is discarded on revoke, reissue-replace, unmount, or identity change.
   */
  readonly shareableUrl: string | null;
  readonly revokedAt: string | null;
  readonly status:
    | StaffValetSessionDetailResponse["guestAccess"]["status"]
    | null;
}

export const initialGuestAccessView: GuestAccessView = {
  expiresAt: null,
  isMutating: false,
  loadErrorCode: null,
  mutationErrorCode: null,
  phase: "loading",
  shareableUrl: null,
  revokedAt: null,
  status: null,
};
