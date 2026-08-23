import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  fetchStaffSessionDetail,
  type StaffValetSessionDetailResponse,
} from "../staff-session";
import {
  buildGuestAccessUrl,
  resolveCustomerAppOrigin,
  type CustomerAppOriginResult,
} from "./customer-app-origin";
import { issueGuestAccess, revokeGuestAccess } from "./guest-access-api";
import {
  initialGuestAccessView,
  type GuestAccessView,
} from "./guest-access-types";

function defaultOrigin(): CustomerAppOriginResult {
  return resolveCustomerAppOrigin({
    isProduction: process.env.NODE_ENV === "production",
    raw: process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN,
  });
}

/** Single authoritative origin/config read for Guest Access consumers. */
export function currentCustomerAppOrigin(): CustomerAppOriginResult {
  return defaultOrigin();
}

function getErrMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function isAmbiguousOutcome(err: unknown): boolean {
  return (
    err instanceof EmployeeApiError &&
    (err.isNetworkError || err.code === "GUEST_ACCESS_INTENT_CONFLICT")
  );
}

export interface GuestAccessControllerOptions {
  readonly getOrigin?: (() => CustomerAppOriginResult) | undefined;
  readonly isOnline?: (() => boolean) | undefined;
}

export class GuestAccessController {
  private apiClient: EmployeeApiClient | null = null;
  private readonly getOrigin: () => CustomerAppOriginResult;
  private readonly isOnlineFn: () => boolean;
  private state: GuestAccessView = initialGuestAccessView;

  constructor(
    private readonly onStateChange: (view: GuestAccessView) => void,
    options: GuestAccessControllerOptions = {},
  ) {
    this.getOrigin = options.getOrigin ?? defaultOrigin;
    this.isOnlineFn = options.isOnline ?? (() => navigator.onLine);
  }

  setApiClient(client: EmployeeApiClient): void {
    this.apiClient = client;
  }

  getState(): GuestAccessView {
    return this.state;
  }

  /** Discards any transient shareable URL (e.g. before loading a different
   * session) so one session's credential can never reach another. */
  discardTransientCredential(): void {
    this.patch({ shareableUrl: null });
  }

  private patch(partial: Partial<GuestAccessView>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange(this.state);
  }

  /**
   * Authoritative load/recovery. A held fresh link survives only while the
   * authoritative status remains ACTIVE; any other status discards it, so
   * the UI can never fabricate a QR/link after reload or conflict.
   */
  async load(sessionId: string): Promise<void> {
    const client = this.apiClient;
    if (client === null) return;
    if (this.state.status === null) this.patch({ phase: "loading" });
    try {
      const detail = await fetchStaffSessionDetail(client, sessionId);
      const guestAccess: StaffValetSessionDetailResponse["guestAccess"] =
        detail.guestAccess;
      this.patch({
        expiresAt: guestAccess.expiresAt,
        loadError: null,
        phase: "ready",
        revokedAt: guestAccess.revokedAt,
        shareableUrl:
          guestAccess.status === "ACTIVE" ? this.state.shareableUrl : null,
        status: guestAccess.status,
      });
    } catch (err: unknown) {
      this.patch({
        loadError: getErrMsg(err, "The guest access state could not be loaded."),
        phase: "error",
      });
    }
  }

  /**
   * Create / reissue. Intent follows the authoritative status: REVOKED uses
   * the exact expectedRevokedAt optimistic token; initial/active/expired all
   * use ISSUE_OR_ROTATE under the existing backend command contract.
   */
  async create(sessionId: string): Promise<void> {
    // Synchronous duplicate-submission block; no optimistic success.
    if (this.state.isMutating || this.state.phase !== "ready") return;
    if (!this.isOnlineFn()) {
      this.patch({ mutationError: "You appear to be offline." });
      return;
    }
    const client = this.apiClient;
    if (client === null) return;
    if (this.state.status === "REVOKED" && this.state.revokedAt === null) {
      return;
    }

    const origin = this.getOrigin();
    if (!origin.ok) {
      this.patch({ mutationError: "Guest link configuration is invalid." });
      return;
    }

    this.patch({ isMutating: true, mutationError: null });
    try {
      const result =
        this.state.status === "REVOKED"
          ? await issueGuestAccess(client, sessionId, {
              expectedRevokedAt: this.state.revokedAt as string,
              intent: "REISSUE_REVOKED",
            })
          : await issueGuestAccess(client, sessionId, {
              intent: "ISSUE_OR_ROTATE",
            });

      const url = buildGuestAccessUrl(origin.origin, result.rawToken);
      if (url === null) {
        this.patch({ isMutating: false });
        await this.load(sessionId);
        this.patch({ mutationError: "Generated guest access was invalid." });
        return;
      }
      // Atomic replace of any previously generated URL.
      this.patch({
        expiresAt: result.expiresAt,
        isMutating: false,
        mutationError: null,
        revokedAt: null,
        shareableUrl: url,
        status: "ACTIVE",
      });
    } catch (err: unknown) {
      this.patch({ isMutating: false });
      if (isAmbiguousOutcome(err)) {
        // The credential may already have been rotated or invalidated: the
        // previously held link must be discarded BEFORE authoritative
        // rehydrate so a stale URL can never survive an ambiguous outcome.
        this.patch({ mutationError: null, shareableUrl: null });
        await this.load(sessionId);
        this.patch({
          mutationError:
            err instanceof EmployeeApiError &&
            err.code === "GUEST_ACCESS_INTENT_CONFLICT"
              ? "Guest access changed elsewhere. Showing the current state."
              : "The outcome is unknown. Showing the current server state.",
        });
        return;
      }
      this.patch({
        mutationError: getErrMsg(err, "Guest access could not be updated."),
      });
    }
  }

  async revoke(sessionId: string): Promise<void> {
    // Synchronous duplicate-submission block.
    if (this.state.isMutating || this.state.phase !== "ready") return;
    if (!this.isOnlineFn()) {
      this.patch({ mutationError: "You appear to be offline." });
      return;
    }
    const client = this.apiClient;
    if (client === null) return;

    this.patch({ isMutating: true, mutationError: null });
    try {
      const result = await revokeGuestAccess(client, sessionId);
      // Discard the transient credential BEFORE adopting REVOKED so no
      // QR/copy/open capability outlives the authoritative revocation.
      this.patch({
        isMutating: false,
        mutationError: null,
        revokedAt: result.revokedAt,
        shareableUrl: null,
        status: "REVOKED",
      });
    } catch (err: unknown) {
      this.patch({ isMutating: false });
      if (isAmbiguousOutcome(err)) {
        await this.load(sessionId);
        this.patch({
          mutationError:
            "The outcome is unknown. Showing the current server state.",
        });
        return;
      }
      this.patch({ mutationError: getErrMsg(err, "Revocation failed.") });
    }
  }
}
