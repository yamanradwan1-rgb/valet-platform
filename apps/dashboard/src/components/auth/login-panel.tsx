"use client";

import { useState, type FormEvent } from "react";
import type { StaffLoginRequest } from "@valet/contracts";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { VayletLogo } from "../brand/vaylet-logo";
import { Button } from "../presentation/button";
import { Panel } from "../presentation/panel";

export function LoginPanel({
  error,
  loading,
  onLogin,
}: {
  readonly error: string | null;
  readonly loading: boolean;
  readonly onLogin: (credentials: StaffLoginRequest) => Promise<void>;
}) {
  const { t } = useDashboardLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onLogin({ email, password });
    setPassword("");
  };

  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <VayletLogo />
        <div>
          <p className="eyebrow">Management</p>
          <h1>{t("loginIntro")}</h1>
        </div>
      </aside>
      <div className="auth-card-wrap">
        <Panel className="auth-card">
          <form className="stack" onSubmit={(event) => void submit(event)}>
            <div>
              <p className="eyebrow">VAYLET</p>
              <h1>{t("login")}</h1>
              <p className="muted">{t("loginIntro")}</p>
            </div>
            <div className="field">
              <label htmlFor="staff-email">{t("email")}</label>
              <input
                autoComplete="username"
                id="staff-email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
            <div className="field">
              <label htmlFor="staff-password">{t("password")}</label>
              <input
                autoComplete="current-password"
                id="staff-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <Button disabled={loading} type="submit">
              {t("login")}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
