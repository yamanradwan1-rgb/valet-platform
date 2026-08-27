"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getStaffApiBaseUrl } from "../../lib/api/api-config";
import { StaffApiClient } from "../../lib/api/staff-api-client";
import {
  MIN_REFRESH_DELAY_MS,
  computeRefreshDelayMs,
  hasSessionEnded,
} from "./access-schedule";
import {
  publishSessionEvent,
  runInAuthMutationLock,
} from "./cross-tab-session";
import {
  decideAuthRefreshResult,
  type AuthRefreshMode,
  type RefreshOutcome,
} from "./refresh-decision";
import { shouldSkipQueuedRefresh } from "./sibling-session";
import { useSiblingSessionEvents } from "./use-sibling-session";
import { runTruthfulLogout } from "./logout-lifecycle";
import type {
  AuthContextValue,
  AuthStatus,
  SessionTiming,
  StoredTokens,
} from "./auth-types";
import {
  clearRefreshTimer,
  clearStaffSession,
  claimStaffSession,
  getStaffAccessToken,
  getStaffSession,
  recoverStaffUnauthorized,
  registerRefreshTrigger,
  registerUnauthorizedRecovery,
  runSingleFlightRefresh,
  scheduleProactiveRefresh,
  setStaffSession,
  triggerStaffRefresh,
  type StaffSessionView,
} from "./auth-runtime";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [session, setSession] = useState<StaffSessionView | null>(() =>
    getStaffSession(),
  );

  // Created exactly once per provider lifetime; token injection and 401
  // recovery resolve through the module-level auth runtime.
  const [client] = useState(
    () =>
      new StaffApiClient({
        baseUrl: getStaffApiBaseUrl(),
        getAccessToken: getStaffAccessToken,
        recoverFromUnauthorized: recoverStaffUnauthorized,
      }),
  );

  const scheduleNextRefresh = useCallback((tokens: SessionTiming): void => {
    if (hasSessionEnded(Date.now(), Date.parse(tokens.sessionExpiresAt))) {
      return;
    }
    const delay = computeRefreshDelayMs(
      Date.now(),
      Date.parse(tokens.accessExpiresAt),
    );
    scheduleProactiveRefresh(delay, () => void triggerStaffRefresh());
  }, []);

  /** Applies rotated tokens for the SAME claimed session lineage. */
  const applyTokens = useCallback(
    (tokens: StoredTokens, email: string): string => {
      const view: StaffSessionView = {
        email,
        accessExpiresAt: tokens.accessExpiresAt,
        sessionExpiresAt: tokens.sessionExpiresAt,
      };
      setStaffSession(view, tokens.accessToken);
      setSession(view);
      setStatus("authenticated");
      scheduleNextRefresh(tokens);
      return tokens.accessToken;
    },
    [scheduleNextRefresh],
  );

  /** Records a NEW local claim of the browser session (login / restore). */
  const claimTokens = useCallback(
    (tokens: StoredTokens, email: string): string => {
      const view: StaffSessionView = {
        email,
        accessExpiresAt: tokens.accessExpiresAt,
        sessionExpiresAt: tokens.sessionExpiresAt,
      };
      claimStaffSession(view, tokens.accessToken, Date.now());
      setSession(view);
      setStatus("authenticated");
      scheduleNextRefresh(tokens);
      return tokens.accessToken;
    },
    [scheduleNextRefresh],
  );

  const endSession = useCallback((reason: "expired"): void => {
    clearRefreshTimer();
    clearStaffSession();
    setSession(null);
    setStatus(reason);
    // Authoritative family death concerns every tab of this browser.
    publishSessionEvent({
      occurredAtMs: Date.now(),
      reason,
      type: "ended",
    });
  }, []);

  /**
   * Single-flight refresh shared by the proactive timer, 401 recovery and
   * cold restore. Serialized across browser tabs by DEC-023's Web Locks rule
   * so two tabs can never race one rotation into a replay revocation.
   *
   * Recovery contract (see registerUnauthorizedRecovery): resolves a fresh
   * token to retry once, or `null`; on `null` the transport inspects the
   * runtime — a torn-down session (authoritative end) surfaces the original
   * expiry, a still-live session (transient failure kept alive by
   * retry-later) surfaces an honestly retryable server error instead.
   * Only an authoritative backend rejection ends the session here —
   * transient failures keep it alive and retry shortly after.
   */
  const refreshSession = useCallback(
    (mode: AuthRefreshMode): Promise<string | null> =>
      runSingleFlightRefresh(() => {
        const tokenBeforeQueue = getStaffAccessToken();
        return runInAuthMutationLock(async () => {
          // A sibling tab may have rotated while this tab waited on the
          // cross-tab lock; its broadcast already installed the newer token.
          if (
            shouldSkipQueuedRefresh({
              before: getStaffSession(),
              mode,
              tokenChangedWhileQueued:
                getStaffAccessToken() !== tokenBeforeQueue,
            })
          ) {
            return getStaffAccessToken();
          }
          const before = getStaffSession();
          let outcome: RefreshOutcome;
          try {
            outcome = { ok: true, tokens: await client.refresh() };
          } catch (error) {
            outcome = { ok: false, error };
          }
          const decision = decideAuthRefreshResult({
            after: getStaffSession(),
            before,
            mode,
            outcome,
          });
          switch (decision.action) {
            case "apply": {
              // "apply" is produced from successful outcomes only; the guard
              // keeps the compiler honest about the outcome union shape.
              if (!outcome.ok) return null;
              const accessToken = applyTokens(outcome.tokens, decision.email);
              // Only the tab that actually performed the rotation informs
              // its siblings; adopters never rebroadcast.
              publishSessionEvent({
                accessToken,
                accessExpiresAt: outcome.tokens.accessExpiresAt,
                sessionExpiresAt: outcome.tokens.sessionExpiresAt,
                type: "refreshed",
              });
              return accessToken;
            }
            case "end-expired":
              endSession("expired");
              return null;
            case "end-unauthenticated":
              clearStaffSession();
              setSession(null);
              setStatus("unauthenticated");
              return null;
            case "retry-later":
              scheduleProactiveRefresh(
                MIN_REFRESH_DELAY_MS,
                () => void triggerStaffRefresh(),
              );
              return null;
            default:
              return null;
          }
        });
      }),
    [applyTokens, client, endSession],
  );

  useEffect(() => {
    const refresh = (): Promise<string | null> => refreshSession("refresh");
    registerUnauthorizedRecovery(refresh);
    registerRefreshTrigger(refresh);
  }, [refreshSession]);

  useEffect(() => clearRefreshTimer, []);

  // Restore an existing browser session from the httpOnly refresh cookie.
  useEffect(() => {
    void refreshSession("restore");
  }, [refreshSession]);

  // Sibling-tab coordination. Arrival order is never trusted: freshness and
  // dominance rules plus adoption/teardown behavior live in
  // useSiblingSessionEvents / reduceSiblingEvent (pure, unit-tested).
  useSiblingSessionEvents({ setSession, setStatus });

  const signIn = useCallback(
    async (email: string, password: string) => {
      // Under the same browser-wide auth-mutation lock as refresh/logout:
      // a delayed in-flight refresh must not overwrite this login's cookie
      // or resurrect the previous credential family over the new principal.
      await runInAuthMutationLock(async () => {
        const tokens = await client.login({ email, password });
        claimTokens(tokens, email);
        // The shared cookie now belongs to this newer login: every sibling
        // tab ends its previous-principal UI immediately instead of silently
        // rotating onto these credentials later behind a stale identity.
        publishSessionEvent({ occurredAtMs: Date.now(), type: "replaced" });
      });
    },
    [claimTokens, client],
  );

  const signOut = useCallback(async () => {
    await runTruthfulLogout({
      clearRefreshTimer,
      clearSession: clearStaffSession,
      markFailed: () => {
        setSession(null);
        setStatus("logout-failed");
      },
      markSignedOut: () => {
        setSession(null);
        setStatus("unauthenticated");
      },
      markStarted: () => setStatus("signing-out"),
      publishSignedOut: () =>
        publishSessionEvent({
          occurredAtMs: Date.now(),
          reason: "signed-out",
          type: "ended",
        }),
      runLocked: runInAuthMutationLock,
      serverLogout: () => client.logout(),
    });
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, client, signIn, signOut }),
    [status, session, client, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
