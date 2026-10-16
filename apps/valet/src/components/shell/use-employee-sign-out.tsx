"use client";

import { useEffect, useRef, useSyncExternalStore, type JSX } from "react";
import type { StaffAuthContextValue } from "../../lib/auth/staff-auth-context";
import { useEmployeeI18n } from "./employee-i18n";

/** The interactive gate must not be held hostage by an unresponsive network. */
const LOGOUT_TIMEOUT_MS = 15_000;

type LogoutOperation = {
  readonly controller: AbortController;
  readonly timeout: ReturnType<typeof setTimeout>;
};
type LogoutSnapshot = {
  readonly pending: boolean;
  readonly failedIdentity: number | null;
  readonly failedClient: StaffAuthContextValue["client"] | null;
};
const INITIAL_LOGOUT_SNAPSHOT: LogoutSnapshot = {
  pending: false, failedIdentity: null, failedClient: null,
};

// An EmployeeApp may be remounted while an aborted request is still settling.
// Keep the same-tab sign-in fence until the underlying fetch promise settles.
let activeLogout: LogoutOperation | null = null;
let logoutSnapshot: LogoutSnapshot = INITIAL_LOGOUT_SNAPSHOT;
const subscribers = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};
const getSnapshot = (): LogoutSnapshot => logoutSnapshot;
const getServerSnapshot = (): LogoutSnapshot => INITIAL_LOGOUT_SNAPSHOT;
const isLogoutPending = (): boolean => activeLogout !== null;
function broadcast(patch: Partial<LogoutSnapshot>): void {
  logoutSnapshot = { ...logoutSnapshot, ...patch };
  for (const subscriber of subscribers) subscriber();
}

/** Keep server-revocation uncertainty visible across the auth gate transition. */
export function useEmployeeSignOut(auth: StaffAuthContextValue | null): {
  readonly onSignOut: () => void;
  readonly notice: JSX.Element | null;
  readonly busy: boolean;
  readonly isLogoutPending: () => boolean;
} {
  const { locale, t } = useEmployeeI18n();
  const ownOperation = useRef<LogoutOperation | null>(null);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const busy = snapshot.pending;
  const failed = snapshot.failedClient === auth?.client && snapshot.failedIdentity !== null &&
    (auth?.status !== "authenticated" || auth.identityGeneration === snapshot.failedIdentity);

  useEffect(() => () => {
    // Aborting on unmount prevents an old navigation's response from setting
    // the refresh cookie after a newly mounted EmployeeApp signs someone in.
    const op = ownOperation.current;
    if (op !== null) {
      clearTimeout(op.timeout);
      op.controller.abort();
    }
  }, []);

  const onSignOut = (): void => {
    if (!auth || activeLogout !== null) return;
    const identity = auth.identityGeneration;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);
    const operation = { controller, timeout };
    ownOperation.current = operation;
    activeLogout = operation;
    broadcast({ pending: true, failedIdentity: null, failedClient: null });
    // The auth client is already the provider's subscribed instance; call it
    // directly because the context's convenience logout has no signal param.
    void (async () => {
      try {
        await auth.client.logout(controller.signal);
      } catch {
        // An aborted/unknown POST does not prove server-side revocation.
        if (activeLogout === operation) {
          broadcast({ failedIdentity: identity, failedClient: auth.client });
        }
      } finally {
        clearTimeout(timeout);
        // Release the sign-in gate only after the aborted fetch has settled.
        if (ownOperation.current === operation) ownOperation.current = null;
        if (activeLogout === operation) {
          activeLogout = null;
          broadcast({ pending: false });
        }
      }
    })();
  };

  const notice = busy || failed ? (
    <div
      role={failed ? "alert" : "status"}
      className="fixed bottom-5 left-1/2 z-50 w-[min(90vw,350px)] -translate-x-1/2 rounded-2xl border border-amber-400/50 bg-navy px-4 py-3 text-sm text-white shadow-xl"
    >
      <p>{failed
        ? locale === "ar"
          ? "لم يتم تأكيد تسجيل الخروج. قد تظل جلستك نشطة."
          : "Sign-out is not confirmed. Your session may still be active."
        : locale === "ar" ? "جارٍ تسجيل الخروج…" : "Signing out…"}</p>
      {failed && (
        <button
          type="button"
          className="mt-2 font-semibold text-amber-200 underline"
          onClick={onSignOut}
        >
          {t.retry} {t.signOut}
        </button>
      )}
    </div>
  ) : null;

  return { onSignOut, notice, busy, isLogoutPending };
}
