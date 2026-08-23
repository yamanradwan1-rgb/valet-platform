import type { StaffValetSessionDetailResponse } from "@valet/contracts";

export type GuestAccessPhase = "error" | "loading" | "ready";

export interface GuestAccessView {
  /** Authoritative projection facts from the Staff detail read. */
  readonly expiresAt: string | null;
  readonly loadError: string | null;
  readonly isMutating: boolean;
  readonly mutationError: string | null;
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
  loadError: null,
  mutationError: null,
  phase: "loading",
  shareableUrl: null,
  revokedAt: null,
  status: null,
};
