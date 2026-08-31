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

import { useTranslation } from "../../i18n/use-translation";
import { useGuestAuth } from "../auth/guest-auth-context";
import type { CustomerPushCapabilityState } from "./customer-push-capability";
import { CustomerWebPushApi } from "./customer-push-api";
import { BrowserCustomerPushRuntime } from "./customer-push-browser";
import { readCustomerPushPublicConfig } from "./customer-push-config";
import { CustomerPushManager } from "./customer-push-manager";
import { createBrowserCustomerPushStorage } from "./customer-push-storage";

interface CustomerWebPushValue {
  readonly dismissOffer: () => void;
  readonly enable: () => Promise<void>;
  readonly offerAfterRetrieval: () => void;
  readonly offerVisible: boolean;
  readonly state: CustomerPushCapabilityState;
}

const CustomerWebPushContext = createContext<CustomerWebPushValue | null>(null);

export function CustomerWebPushProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { client } = useGuestAuth();
  const { locale } = useTranslation();
  const config = useMemo(() => readCustomerPushPublicConfig(), []);
  const [state, setState] =
    useState<CustomerPushCapabilityState>("UNAVAILABLE");
  const [offerVisible, setOfferVisible] = useState(false);
  const managerRef = useRef<CustomerPushManager | null>(null);
  const clientRef = useRef(client);
  const transitionTail = useRef<Promise<void>>(Promise.resolve());

  const createManager = useCallback(
    () =>
      client
        ? new CustomerPushManager({
            api: new CustomerWebPushApi(client),
            config,
            runtime: new BrowserCustomerPushRuntime(),
            storage: createBrowserCustomerPushStorage(),
          })
        : null,
    [client, config],
  );

  useEffect(() => {
    let current = true;
    transitionTail.current = transitionTail.current.then(async () => {
      if (clientRef.current !== client) {
        await managerRef.current?.cleanupCurrentContext();
        managerRef.current = null;
        clientRef.current = client;
        setOfferVisible(false);
      }
      if (!client) {
        if (current) setState("UNAVAILABLE");
        return;
      }
      managerRef.current ??= createManager();
      const next = await managerRef.current!.reconcile(locale);
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [client, createManager, locale]);

  useEffect(() => {
    if (!client) return undefined;
    const reconcile = (): void => {
      void managerRef.current?.reconcile(locale).then(setState);
    };
    const visible = (): void => {
      if (document.visibilityState === "visible") reconcile();
    };
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, locale]);

  const enable = useCallback(async () => {
    if (!client || !managerRef.current) return;
    setState(await managerRef.current.enable(locale));
  }, [client, locale]);

  const dismissOffer = useCallback(() => setOfferVisible(false), []);
  const offerAfterRetrieval = useCallback(() => setOfferVisible(true), []);

  const value = useMemo<CustomerWebPushValue>(
    () => ({
      dismissOffer,
      enable,
      offerAfterRetrieval,
      offerVisible,
      state,
    }),
    [dismissOffer, enable, offerAfterRetrieval, offerVisible, state],
  );

  return (
    <CustomerWebPushContext.Provider value={value}>
      {children}
    </CustomerWebPushContext.Provider>
  );
}

export function useCustomerWebPush(): CustomerWebPushValue {
  const value = useContext(CustomerWebPushContext);
  if (!value) {
    return {
      dismissOffer: () => undefined,
      enable: async () => undefined,
      offerAfterRetrieval: () => undefined,
      offerVisible: false,
      state: "UNAVAILABLE",
    };
  }
  return value;
}
