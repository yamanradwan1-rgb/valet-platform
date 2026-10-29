"use client";

import type { StaffAuthAccessResponse, StaffLoginRequest } from "@valet/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  STAFF_LOGOUT_UNCONFIRMED_KEY,
  StaffAuthClient,
  type StaffAuthSession,
} from "./staff-auth-client";
import { refreshFailureStatus, type StaffAuthStatus } from "./staff-auth-status";

export type { StaffAuthStatus } from "./staff-auth-status";

export interface StaffAuthContextValue {
  readonly client: StaffAuthClient;
  readonly status: StaffAuthStatus;
  readonly session: StaffAuthSession | null;
  readonly sessionGeneration: number;
  readonly identityGeneration: number;
  login(credentials: StaffLoginRequest, signal?: AbortSignal): Promise<StaffAuthAccessResponse>;
  logout(signal?: AbortSignal): Promise<void>;
  refresh(signal?: AbortSignal): Promise<StaffAuthAccessResponse>;
}

interface StaffAuthSnapshot {
  readonly status: StaffAuthStatus;
  readonly session: StaffAuthSession | null;
  readonly sessionGeneration: number;
  readonly identityGeneration: number;
}

interface StaffAuthProviderProps {
  readonly children: ReactNode;
  readonly client?: StaffAuthClient;
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

function snapshotFromClient(
  client: StaffAuthClient,
  status: StaffAuthStatus,
): StaffAuthSnapshot {
  return {
    status,
    session: client.getSession(),
    sessionGeneration: client.getSessionGeneration(),
    identityGeneration: client.getIdentityGeneration(),
  };
}

function statusAfterRefreshError(client: StaffAuthClient, error: unknown): StaffAuthStatus {
  return client.hasUnconfirmedLogout() ? "logout-unconfirmed" : refreshFailureStatus(error);
}

export function StaffAuthProvider({ children, client: providedClient }: StaffAuthProviderProps) {
  const [client] = useState(() => providedClient ?? new StaffAuthClient());
  const [snapshot, setSnapshot] = useState<StaffAuthSnapshot>(() =>
    snapshotFromClient(client, client.getSession() === null ? "initializing" : "authenticated"),
  );

  useEffect(() => {
    let active = true;
    const onStorage = (event: StorageEvent) => {
      if (event.key === STAFF_LOGOUT_UNCONFIRMED_KEY && event.newValue === "1") {
        client.observeExternalLogout();
      }
    };
    window.addEventListener("storage", onStorage);
    const unsubscribe = client.subscribe((session, sessionGeneration, identityGeneration) => {
      if (!active) return;
      setSnapshot({
        status: session === null
          ? client.hasUnconfirmedLogout()
            ? "logout-unconfirmed"
            : "unauthenticated"
          : "authenticated",
        session,
        sessionGeneration,
        identityGeneration,
      });
    });

    if (client.getSession() === null && client.hasUnconfirmedLogout()) {
      void Promise.resolve().then(() => {
        if (active) setSnapshot(snapshotFromClient(client, "logout-unconfirmed"));
      });
    } else if (client.getSession() === null && !client.canRestoreSessionFromCookie()) {
      void Promise.resolve().then(() => {
        if (active) setSnapshot(snapshotFromClient(client, "unauthenticated"));
      });
    } else if (client.getSession() === null) {
      void client.refresh().then(
        () => {
          if (active) setSnapshot(snapshotFromClient(client, "authenticated"));
        },
        (error: unknown) => {
          if (active) setSnapshot(snapshotFromClient(client, statusAfterRefreshError(client, error)));
        },
      );
    }

    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      unsubscribe();
    };
  }, [client]);

  const login = useCallback(
    async (credentials: StaffLoginRequest, signal?: AbortSignal) => {
      const result = await client.login(credentials, signal);
      setSnapshot(snapshotFromClient(client, "authenticated"));
      return result;
    },
    [client],
  );

  const logout = useCallback(
    async (signal?: AbortSignal) => {
      try {
        await client.logout(signal);
        setSnapshot(snapshotFromClient(client, "unauthenticated"));
      } catch (error: unknown) {
        setSnapshot(snapshotFromClient(client, "logout-unconfirmed"));
        throw error;
      }
    },
    [client],
  );

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await client.refresh(signal);
        setSnapshot(snapshotFromClient(client, "authenticated"));
        return result;
      } catch (error: unknown) {
        setSnapshot(snapshotFromClient(client, statusAfterRefreshError(client, error)));
        throw error;
      }
    },
    [client],
  );

  const value = useMemo<StaffAuthContextValue>(
    () => ({ client, ...snapshot, login, logout, refresh }),
    [client, login, logout, refresh, snapshot],
  );

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth(): StaffAuthContextValue {
  const context = useContext(StaffAuthContext);
  if (context === null) throw new Error("useStaffAuth must be used within StaffAuthProvider.");
  return context;
}
