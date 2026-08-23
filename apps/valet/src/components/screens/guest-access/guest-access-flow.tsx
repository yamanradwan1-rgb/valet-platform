"use client";

import { useMemo, useState, type JSX } from "react";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import {
  currentCustomerAppOrigin,
  useGuestAccess,
} from "../../../features/guest-access";
import { useOnlineStatus } from "../../../lib/connectivity/use-online-status";
import { BackHeader, Btn } from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import type { Screen } from "../../../types/employee-ui";
import { ConfirmSheet } from "./guest-access-sheets";
import { GuestAccessStatusCard } from "./guest-access-status-card";

const isDevLike = process.env.NODE_ENV !== "production";

type GuestAccessStatusValue =
  StaffValetSessionDetailResponse["guestAccess"]["status"];

export type GuestAccessPrimaryActionKind = "CREATE" | "CREATE_NEW" | "REISSUE";

export interface GuestAccessActions {
  readonly primary: {
    readonly kind: GuestAccessPrimaryActionKind;
    /** Reissue of a still-ACTIVE credential must be confirmed first. */
    readonly requiresConfirm: boolean;
  } | null;
  readonly showRevoke: boolean;
}

/**
 * Authoritative action mapping. NOT_ISSUED creates; ACTIVE (with or without
 * a fresh link) reissues through confirmation; EXPIRED reissues directly;
 * REVOKED creates new access using the exact revokedAt.
 */
export function deriveGuestAccessActions(
  status: GuestAccessStatusValue | null,
): GuestAccessActions {
  switch (status) {
    case "NOT_ISSUED":
      return { primary: { kind: "CREATE", requiresConfirm: false }, showRevoke: false };
    case "ACTIVE":
      return {
        primary: { kind: "REISSUE", requiresConfirm: true },
        showRevoke: true,
      };
    case "EXPIRED":
      return {
        primary: { kind: "REISSUE", requiresConfirm: false },
        showRevoke: false,
      };
    case "REVOKED":
      return {
        primary: { kind: "CREATE_NEW", requiresConfirm: false },
        showRevoke: false,
      };
    default:
      return { primary: null, showRevoke: false };
  }
}

function copyGuestLink(url: string): Promise<boolean> {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
    return Promise.resolve(false);
  }
  return navigator.clipboard.writeText(url).then(
    () => true,
    () => false,
  );
}

/**
 * Contextual, non-blocking Guest Access terminal. Never a prerequisite for
 * key assignment, parking-task creation, or Start Parking.
 */
export function GuestAccessFlow({
  nav,
  onClose,
  onAuthorizationLoss,
  returnScreen,
  sessionId,
}: {
  readonly nav: (s: Screen) => void;
  readonly onClose?: (() => void) | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly returnScreen: Screen;
  readonly sessionId: string;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const isOnline = useOnlineStatus();
  const { create, load, revoke, view } = useGuestAccess({
    sessionId,
    onAuthorizationLoss,
  });
  const [confirmKind, setConfirmKind] = useState<"reissue" | "revoke" | null>(
    null,
  );
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(
    null,
  );

  // Origin configuration is validated once on entry. Invalid/missing config
  // surfaces immediately, blocks Create/Reissue and every credential
  // surface, but keeps the authoritative read and Revoke available.
  const originFailure = useMemo(() => {
    const resolved = currentCustomerAppOrigin();
    return resolved.ok ? null : resolved.reason;
  }, []);
  const configInvalid = originFailure !== null;

  const mutationsOffline = !isOnline;
  const hasFreshLink = view.shareableUrl !== null;
  const actions = deriveGuestAccessActions(view.status);
  const primary = actions.primary;
  const primaryBlocked =
    mutationsOffline || view.isMutating || (configInvalid && primary !== null);

  const primaryLabel = primary === null ? "" :
    view.isMutating ? t.guestAccessCreating :
    primary.kind === "CREATE" ? t.guestAccessCreate :
    primary.kind === "CREATE_NEW" ? t.guestAccessCreateNew :
    t.guestAccessReissue;

  const openDevGuestApp = () => {
    if (!isDevLike || configInvalid || view.shareableUrl === null) return;
    window.open(view.shareableUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopy = () => {
    if (configInvalid || view.shareableUrl === null) return;
    // Copying an in-memory link stays available offline; it never implies
    // that the Customer app or API is reachable.
    void copyGuestLink(view.shareableUrl).then((ok) =>
      setCopyFeedback(ok ? "copied" : "failed"),
    );
  };

  return (
    <div>
      <BackHeader
        title={t.guestAccessTitle}
        onBack={() => (onClose ? onClose() : nav(returnScreen))}
      />
      <div className="p-5 space-y-5">
        {configInvalid && (
          <p
            className="text-vdanger text-xs bg-red-50 border border-vdanger/20 rounded-xl p-3"
            role="alert"
          >
            {t.guestAccessConfigError}
          </p>
        )}

        {view.phase === "loading" && (
          <p className="text-neutral text-sm text-center py-10">
            {t.loadingSession}
          </p>
        )}

        {view.phase === "error" && (
          <>
            <p className="text-vdanger text-xs bg-red-50 border border-vdanger/20 rounded-xl p-3">
              {view.loadError ?? t.sessionContextError}
            </p>
            <Btn label={t.retry} onClick={() => void load()} />
          </>
        )}

        {view.phase === "ready" && (
          <>
            {view.mutationError !== null && (
              <p
                className="text-vdanger text-xs bg-red-50 border border-vdanger/20 rounded-xl p-3"
                role="alert"
              >
                {view.mutationError}
              </p>
            )}
            <GuestAccessStatusCard
              copyFeedback={copyFeedback}
              onCopy={handleCopy}
              suppressCredentialSurfaces={configInvalid}
              view={view}
            />

            {primary !== null && (
              <Btn
                disabled={primaryBlocked}
                label={primaryLabel}
                onClick={() => {
                  if (primary.requiresConfirm) setConfirmKind("reissue");
                  else void create();
                }}
                variant={
                  primary.kind === "REISSUE" && hasFreshLink
                    ? "secondary"
                    : "primary"
                }
              />
            )}

            {actions.showRevoke && (
              <Btn
                disabled={mutationsOffline || view.isMutating}
                label={t.guestAccessRevoke}
                onClick={() => setConfirmKind("revoke")}
                variant="danger"
              />
            )}

            {!isOnline && (
              <p className="text-muted text-xs text-center">
                {t.noNetworkMessage}
              </p>
            )}

            {isDevLike && !configInvalid && hasFreshLink && (
              <Btn
                disabled={!isOnline || view.isMutating}
                label={t.guestAccessOpenApp}
                onClick={openDevGuestApp}
                variant="ghost"
                size="md"
              />
            )}
          </>
        )}
      </div>

      <ConfirmSheet
        body={t.guestAccessReissueConfirmBody}
        cancelLabel={t.cancelLabel}
        confirmLabel={t.guestAccessReissue}
        isOpen={confirmKind === "reissue"}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => {
          setConfirmKind(null);
          void create();
        }}
        title={t.guestAccessReissueConfirmTitle}
        variant="primary"
      />
      <ConfirmSheet
        body={t.guestAccessRevokeConfirmBody}
        cancelLabel={t.cancelLabel}
        confirmLabel={t.guestAccessRevoke}
        isOpen={confirmKind === "revoke"}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => {
          setConfirmKind(null);
          void revoke();
        }}
        title={t.guestAccessRevokeConfirmTitle}
        variant="danger"
      />
    </div>
  );
}
