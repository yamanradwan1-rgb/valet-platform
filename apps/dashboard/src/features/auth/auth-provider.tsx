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
import { DashboardApiError } from "../../lib/api/api-error";
import { StaffApiClient } from "../../lib/api/staff-api-client";
import { computeRefreshDelayMs, hasSessionEnded } from "./access-schedule";
import {
  clearRefreshTimer,
  clearStaffSession,
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

export type AuthStatus =
  "restoring" | "authenticated" | "unauthenticated" | "expired";

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly session: StaffSessionView | null;
  readonly client: StaffApiClient;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface StoredTokens {
  accessToken: string;
  accessExpiresAt: string;
  sessionExpiresAt: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isSessionOver(error: unknown): boolean {
  return (
    error instanceof DashboardApiError &&
    (error.kind === "session-expired" ||
      error.code === "STAFF_AUTHENTICATION_FAILED")
  );
}

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

  const storeTokens = useCallback((tokens: StoredTokens, email: string) => {
    const view: StaffSessionView = {
      email,
      accessExpiresAt: tokens.accessExpiresAt,
      sessionExpiresAt: tokens.sessionExpiresAt,
    };
    setStaffSession(view, tokens.accessToken);
    setSession(view);
  }, []);

  /**
   * Single-flight refresh shared by the proactive timer and 401 recovery.
   * Resolves with the new access token, or null when the session is over.
   */
  const refreshSession = useCallback((): Promise<string | null> => {
    return runSingleFlightRefresh(async () => {
      try {
        const current = getStaffSession();
        const tokens = await client.refresh();
        if (current === null) return null;
        storeTokens(tokens, current.email);
        setStatus("authenticated");
        scheduleNextRefresh(tokens);
        return tokens.accessToken;
      } catch (error) {
        clearStaffSession();
        setSession(null);
        setStatus(isSessionOver(error) ? "expired" : "unauthenticated");
        return null;
      }
    });
  }, [client, storeTokens]);

  useEffect(() => {
    registerUnauthorizedRecovery(refreshSession);
    registerRefreshTrigger(refreshSession);
  }, [refreshSession]);

  useEffect(() => clearRefreshTimer, []);

  function scheduleNextRefresh(tokens: StoredTokens): void {
    if (hasSessionEnded(Date.now(), Date.parse(tokens.sessionExpiresAt))) {
      return;
    }
    const delay = computeRefreshDelayMs(
      Date.now(),
      Date.parse(tokens.accessExpiresAt),
    );
    scheduleProactiveRefresh(delay, () => void triggerStaffRefresh());
  }

  // Restore an existing browser session from the httpOnly refresh cookie.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tokens = await client.refresh();
        if (cancelled) return;
        storeTokens(tokens, "");
        setStatus("authenticated");
        scheduleNextRefresh(tokens);
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, storeTokens]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const tokens = await client.login({ email, password });
      storeTokens(tokens, email);
      setStatus("authenticated");
      scheduleNextRefresh(tokens);
    },
    [client, storeTokens],
  );

  const signOut = useCallback(async () => {
    clearRefreshTimer();
    try {
      await client.logout();
    } catch {
      // Logout is best-effort; on success the server clears the cookie and a
      // stale cookie simply expires together with the session.
    }
    clearStaffSession();
    setSession(null);
    setStatus("unauthenticated");
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
