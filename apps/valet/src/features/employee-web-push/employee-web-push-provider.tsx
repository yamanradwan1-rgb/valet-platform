"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useEmployeeI18n } from "../../components/shell/employee-i18n";
import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import type { EmployeePushCapabilityState } from "./employee-push-capability";
import { EmployeeWebPushApi } from "./employee-push-api";
import { BrowserEmployeePushRuntime } from "./employee-push-browser";
import { readEmployeePushPublicConfig } from "./employee-push-config";
import { EmployeePushManager } from "./employee-push-manager";
import { createBrowserEmployeePushStorage } from "./employee-push-storage";
import { clearEmployeePushIdentities } from "./employee-push-identity-bridge";

interface EmployeeWebPushContextValue {
  readonly cleanupBeforeLogout: () => Promise<void>;
  readonly enable: () => Promise<void>;
  readonly state: EmployeePushCapabilityState;
}

const EmployeeWebPushContext =
  createContext<EmployeeWebPushContextValue | null>(null);

export function EmployeeWebPushProvider({
  children,
}: {
  readonly children: ReactNode;
}): React.JSX.Element {
  const auth = useStaffAuth();
  const { locale } = useEmployeeI18n();
  const [state, setState] =
    useState<EmployeePushCapabilityState>("UNAVAILABLE");
  const managerRef = useRef<EmployeePushManager | null>(null);
  const config = useMemo(() => readEmployeePushPublicConfig(), []);
  const previousIdentityGeneration = useRef(auth.identityGeneration);

  useEffect(() => {
    if (previousIdentityGeneration.current !== auth.identityGeneration) {
      clearEmployeePushIdentities();
      previousIdentityGeneration.current = auth.identityGeneration;
    }
  }, [auth.identityGeneration]);

  const manager = useCallback((): EmployeePushManager => {
    managerRef.current ??= new EmployeePushManager({
      api: new EmployeeWebPushApi(
        new EmployeeApiClient({ authClient: auth.client }),
      ),
      config,
      runtime: new BrowserEmployeePushRuntime(),
      storage: createBrowserEmployeePushStorage(),
    });
    return managerRef.current;
  }, [auth.client, config]);

  useEffect(() => {
    let current = true;
    if (auth.status === "authenticated") {
      void manager()
        .reconcile(locale)
        .then((next) => current && setState(next));
    } else if (auth.status === "unauthenticated" && managerRef.current) {
      void managerRef.current.cleanupAfterAuthenticationEnd().then(() => {
        if (current) setState("UNAVAILABLE");
      });
    }
    return () => {
      current = false;
    };
  }, [auth.identityGeneration, auth.status, locale, manager]);

  useEffect(() => {
    if (auth.status !== "authenticated") return undefined;
    let current = true;
    const reconcile = (): void => {
      void manager()
        .reconcile(locale)
        .then((next) => current && setState(next));
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") reconcile();
    };
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      current = false;
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [auth.status, locale, manager]);

  const enable = useCallback(async (): Promise<void> => {
    if (auth.status !== "authenticated") return;
    setState(await manager().enable(locale));
  }, [auth.status, locale, manager]);

  const cleanupBeforeLogout = useCallback(async (): Promise<void> => {
    if (managerRef.current) await managerRef.current.cleanupBeforeLogout();
  }, []);

  return (
    <EmployeeWebPushContext.Provider
      value={{ cleanupBeforeLogout, enable, state }}
    >
      {children}
    </EmployeeWebPushContext.Provider>
  );
}

export function useEmployeeWebPush(): EmployeeWebPushContextValue {
  const context = useContext(EmployeeWebPushContext);
  if (!context) {
    return {
      cleanupBeforeLogout: async () => undefined,
      enable: async () => undefined,
      state: "UNAVAILABLE",
    };
  }
  return context;
}
