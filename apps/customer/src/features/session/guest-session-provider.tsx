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
import { GuestSessionContext } from "./use-guest-session";
import {
  currentClientSession,
  applyCurrentClientSessionUpdate,
} from "./client-bound-session";

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
  const { client, isContextSwitchOutcomeAmbiguous } = useGuestAuth();
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
  const latestSessionRef = useRef(sessionEnvelope);
  const session = currentClientSession(sessionEnvelope, client);
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
      setError(null);
      setIsExpired(false);
      setIsNetworkError(false);
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
      latestSessionRef.current = { client, value: newSession };
      setSessionEnvelope(latestSessionRef.current);
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

  const updateSession = useCallback(
    (snapshot: GuestSafeSession) =>
      applyCurrentClientSessionUpdate(
        latestSessionRef,
        activeClientRef,
        client,
        snapshot,
        (newSession) => {
          applyAuthorizedSessionSnapshot(newSession);
          setError(null);
          setIsNetworkError(false);
        },
      ),
    [applyAuthorizedSessionSnapshot, client],
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
    isExpired: isContextSwitchOutcomeAmbiguous && session !== null ? false : isExpired,
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
