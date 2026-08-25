"use client";

import { useRouter } from "next/navigation";

import { useTranslation } from "../../../i18n/locale-provider";

export default function SessionExpiredPage() {
  const { t, isRtl } = useTranslation();
  const router = useRouter();
  return (
    <div className="auth-shell" dir={isRtl ? "rtl" : "ltr"}>
      <main className="card auth-card">
        <h1 className="auth-title">{t("expired.title")}</h1>
        <p className="auth-subtitle">{t("expired.subtitle")}</p>
        <button
          type="button"
          className="btn-primary"
          style={{ width: "100%" }}
          onClick={() => router.replace("/sign-in")}
        >
          {t("expired.action")}
        </button>
      </main>
    </div>
  );
}
