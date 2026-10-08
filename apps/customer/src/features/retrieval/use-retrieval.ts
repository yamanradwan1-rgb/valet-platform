"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getLocalizedErrorMessage } from "../../i18n/error-translator";
import { useTranslation } from "../../i18n/use-translation";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import { useGuestAuth } from "../auth/guest-auth-context";
import type { BeginGuestMutation, GuestMutationTicket } from "../session/guest-request-coordinator";
import { useGuestSession } from "../session/use-guest-session";

export type RetrievalMutationOutcome =
  | { readonly kind: "SUCCESS" }
  | { readonly kind: "BUSY" }
  | { readonly kind: "STALE" }
  | { readonly kind: "FAILED"; readonly error: unknown };

interface RetrievalUiState {
  readonly client: ReturnType<typeof useGuestAuth>["client"];
  readonly valetSessionId: string | undefined;
  readonly isRequesting: boolean;
  readonly isCancelling: boolean;
  readonly actionError: string | null;
}

async function settleWithoutSnapshot(
  ticket: GuestMutationTicket,
): Promise<void> {
  try {
    await ticket.finish();
  } catch {
    // The coordinator owns reconciliation state and must still release its lock.
  }
}

export async function runRetrievalMutation(
  beginMutation: BeginGuestMutation,
  mutate: () => Promise<GuestSafeSession>,
  onStarted?: () => void,
): Promise<RetrievalMutationOutcome> {
  const ticket = beginMutation();
  if (!ticket) return { kind: "BUSY" };
  onStarted?.();

  let snapshot: GuestSafeSession;
  try {
    snapshot = await mutate();
  } catch (error: unknown) {
    const wasCurrent = ticket.isCurrent();
    await settleWithoutSnapshot(ticket);
    return wasCurrent ? { kind: "FAILED", error } : { kind: "STALE" };
  }

  if (!ticket.isCurrent()) {
    await settleWithoutSnapshot(ticket);
    return { kind: "STALE" };
  }

  try {
    await ticket.finish(snapshot);
  } catch (error: unknown) {
    return { kind: "FAILED", error };
  }
  return { kind: "SUCCESS" };
}

export function useRetrieval() {
  const { t } = useTranslation();
  const { client } = useGuestAuth();
  const { session, beginMutation } = useGuestSession();
  const valetSessionId = session?.valetSessionId;

  const mountedRef = useRef(true);
  const identityRef = useRef({ client, valetSessionId });
  const [uiState, setUiState] = useState<RetrievalUiState>(() => ({
    client,
    valetSessionId,
    isRequesting: false,
    isCancelling: false,
    actionError: null,
  }));
  const visibleUi =
    uiState.client === client && uiState.valetSessionId === valetSessionId
      ? uiState
      : null;

  useEffect(() => {
    identityRef.current = { client, valetSessionId };
  }, [client, valetSessionId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runAction = useCallback(
    async (
      kind: "REQUEST" | "CANCEL",
      mutate: () => Promise<GuestSafeSession>,
    ): Promise<boolean> => {
      if (!client) return false;
      if (kind === "REQUEST" && session?.state !== "PARKED") return false;
      if (kind === "CANCEL" && session?.state !== "REQUESTED") return false;

      let started = false;
      const outcome = await runRetrievalMutation(beginMutation, mutate, () => {
        started = true;
        if (!mountedRef.current) return;
        setUiState({
          client,
          valetSessionId,
          isRequesting: kind === "REQUEST",
          isCancelling: kind === "CANCEL",
          actionError: null,
        });
      });
      if (outcome.kind === "STALE") return false;

      const currentIdentity = identityRef.current;
      const mayWriteLocalState =
        mountedRef.current &&
        currentIdentity.client === client &&
        currentIdentity.valetSessionId === valetSessionId;
      if (mayWriteLocalState && started) {
        setUiState({
          client,
          valetSessionId,
          isRequesting: false,
          isCancelling: false,
          actionError:
            outcome.kind === "FAILED"
              ? getLocalizedErrorMessage(outcome.error, t)
              : null,
        });
      }
      return outcome.kind === "SUCCESS" && mayWriteLocalState;
    },
    [beginMutation, client, session?.state, t, valetSessionId],
  );

  const requestVehicle = useCallback(
    () =>
      client
        ? runAction("REQUEST", () => client.requestRetrieval())
        : Promise.resolve(false),
    [client, runAction],
  );

  const cancelRetrieval = useCallback(
    () =>
      client
        ? runAction("CANCEL", () => client.cancelRetrieval())
        : Promise.resolve(false),
    [client, runAction],
  );

  return {
    isRequesting: visibleUi?.isRequesting ?? false,
    isCancelling: visibleUi?.isCancelling ?? false,
    actionError: visibleUi?.actionError ?? null,
    requestVehicle,
    cancelRetrieval,
    clearError: () =>
      setUiState({
        client,
        valetSessionId,
        isRequesting: false,
        isCancelling: false,
        actionError: null,
      }),
    canCancel: session?.state === "REQUESTED",
  };
}
