"use client";

import { staffInvitationTokenSchema } from "@valet/contracts";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { Button } from "../../../components/presentation/button";
import { Panel } from "../../../components/presentation/panel";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { useDashboardTheme } from "../../../lib/theme/theme-provider";
import { ContextHelp } from "../../help/context-help";
import helpSlot from "../../help/help-slot.module.css";
import {
  activateStaffAccount,
  StaffActivationPageError,
} from "./staff-activation-api";
import { staffOnboardingCopy } from "./staff-onboarding-copy";

export function StaffActivationPage() {
  const { locale, setLocale } = useDashboardLocale();
  const { theme, setTheme } = useDashboardTheme();
  const t = staffOnboardingCopy(locale);
  const captured = useRef(false);
  const token = useRef<string | null>(null);
  const submitting = useRef(false);
  const active = useRef(true);
  const completedSignInRef = useRef<HTMLAnchorElement>(null);
  const stableHeadingRef = useRef<HTMLHeadingElement>(null);
  const helpFocusFallback = useMemo<RefObject<HTMLElement | null>>(() => ({
    get current() { return completedSignInRef.current ?? stableHeadingRef.current; },
  }), []);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [available, setAvailable] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<"FAILED" | "LIMITED" | null>(null);
  const [retryUntil, setRetryUntil] = useState(0);

  useLayoutEffect(() => {
    function capture() {
      request.current?.abort();
      generation.current++;
      submitting.current = false;
      setBusy(false);
      token.current = null;
      setAvailable(false);
      setComplete(false);
      setPassword("");
      setError(null);
      setRetryUntil(0);
      const entries = [
        ...new URLSearchParams(window.location.hash.slice(1)).entries(),
      ];
      // Always remove the fragment, including malformed/duplicate credentials.
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
      if (entries.length !== 1 || entries[0]?.[0] !== "invite") return;
      const parsed = staffInvitationTokenSchema.safeParse(entries[0][1]);
      if (parsed.success) {
        token.current = parsed.data;
        setAvailable(true);
      }
    }
    if (!captured.current) {
      captured.current = true;
      capture();
    }
    window.addEventListener("hashchange", capture);
    return () => window.removeEventListener("hashchange", capture);
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setTimeout(
      () => setRetryUntil(0),
      Math.max(0, retryUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [retryUntil]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !token.current || retryUntil > Date.now()) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    request.current = new AbortController();
    const submittedGeneration = generation.current;
    const current = () =>
      active.current && generation.current === submittedGeneration;
    try {
      await activateStaffAccount(
        token.current,
        password,
        request.current.signal,
      );
      if (!current()) return;
      token.current = null;
      setPassword("");
      setComplete(true);
    } catch (reason) {
      if (!current()) return;
      if (
        reason instanceof StaffActivationPageError &&
        reason.retryAfter !== null
      ) {
        setRetryUntil(Date.now() + reason.retryAfter * 1000);
        setError("LIMITED");
      } else setError("FAILED");
    } finally {
      if (current()) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className="auth-screen" style={{ gridTemplateColumns: "1fr" }}>
      <div className="auth-card-wrap">
        <Panel className="auth-card">
          <div className="stack">
            <div className="actions">
              <Button
                variant="secondary"
                onClick={() => setLocale(locale === "en" ? "ar" : "en")}
              >
                EN / العربية
              </Button>
              <Button
                variant="secondary"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? "Dark / داكن" : "Light / فاتح"}
              </Button>
            </div>
            <p className="eyebrow">VAYLET</p>
            <h1 aria-label={complete ? t.complete : t.activate} className={helpSlot.anchor} ref={stableHeadingRef} tabIndex={-1}>
              {complete ? t.complete : t.activate}
              <span className={helpSlot.corner}>
                <ContextHelp helpKey="activation.page" locale={locale} returnFocusFallbackRef={helpFocusFallback} scopeIdentity={complete ? "activation-complete" : available ? "activation-form" : "activation-unavailable"} />
              </span>
            </h1>
            {complete ? (
              <Link href="/" ref={completedSignInRef}>{t.signIn}</Link>
            ) : available ? (
              <form className="stack" onSubmit={(event) => void submit(event)}>
                <p className="muted" id="activation-guidance">
                  {t.guidance}
                </p>
                <p className="muted">{t.passwordPolicy}</p>
                <div className={`field ${helpSlot.anchor}`}>
                  <label htmlFor="activation-password">{t.password}</label>
                  <span className={helpSlot.corner}>
                    <ContextHelp helpKey="activation.invitation" locale={locale} returnFocusFallbackRef={helpFocusFallback} scopeIdentity="activation-form" />
                  </span>
                  <input
                    id="activation-password"
                    aria-describedby="activation-guidance activation-feedback"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <p
                  id="activation-feedback"
                  className="error-text"
                  role="status"
                >
                  {error === "LIMITED"
                    ? t.rateLimited
                    : error === "FAILED"
                      ? t.failed
                      : ""}
                </p>
                <Button type="submit" disabled={busy || retryUntil > 0}>
                  {busy ? t.loading : t.activate}
                </Button>
              </form>
            ) : (
              <p className="muted">{t.missing}</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
