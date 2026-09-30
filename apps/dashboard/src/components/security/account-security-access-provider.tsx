"use client";

import type { StaffMfaStateValue } from "@valet/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { DashboardMfaClient } from "../../lib/mfa/dashboard-mfa-client";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";

export type AccountSecurityAccessSnapshot =
  | { readonly status: "checking"; readonly state: null; readonly error: null }
  | { readonly status: "eligible"; readonly state: StaffMfaStateValue; readonly error: null }
  | { readonly status: "ineligible"; readonly state: null; readonly error: DashboardApiError }
  | { readonly status: "error"; readonly state: null; readonly error: unknown };

interface AccountSecurityAccessContextValue {
  readonly client: DashboardMfaClient;
  readonly snapshot: AccountSecurityAccessSnapshot;
  readonly publishState: (state: StaffMfaStateValue) => void;
  readonly refreshState: () => Promise<AccountSecurityAccessSnapshot>;
}

const AccountSecurityAccessContext =
  createContext<AccountSecurityAccessContextValue | null>(null);

const checkingSnapshot: AccountSecurityAccessSnapshot = {
  error: null,
  state: null,
  status: "checking",
};

interface BoundAccessSnapshot {
  readonly key: string;
  readonly snapshot: AccountSecurityAccessSnapshot;
}

interface InFlightAccessRead {
  readonly authKey: string;
  readonly promise: Promise<AccountSecurityAccessSnapshot>;
  readonly requestId: symbol;
}

function deniedSnapshot(error: unknown): AccountSecurityAccessSnapshot {
  if (
    error instanceof DashboardApiError &&
    error.code === "MFA_ENROLLMENT_NOT_AVAILABLE" &&
    error.status === 409
  ) {
    return { error, state: null, status: "ineligible" };
  }
  return { error, state: null, status: "error" };
}

export function AccountSecurityAccessProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const auth = useStaffAuth();
  const api = useMemo(
    () => new DashboardApiClient({ auth: auth.client }),
    [auth.client],
  );
  const client = useMemo(() => new DashboardMfaClient(api), [api]);
  const [guard] = useState(() => new ScopeGenerationGuard());
  const currentAuthKey = `${auth.identityGeneration}:${auth.sessionGeneration}`;
  const [boundSnapshot, setBoundSnapshot] = useState<BoundAccessSnapshot>({
    key: "",
    snapshot: checkingSnapshot,
  });
  const [readRevision, setReadRevision] = useState(0);
  const authKeyRef = useRef(currentAuthKey);
  const authenticatedRef = useRef(auth.status === "authenticated");
  const inFlightRef = useRef<InFlightAccessRead | null>(null);
  const snapshot =
    auth.status === "authenticated" && boundSnapshot.key === currentAuthKey
      ? boundSnapshot.snapshot
      : checkingSnapshot;

  useLayoutEffect(() => {
    authKeyRef.current = currentAuthKey;
    authenticatedRef.current = auth.status === "authenticated";
  }, [auth.identityGeneration, auth.status, currentAuthKey]);

  const refreshState = useCallback(async () => {
    const startAuthKey = authKeyRef.current;
    if (inFlightRef.current?.authKey === startAuthKey) {
      return inFlightRef.current.promise;
    }
    const ticket = guard.begin();
    const requestId = Symbol("account-security-state");
    setBoundSnapshot({ key: startAuthKey, snapshot: checkingSnapshot });
    let crossedAuthBoundary = false;
    const active = (async (): Promise<AccountSecurityAccessSnapshot> => {
      try {
        const response = await client.state(ticket.signal, (generation) => {
          if (inFlightRef.current?.requestId !== requestId) return;
          inFlightRef.current = {
            ...inFlightRef.current,
            authKey: `${generation.identityGeneration}:${generation.sessionGeneration}`,
          };
        });
        const next: AccountSecurityAccessSnapshot = {
          error: null,
          state: response.state,
          status: "eligible",
        };
        if (guard.isCurrent(ticket)) {
          setBoundSnapshot({ key: authKeyRef.current, snapshot: next });
        }
        return next;
      } catch (error: unknown) {
        crossedAuthBoundary = startAuthKey !== authKeyRef.current;
        if (crossedAuthBoundary && authenticatedRef.current) {
          return checkingSnapshot;
        }
        const next = deniedSnapshot(error);
        if (guard.isCurrent(ticket)) {
          setBoundSnapshot({ key: authKeyRef.current, snapshot: next });
        }
        return next;
      } finally {
        if (inFlightRef.current?.requestId === requestId) {
          inFlightRef.current = null;
        }
        if (crossedAuthBoundary && authenticatedRef.current) {
          setReadRevision((value) => value + 1);
        }
      }
    })();
    inFlightRef.current = {
      authKey: startAuthKey,
      promise: active,
      requestId,
    };
    return active;
  }, [client, guard]);

  const publishState = useCallback(
    (state: StaffMfaStateValue) => {
      guard.invalidate();
      setBoundSnapshot({
        key: authKeyRef.current,
        snapshot: { error: null, state, status: "eligible" },
      });
    },
    [guard],
  );

  useEffect(() => {
    if (auth.status !== "authenticated") {
      guard.invalidate();
      return;
    }
    if (inFlightRef.current?.authKey !== currentAuthKey) {
      void refreshState();
    }
  }, [
    auth.identityGeneration,
    auth.status,
    currentAuthKey,
    guard,
    readRevision,
    refreshState,
  ]);

  useEffect(() => () => guard.invalidate(), [guard]);

  const value = useMemo(
    () => ({ client, publishState, refreshState, snapshot }),
    [client, publishState, refreshState, snapshot],
  );
  return (
    <AccountSecurityAccessContext.Provider value={value}>
      {children}
    </AccountSecurityAccessContext.Provider>
  );
}

export function useAccountSecurityAccess(): AccountSecurityAccessContextValue {
  const value = useContext(AccountSecurityAccessContext);
  if (!value) {
    throw new Error(
      "useAccountSecurityAccess requires AccountSecurityAccessProvider",
    );
  }
  return value;
}
