"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppShell } from "../../components/shell/app-shell";
import { FullscreenLoader } from "../../components/ui/skeleton";
import { useAuth } from "../../features/auth/use-auth";
import { LocationProvider } from "../../features/location/location-context";
import { useTranslation } from "../../i18n/locale-provider";

/**
 * Authenticated dashboard shell guard.
 *
 * - restoring: silent refresh against the httpOnly staff cookie is in flight
 * - unauthenticated: no session -> sign-in
 * - expired: refresh cookie rejected/expired -> explicit expired screen
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

  if (status !== "authenticated") {
    return <FullscreenLoader label={t("session.restoring")} />;
  }

  return (
    <LocationProvider>
      <AppShell>{children}</AppShell>
    </LocationProvider>
  );
}
