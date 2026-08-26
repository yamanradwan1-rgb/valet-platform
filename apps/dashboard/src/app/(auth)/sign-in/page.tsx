"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "../../../features/auth/use-auth";
import { DashboardApiError } from "../../../lib/api/api-error";
import { useTranslation } from "../../../i18n/locale-provider";
import type { TranslationKey } from "../../../i18n/translations/types";

/**
 * Staff sign-in against the real backend endpoint
 * POST /v1/staff/auth/login (origin-policy and rate-limit aware).
 *
 * Prototype demo credentials are intentionally NOT rendered here.
 */
export default function SignInPage() {
  const { t, isRtl } = useTranslation();
  const { signIn, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim().length === 0) {
      setErrorKey("signIn.emailRequired");
      return;
    }
    if (password.length === 0) {
      setErrorKey("signIn.passwordRequired");
      return;
    }
    setErrorKey(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/overview");
    } catch (error) {
      setErrorKey(signInErrorKey(error));
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || status === "restoring";

  return (
    <div className="auth-shell" dir={isRtl ? "rtl" : "ltr"}>
      <main className="card auth-card">
        <img
          src="/brand/VAYLET_Logo_Dark_Background.png"
          alt="VAYLET"
          className="auth-brand"
        />
        <h1 className="auth-title">{t("signIn.title")}</h1>
        <p className="auth-subtitle">{t("signIn.subtitle")}</p>
        <form onSubmit={onSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="sign-in-email">{t("signIn.email")}</label>
            <input
              id="sign-in-email"
              className="form-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="sign-in-password">{t("signIn.password")}</label>
            <input
              id="sign-in-password"
              className="form-input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginBottom: 12 }}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? t("signIn.hidePassword") : t("signIn.showPassword")}
          </button>
          {errorKey !== null && (
            <p className="form-error" role="alert">
              {t(errorKey)}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("signIn.inProgress") : t("signIn.action")}
          </button>
        </form>
      </main>
    </div>
  );
}

function signInErrorKey(error: unknown): TranslationKey {
  if (!(error instanceof DashboardApiError)) {
    return "signIn.networkError";
  }
  switch (error.code) {
    case "STAFF_AUTHENTICATION_FAILED":
      return "signIn.invalidCredentials";
    case "STAFF_AUTHENTICATION_RATE_LIMITED":
      return "signIn.rateLimited";
    case "STAFF_AUTH_ORIGIN_NOT_ALLOWED":
      return "signIn.originNotAllowed";
    case "NETWORK_ERROR":
      return "signIn.networkError";
    default:
      return "signIn.genericError";
  }
}
