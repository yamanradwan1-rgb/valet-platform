"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { StaffLoginRequest } from "@valet/contracts";

import { StaffAuthClient } from "./staff-auth-client";
import {
  restoreStaffSession,
  type StaffSessionRestoreResult,
} from "./staff-auth-recovery";
import type { StaffAuthSession, StaffAuthStatus } from "./staff-auth-types";

export interface StaffAuthContextValue {
  readonly status: StaffAuthStatus;
  readonly session: StaffAuthSession | null;
  readonly sessionGeneration: number;
  /**
   * Stable authenticated-identity epoch derived from session-presence
   * transitions. It advances on sign-in/sign-out/definitive-invalidation and
   * is intentionally IMMUNE to same-user access-token refreshes.
   *
   * Distinction: sessionGeneration changes on EVERY session mutation
   * (including normal token refresh) and remains the stale-response gate for
   * operational context / task queue async work. Identity-scoped UI state
   * must key on identityGeneration, never on sessionGeneration.
   */
  readonly identityGeneration: number;
  readonly client: StaffAuthClient;
  readonly login: (credentials: StaffLoginRequest) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly refresh: () => Promise<boolean>;
  readonly restoreSession: () => Promise<StaffSessionRestoreResult>;
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

let defaultStaffAuthClient: StaffAuthClient | null = null;

export function getDefaultStaffAuthClient(): StaffAuthClient {
  if (!defaultStaffAuthClient) {
    defaultStaffAuthClient = new StaffAuthClient();
  }
  return defaultStaffAuthClient;
}

export interface StaffAuthProviderProps {
  readonly children: React.ReactNode;
  readonly client?: StaffAuthClient | undefined;
}

export function StaffAuthProvider({
  children,
  client: customClient,
}: StaffAuthProviderProps): React.JSX.Element {
  const client = useMemo(
    () => customClient ?? getDefaultStaffAuthClient(),
    [customClient],
  );

  const [session, setSession] = useState<StaffAuthSession | null>(() =>
    client.getSession(),
  );
  const [sessionGeneration, setSessionGeneration] = useState<number>(() =>
    client.getSessionGeneration(),
  );
  const [status, setStatus] = useState<StaffAuthStatus>("initializing");
  const [identityGeneration, setIdentityGeneration] = useState(0);
  const authenticatedPresenceRef = useRef<boolean>(
    client.getSession() !== null,
  );

  // Single funnel for every auth snapshot so the identity epoch is derived
  // from authenticated-presence transitions only.
  const applyAuthSnapshot = useCallback(
    (
      nextSession: StaffAuthSession | null,
      nextGen: number,
      nextStatus: StaffAuthStatus,
    ): void => {
      setSession(nextSession);
      setSessionGeneration(nextGen);
      setStatus(nextStatus);
      const presence = nextSession !== null;
      if (presence !== authenticatedPresenceRef.current) {
        authenticatedPresenceRef.current = presence;
        setIdentityGeneration((epoch) => epoch + 1);
      }
    },
    [],
  );

  useEffect(() => {
    // Subscribe to auth client session changes
    const unsubscribe = client.subscribe((newSession, newGen) => {
      applyAuthSnapshot(
        newSession,
        newGen,
        newSession ? "authenticated" : "unauthenticated",
      );
    });

    // Attempt silent bootstrap from HttpOnly refresh cookie.
    // A transient refresh outage keeps status "refresh-unavailable" instead
    // of claiming the user is signed out.
    let active = true;
    const applyOutcome = (result: StaffSessionRestoreResult): void => {
      if (!active) return;
      applyAuthSnapshot(
        client.getSession(),
        client.getSessionGeneration(),
        result.kind === "AUTHENTICATED"
          ? "authenticated"
          : result.kind === "DEFINITIVE_INVALID"
            ? "unauthenticated"
            : "refresh-unavailable",
      );
    };
    void restoreStaffSession(client).then(applyOutcome);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyAuthSnapshot, client]);

  const login = useCallback(
    async (credentials: StaffLoginRequest): Promise<void> => {
      await client.login(credentials);
    },
    [client],
  );

  const logout = useCallback(async (): Promise<void> => {
    await client.logout();
  }, [client]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const res = await client.tryRefresh();
    return res !== null;
  }, [client]);

  const restoreSession = useCallback(async (): Promise<StaffSessionRestoreResult> => {
    const result = await restoreStaffSession(client);
    applyAuthSnapshot(
      client.getSession(),
      client.getSessionGeneration(),
      result.kind === "AUTHENTICATED"
        ? "authenticated"
        : result.kind === "DEFINITIVE_INVALID"
          ? "unauthenticated"
          : "refresh-unavailable",
    );
    return result;
  }, [applyAuthSnapshot, client]);

  const contextValue = useMemo<StaffAuthContextValue>(
    () => ({
      status,
      session,
      sessionGeneration,
      identityGeneration,
      client,
      login,
      logout,
      refresh,
      restoreSession,
    }),
    [
      status, session, sessionGeneration, identityGeneration, client,
      login, logout, refresh, restoreSession,
    ],
  );

  // Renders children directly with ZERO visual or layout difference
  return (
    <StaffAuthContext.Provider value={contextValue}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useOptionalStaffAuth(): StaffAuthContextValue | null {
  return useContext(StaffAuthContext);
}

export function useStaffAuth(): StaffAuthContextValue {
  const context = useContext(StaffAuthContext);
  if (!context) {
    throw new Error("useStaffAuth must be used within a StaffAuthProvider");
  }
  return context;
}
