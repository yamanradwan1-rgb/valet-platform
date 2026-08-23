"use client";

import type { JSX } from "react";

import { useEmployeeI18n } from "../../shell/employee-i18n";
import { formatEmployeeDateTime } from "../../../lib/i18n/live-presentation";
import { Btn } from "../../ui/employee-primitives";
import type { GuestAccessView } from "../../../features/guest-access";
import { GuestAccessQr } from "./guest-access-qr";

/**
 * Authoritative status presentation. The QR and link surface appear only
 * when this mounted flow holds a freshly issued credential; an authoritative
 * ACTIVE state without it truthfully explains that reissue is required.
 */
export function GuestAccessStatusCard({
  copyFeedback,
  onCopy,
  view,
}: {
  readonly copyFeedback: "copied" | "failed" | null;
  readonly onCopy: () => void;
  readonly view: GuestAccessView;
}): JSX.Element | null {
  const { locale, t } = useEmployeeI18n();

  if (view.status === null) return null;

  if (view.status === "ACTIVE" && view.shareableUrl !== null) {
    return (
      <div className="bg-white rounded-2xl border border-vborder p-5 space-y-4">
        <div className="text-center">
          <p className="font-heading font-bold text-lg text-navy">
            {t.guestAccessReady}
          </p>
          <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full bg-[#EEFBF5] text-vsuccess text-[10px] font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-vsuccess flex-shrink-0" />
            {t.guestAccessActive}
          </span>
        </div>
        <GuestAccessQr alt={t.guestAccessQrAlt} url={view.shareableUrl} />
        <p className="text-muted text-xs text-center">
          {t.guestAccessShareHint}
        </p>
        <div className="flex items-center justify-between pt-3 border-t border-vborder">
          <span className="text-neutral text-sm">{t.guestAccessExpires}</span>
          <span className="font-semibold text-sm text-navy">
            {formatEmployeeDateTime(view.expiresAt, locale)}
          </span>
        </div>
        <Btn
          label={t.guestAccessCopyLink}
          onClick={onCopy}
          variant="secondary"
        />
        {copyFeedback === "copied" && (
          <p className="text-vsuccess text-xs text-center" role="status">
            {t.guestAccessCopied}
          </p>
        )}
        {copyFeedback === "failed" && (
          <p className="text-vdanger text-xs text-center" role="alert">
            {t.guestAccessCopyFailed}
          </p>
        )}
      </div>
    );
  }

  if (view.status === "ACTIVE") {
    return (
      <div className="bg-white rounded-2xl border border-vborder p-5 space-y-3">
        <p className="font-heading font-bold text-lg text-navy">
          {t.guestAccessReady}
        </p>
        <p className="text-neutral text-sm">{t.guestAccessActiveNoLink}</p>
        <div className="flex items-center justify-between pt-2 border-t border-vborder">
          <span className="text-neutral text-sm">{t.guestAccessExpires}</span>
          <span className="font-semibold text-sm text-navy">
            {formatEmployeeDateTime(view.expiresAt, locale)}
          </span>
        </div>
      </div>
    );
  }

  if (view.status === "EXPIRED") {
    return (
      <div className="bg-white rounded-2xl border border-vborder p-5 space-y-2">
        <p className="font-heading font-bold text-lg text-navy">
          {t.guestAccessExpired}
        </p>
        <div className="flex items-center justify-between pt-2 border-t border-vborder">
          <span className="text-neutral text-sm">{t.guestAccessExpires}</span>
          <span className="font-semibold text-sm text-navy">
            {formatEmployeeDateTime(view.expiresAt, locale)}
          </span>
        </div>
      </div>
    );
  }

  if (view.status === "REVOKED") {
    return (
      <div className="bg-white rounded-2xl border border-vborder p-5 space-y-2">
        <p className="font-heading font-bold text-lg text-navy">
          {t.guestAccessRevoked}
        </p>
        <p className="text-neutral text-sm">{t.guestAccessRevokedHint}</p>
        <div className="flex items-center justify-between pt-2 border-t border-vborder">
          <span className="text-neutral text-sm">{t.guestAccessRevoked}</span>
          <span className="font-semibold text-sm text-navy">
            {formatEmployeeDateTime(view.revokedAt, locale)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-vborder p-5 space-y-2">
      <p className="font-heading font-bold text-lg text-navy">
        {t.guestAccessTitle}
      </p>
      <p className="text-neutral text-sm">{t.guestAccessNotCreated}</p>
    </div>
  );
}
