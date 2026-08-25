"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "../../components/shell/app-shell";
import { FullscreenLoader } from "../../components/ui/skeleton";
import { useTranslation } from "../../i18n/locale-provider";
import { DashboardApiError } from "../../lib/api/api-error";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocations } from "./location-context";

/**
 * D2-005 shell gate for the production authorized-location bootstrap.
 *
 * - loading:   silent bootstrap; no location is ever faked in the shell
 * - error:     retryable failure screen. A session-expired failure is NOT a
 *              location problem — the auth runtime already owns refresh and
 *              the dashboard layout redirects to /session-expired, so only
 *              the restoring loader renders here.
 * - ready/0:   authenticated account without authorized locations follows
 *              the existing /no-access posture (never a fake location).
 * - ready/>=1: operational shell with real authorized context.
 */
export function LocationGate({ children }: { children: ReactNode }) {
  const { status, locations, error, reloadLocations } = useDashboardLocations();
  const { t } = useTranslation();
  const router = useRouter();
  const { status: authStatus } = useAuth();

  const zeroAuthorized = status === "ready" && locations.length === 0;

  useEffect(() => {
    if (zeroAuthorized) router.replace("/no-access");
  }, [zeroAuthorized, router]);

  if (status === "loading") {
    return <FullscreenLoader label={t("location.loadingLocations")} />;
  }

  if (status === "error") {
    // Session expiry stays owned by StaffApiClient/AuthProvider; avoid a
    // misleading location retry control while the shell redirects.
    if (
      error instanceof DashboardApiError &&
      (error.kind === "session-expired" || authStatus !== "authenticated")
    ) {
      return <FullscreenLoader label={t("session.restoring")} />;
    }
    return (
      <div className="auth-shell">
        <main className="card auth-card">
          <h1 className="auth-title">{t("location.loadFailedTitle")}</h1>
          <p className="auth-subtitle">{t("location.loadFailed")}</p>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: "100%" }}
            onClick={reloadLocations}
          >
            {t("common.retry")}
          </button>
        </main>
      </div>
    );
  }

  if (zeroAuthorized) {
    return <FullscreenLoader label={t("location.loadingLocations")} />;
  }

  return <AppShell>{children}</AppShell>;
}
