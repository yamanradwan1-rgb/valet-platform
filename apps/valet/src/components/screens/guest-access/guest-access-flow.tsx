"use client";

import { useState, type JSX } from "react";

import { useGuestAccess } from "../../../features/guest-access";
import { useOnlineStatus } from "../../../lib/connectivity/use-online-status";
import { BackHeader, Btn } from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import type { Screen } from "../../../types/employee-ui";
import { ConfirmSheet } from "./guest-access-sheets";
import { GuestAccessStatusCard } from "./guest-access-status-card";

const isDevLike = process.env.NODE_ENV !== "production";

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

  const mutationsOffline = !isOnline;
  const hasFreshLink = view.shareableUrl !== null;
  const showCreate =
    view.status === "NOT_ISSUED" ||
    view.status === "EXPIRED" ||
    view.status === "REVOKED" ||
    (view.status === "ACTIVE" && !hasFreshLink);
  const showRevoke = view.status === "ACTIVE";
  // Reissue of an ACTIVE credential replaces it; surfaced as explicit confirm.
  const reissueActive = view.status === "ACTIVE" && hasFreshLink;

  const openDevGuestApp = () => {
    if (!isDevLike || view.shareableUrl === null) return;
    window.open(view.shareableUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopy = () => {
    if (view.shareableUrl === null) return;
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
              view={view}
            />

            {showCreate && (
              <Btn
                disabled={
                  mutationsOffline || view.isMutating
                }
                label={
                  view.isMutating
                    ? t.guestAccessCreating
                    : view.status === "REVOKED"
                      ? t.guestAccessCreateNew
                      : t.guestAccessCreate
                }
                onClick={() => void create()}
              />
            )}

            {reissueActive && (
              <Btn
                disabled={mutationsOffline || view.isMutating}
                label={
                  view.isMutating ? t.guestAccessCreating : t.guestAccessReissue
                }
                onClick={() => setConfirmKind("reissue")}
                variant="secondary"
              />
            )}

            {showRevoke && (
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

            {isDevLike && hasFreshLink && (
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
