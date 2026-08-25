"use client";

import { useRouter } from "next/navigation";

import { useAuth } from "../../../features/auth/use-auth";
import { useTranslation } from "../../../i18n/locale-provider";

/**
 * Authorization-denied state. Reached when the backend denies access for an
 * authenticated staff account (e.g., no active LOCATION_MANAGER membership
 * for the requested location). Never used to fake authorization.
 */
export default function NoAccessPage() {
  const { t, isRtl } = useTranslation();
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <div className="auth-shell" dir={isRtl ? "rtl" : "ltr"}>
      <main className="card auth-card">
        <h1 className="auth-title">{t("noAccess.title")}</h1>
        <p className="auth-subtitle">{t("noAccess.subtitle")}</p>
        <button
          type="button"
          className="btn-secondary"
          style={{ width: "100%" }}
          onClick={() => {
            void signOut().then(() => router.replace("/sign-in"));
          }}
        >
          {t("noAccess.action")}
        </button>
      </main>
    </div>
  );
}
