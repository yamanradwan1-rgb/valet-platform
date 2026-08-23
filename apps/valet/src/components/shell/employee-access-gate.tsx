"use client";

import { useState, type JSX } from "react";
import type { StaffLoginRequest } from "@valet/contracts";

import { LocaleToggle, useEmployeeI18n } from "./employee-i18n";

export type EmployeeAccessGateProps =
  | { readonly phase: "initializing" }
  | {
      readonly isRetryingRestore?: boolean | undefined;
      readonly onRetryRestore: () => void;
      readonly phase: "refresh-unavailable";
      readonly restoreMessage?: string | null | undefined;
    }
  | {
      readonly isSigningIn?: boolean | undefined;
      readonly loginError?: string | null | undefined;
      readonly onLogin: (credentials: StaffLoginRequest) => void;
      readonly phase: "unauthenticated";
    };

function AccessShell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center px-6 pb-10"
      style={{
        background:
          "radial-gradient(ellipse at 55% 0%, #0B2D6E 0%, #07111F 65%)",
      }}
    >
      <img
        src="/brand/VAYLET_Logo_Dark_Background.png"
        alt="VAYLET"
        className="h-9 object-contain mb-12"
      />
      {children}
    </div>
  );
}

/**
 * Truthful access gate for the production Employee app. LocaleToggle is
 * rendered pre-auth so the user can switch EN/AR before signing in.
 */
export function EmployeeAccessGate(
  props: EmployeeAccessGateProps,
): JSX.Element {
  const { locale, t } = useEmployeeI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (props.phase === "initializing") {
    return (
      <AccessShell>
        <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin mb-6" />
        <p className="text-white font-semibold text-sm">{t.checkingSession}</p>
      </AccessShell>
    );
  }

  if (props.phase === "refresh-unavailable") {
    return (
      <AccessShell>
        <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 mb-6 backdrop-blur-sm">
          <p className="font-heading font-bold text-white text-xl mb-2">
            {t.connectionIssue}
          </p>
          <p className="text-muted text-sm leading-relaxed">
            {locale === "ar"
              ? t.signInUnavailable
              : (props.restoreMessage ?? t.signInUnavailable)}
          </p>
        </div>
        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={props.onRetryRestore}
            disabled={props.isRetryingRestore === true}
            className="w-full h-14 bg-vblue text-white font-bold text-base rounded-2xl flex items-center justify-center active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-vblue/30 disabled:opacity-60"
          >
            {props.isRetryingRestore === true ? t.retrying : t.retry}
          </button>
        </div>
        <div className="mt-4">
          <LocaleToggle />
        </div>
      </AccessShell>
    );
  }

  const { isSigningIn = false, loginError = null, onLogin } = props;

  return (
    <AccessShell>
      <form
        className="w-full"
        onSubmit={(event) => {
          event.preventDefault();
          if (isSigningIn) return;
          onLogin({ email: email.trim(), password });
        }}
      >
        <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 mb-6 backdrop-blur-sm">
          <p className="font-heading font-bold text-white text-xl mb-5">
            {t.staffSignIn}
          </p>
          <label className="block text-muted text-xs font-bold uppercase tracking-wider mb-2">
            {t.workEmail}
          </label>
          <input
            autoComplete="username"
            className="w-full h-12 rounded-xl bg-white/[0.08] border border-white/15 px-4 text-white text-sm outline-none focus:border-vblue transition-colors mb-4"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <label className="block text-muted text-xs font-bold uppercase tracking-wider mb-2">
            {t.password}
          </label>
          <input
            autoComplete="current-password"
            className="w-full h-12 rounded-xl bg-white/[0.08] border border-white/15 px-4 text-white text-sm outline-none focus:border-vblue transition-colors"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        {loginError !== null && loginError !== "" && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-400/30 rounded-xl text-red-300 text-xs">
            {locale === "ar" ? t.operationFailed : loginError}
          </div>
        )}
        <button
          type="submit"
          disabled={isSigningIn}
          className="w-full h-14 bg-vblue text-white font-bold text-base rounded-2xl flex items-center justify-center active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-vblue/30 disabled:opacity-60"
        >
          {isSigningIn ? t.signingIn : t.signIn}
        </button>
      </form>
      <div className="mt-4">
        <LocaleToggle />
      </div>
    </AccessShell>
  );
}
