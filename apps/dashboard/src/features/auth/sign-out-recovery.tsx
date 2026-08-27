"use client";

import { useAuth } from "./use-auth";
import { useTranslation } from "../../i18n/locale-provider";

/** Blocks privileged UI while server-side logout remains unconfirmed. */
export function SignOutRecovery() {
  const { signOut, status } = useAuth();
  const { isRtl, t } = useTranslation();
  const pending = status === "signing-out";

  if (pending) {
    return (
      <div className="auth-shell" dir={isRtl ? "rtl" : "ltr"}>
        <main className="card auth-card" aria-live="polite">
          <h1 className="auth-title">{t("signOut.inProgress")}</h1>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-shell" dir={isRtl ? "rtl" : "ltr"}>
      <main className="card auth-card">
        <h1 className="auth-title">{t("signOut.failedTitle")}</h1>
        <p className="auth-subtitle" role="alert">
          {t("signOut.failedMessage")}
        </p>
        <button
          type="button"
          className="btn-secondary"
          style={{ width: "100%" }}
          onClick={() => void signOut().catch(() => undefined)}
        >
          {t("signOut.retry")}
        </button>
      </main>
    </div>
  );
}
