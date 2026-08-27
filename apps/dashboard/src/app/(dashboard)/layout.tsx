"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { FullscreenLoader } from "../../components/ui/skeleton";
import { useAuth } from "../../features/auth/use-auth";
import { SignOutRecovery } from "../../features/auth/sign-out-recovery";
import { LocationGate } from "../../features/location/location-gate";
import { LocationProvider } from "../../features/location/location-context";
import { useTranslation } from "../../i18n/locale-provider";

/**
 * Authenticated dashboard shell guard.
 *
 * - restoring: silent refresh against the httpOnly staff cookie is in flight
 * - unauthenticated: no session -> sign-in
 * - expired: refresh cookie rejected/expired -> explicit expired screen
 *
 * After authentication, D2-005 LocationGate runs the production
 * authorized-location bootstrap (loading / no-access / failure / ready).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = encodeURIComponent(pathname ?? "/overview");
      router.replace(`/sign-in?next=${next}`);
    } else if (status === "expired") {
      router.replace("/session-expired");
    }
  }, [status, pathname, router]);

  if (status === "signing-out" || status === "logout-failed") {
    return <SignOutRecovery />;
  }

  if (status !== "authenticated") {
    return <FullscreenLoader label={t("session.restoring")} />;
  }

  return (
    <LocationProvider>
      <LocationGate>{children}</LocationGate>
    </LocationProvider>
  );
}
