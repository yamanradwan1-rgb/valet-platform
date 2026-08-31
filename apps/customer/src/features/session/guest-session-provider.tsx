"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { getLocalizedErrorMessage } from "../../i18n/error-translator";
import { useTranslation } from "../../i18n/use-translation";
import { GuestApiError } from "../../lib/api/api-error";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import { useGuestAuth } from "../auth/guest-auth-context";
import { attemptGuestReadyAlertAudio } from "../ready-alert/guest-ready-alert-audio";
import {
  createGuestReadyAlertTracker,
  observeGuestReadySnapshot,
  resetGuestReadyAlertTracker,
} from "../ready-alert/guest-ready-alert-tracker";
import { GuestVehicleReadyAlert } from "../ready-alert/guest-vehicle-ready-alert";
import {
  handleCustomerPushClientMessage,
  respondToCustomerAuthProbe,
} from "../customer-web-push/customer-push-identity-bridge";
import { GuestSessionContext } from "./use-guest-session";

const POLLING_INTERVAL_MS = 5_000;

interface ClientBoundSession {
  readonly client: ReturnType<typeof useGuestAuth>["client"];
  readonly value: GuestSafeSession | null;
}

export function GuestSessionProvider({
  children,
  initialSession,
}: {
  readonly children: React.ReactNode;
  readonly initialSession?: GuestSafeSession | null | undefined;
}) {
  const { t } = useTranslation();
  const { client } = useGuestAuth();
  const [sessionEnvelope, setSessionEnvelope] = useState<ClientBoundSession>(
    () => ({
      client,
      value: initialSession ?? null,
    }),
  );
  const [readyAlertEnvelope, setReadyAlertEnvelope] = useState<{
    readonly client: typeof client;
    readonly identity: string | null;
  }>(() => ({ client, identity: null }));
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !initialSession && Boolean(client),
  );
  const [error, setError] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState<boolean>(false);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  const inFlightClientRef = useRef<typeof client>(null);
  const session =
    sessionEnvelope.client === client ? sessionEnvelope.value : null;
  const readyAlertIdentity =
    readyAlertEnvelope.client === client ? readyAlertEnvelope.identity : null;
  const readyTrackerRef = useRef(
    createGuestReadyAlertTracker(initialSession ?? null),
  );
  const activeClientRef = useRef(client);
  const sessionStateRef = useRef<string | undefined>(session?.state);

  useEffect(() => {
    if (activeClientRef.current !== client) {
      resetGuestReadyAlertTracker(readyTrackerRef.current);
    }
    activeClientRef.current = client;
    sessionStateRef.current = session?.state;
  }, [client, session?.state]);

  const applyAuthorizedSessionSnapshot = useCallback(
    (newSession: GuestSafeSession) => {
      if (activeClientRef.current !== client) return;

      const decision = observeGuestReadySnapshot(
        readyTrackerRef.current,
        newSession,
      );
      setSessionEnvelope({ client, value: newSession });
      if (newSession.state === "COMPLETED" || decision.kind === "BASELINE") {
        setReadyAlertEnvelope({ client, identity: null });
      } else if (decision.kind === "PRESENT") {
        attemptGuestReadyAlertAudio();
        setReadyAlertEnvelope({ client, identity: decision.identity });
      }
    },
    [client],
  );

  const fetchSession = useCallback(async () => {
    if (!client || inFlightClientRef.current === client) return;
    if (sessionStateRef.current === "COMPLETED") return;

    inFlightClientRef.current = client;
    setIsLoading(true);

    try {
      const data = await client.loadSession();
      if (activeClientRef.current !== client) return;
      applyAuthorizedSessionSnapshot(data);
      setError(null);
      setIsNetworkError(false);
      setIsExpired(false);
    } catch (err: unknown) {
      if (activeClientRef.current !== client) return;
      if (err instanceof GuestApiError) {
        if (err.isNetworkError) {
          setIsNetworkError(true);
        } else if (err.code === "GUEST_ACCESS_INVALID") {
          setIsExpired(true);
          resetGuestReadyAlertTracker(readyTrackerRef.current);
          setReadyAlertEnvelope({ client, identity: null });
        }
      }
      setError(getLocalizedErrorMessage(err, t));
    } finally {
      if (inFlightClientRef.current === client) {
        inFlightClientRef.current = null;
      }
      if (activeClientRef.current === client) setIsLoading(false);
    }
  }, [applyAuthorizedSessionSnapshot, client, t]);

  const refreshSession = useCallback(async () => {
    await fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const listener = (event: MessageEvent<unknown>): void => {
      if (
        respondToCustomerAuthProbe(
          event.data,
          Array.from(event.ports),
          client && session && !isExpired ? session.valetSessionId : null,
        )
      ) {
        return;
      }
      handleCustomerPushClientMessage(
        event.data,
        readyTrackerRef.current,
        session?.valetSessionId ?? null,
        () => void fetchSession(),
      );
    };
    navigator.serviceWorker.addEventListener("message", listener);
    return () =>
      navigator.serviceWorker.removeEventListener("message", listener);
  }, [client, fetchSession, isExpired, session]);

  const updateSession = useCallback(
    (newSession: GuestSafeSession) => {
      applyAuthorizedSessionSnapshot(newSession);
      setError(null);
      setIsNetworkError(false);
    },
    [applyAuthorizedSessionSnapshot],
  );

  // Initial load via asynchronous trigger
  useEffect(() => {
    if (client && !session) {
      const timer = setTimeout(() => {
        void fetchSession();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [client, session, fetchSession]);

  // Foreground Polling
  useEffect(() => {
    if (!client || isExpired) return;

    const intervalId = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        sessionStateRef.current !== "COMPLETED"
      ) {
        void fetchSession();
      }
    }, POLLING_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        sessionStateRef.current !== "COMPLETED"
      ) {
        void fetchSession();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [client, isExpired, fetchSession]);

  const value = {
    session,
    isLoading: isLoading || Boolean(client && !session && !error),
    error,
    isNetworkError,
    isExpired,
    refreshSession,
    updateSession,
  };

  return (
    <>
      <GuestSessionContext.Provider value={value}>
        {children}
      </GuestSessionContext.Provider>
      {readyAlertIdentity !== null && (
        <GuestVehicleReadyAlert
          onDismiss={() => setReadyAlertEnvelope({ client, identity: null })}
        />
      )}
    </>
  );
}
