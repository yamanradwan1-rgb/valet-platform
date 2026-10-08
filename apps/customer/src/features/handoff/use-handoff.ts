"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getLocalizedErrorMessage } from "../../i18n/error-translator";
import { useTranslation } from "../../i18n/use-translation";
import type {
  GuestHandoffMaterial,
  HandoffStandardMethod,
} from "../../lib/api/guest-api-types";
import { useGuestAuth } from "../auth/guest-auth-context";
import type {
  BeginGuestMutation,
  GuestMutationTicket,
} from "../session/guest-request-coordinator";
import { useGuestSession } from "../session/use-guest-session";
import {
  classifyHandoffRecovery,
  emptyUiState,
  handoffSecondsRemaining,
  type HandoffRecoveryState,
  type HandoffUiState,
} from "./handoff-ui-state";

export { classifyHandoffRecovery, handoffSecondsRemaining } from "./handoff-ui-state";
export type { HandoffRecoveryState } from "./handoff-ui-state";

export type HandoffMutationOutcome =
  | { readonly kind: "SUCCESS"; readonly material: GuestHandoffMaterial }
  | { readonly kind: "BUSY" | "STALE" }
  | {
      readonly kind: "FAILED";
      readonly error: unknown;
      readonly recovery: HandoffRecoveryState;
    };

async function finishTicket(ticket: GuestMutationTicket, failure?: unknown) {
  try {
    await ticket.finish(undefined, failure);
    return null;
  } catch (error: unknown) {
    return error;
  }
}
export async function runHandoffMutation(
  beginMutation: BeginGuestMutation,
  mutate: () => Promise<GuestHandoffMaterial>,
  onStarted?: () => void,
): Promise<HandoffMutationOutcome> {
  const ticket = beginMutation();
  if (!ticket) return { kind: "BUSY" };
  onStarted?.();

  let material: GuestHandoffMaterial;
  try {
    material = await mutate();
  } catch (error: unknown) {
    const wasCurrent = ticket.isCurrent();
    await finishTicket(ticket, error);
    if (!wasCurrent) return { kind: "STALE" };
    return { kind: "FAILED", error, recovery: classifyHandoffRecovery(error) };
  }

  if (!ticket.isCurrent()) {
    await finishTicket(ticket);
    return { kind: "STALE" };
  }
  const error = await finishTicket(ticket);
  if (error !== null) {
    return { kind: "FAILED", error, recovery: null };
  }
  return { kind: "SUCCESS", material };
}
export function useHandoff(preferred: HandoffStandardMethod = "PICKUP_CODE") {
  const { t } = useTranslation();
  const { client } = useGuestAuth();
  const { session, beginMutation, isFresh } = useGuestSession();
  const visitId = session?.valetSessionId;
  const isPending = session?.state === "HANDOFF_PENDING";

  const mountedRef = useRef(true);
  const actionEpochRef = useRef(0);
  const proofRevokedRef = useRef(false);
  const identityRef = useRef({ client, visitId, isPending });
  const pendingEntryRef = useRef<{
    client: typeof client;
    visitId: string;
  } | null>(null);
  const [uiState, setUiState] = useState<HandoffUiState>(() =>
    emptyUiState(client, visitId, preferred),
  );
  const visibleUi =
    uiState.client === client && uiState.valetSessionId === visitId
      ? uiState
      : null;
  const recoveryState = visibleUi?.recoveryState ?? null;
  const cachedProofLostTrust =
    uiState.material !== null && (!isFresh || !isPending || visibleUi === null);
  /* eslint-disable react-hooks/refs -- security fence must revoke cached plaintext in the trust-loss render */
  if (cachedProofLostTrust) proofRevokedRef.current = true;
  const proofRevoked = proofRevokedRef.current;
  const material =
    isPending && isFresh && !proofRevoked
      ? (visibleUi?.material ?? null)
      : null;
  /* eslint-enable react-hooks/refs */
  const needsTrustClear = !isFresh && uiState.material !== null;
  const activeMethod = isPending ? (visibleUi?.method ?? preferred) : preferred;
  useEffect(() => {
    mountedRef.current = true;
    const revoke = () => {
      proofRevokedRef.current = true;
      actionEpochRef.current += 1;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") revoke();
    };
    window.addEventListener("offline", revoke);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
      revoke();
      window.removeEventListener("offline", revoke);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const previous = identityRef.current;
    const changed =
      previous.client !== client ||
      previous.visitId !== visitId ||
      previous.isPending !== isPending;
    identityRef.current = { client, visitId, isPending };
    if (!isPending) pendingEntryRef.current = null;
    if (!changed && !needsTrustClear) return;

    const clearEpoch = changed
      ? ++actionEpochRef.current
      : actionEpochRef.current;
    queueMicrotask(() => {
      const current = identityRef.current;
      if (
        !mountedRef.current ||
        (changed && actionEpochRef.current !== clearEpoch) ||
        current.client !== client ||
        current.visitId !== visitId ||
        current.isPending !== isPending
      ) {
        return;
      }
      setUiState(emptyUiState(client, visitId, preferred));
    });
  }, [client, isPending, needsTrustClear, preferred, visitId]);

  const fetchMaterial = useCallback(
    async (
      method: HandoffStandardMethod,
      rotate: boolean,
    ): Promise<HandoffMutationOutcome> => {
      if (!client || !isPending || !isFresh || !visitId)
        return { kind: "STALE" };
      if (recoveryState === "ALREADY_VERIFIED" && rotate) {
        return { kind: "STALE" };
      }

      let startedEpoch: number | null = null;
      const outcome = await runHandoffMutation(
        beginMutation,
        () =>
          rotate ? client.rotateHandoff(method) : client.issueHandoff(method),
        () => {
          startedEpoch = ++actionEpochRef.current;
          if (rotate) proofRevokedRef.current = true;
          if (!mountedRef.current) return;
          setUiState({
            ...emptyUiState(client, visitId, method),
            operation: rotate ? "ROTATE" : "ISSUE",
          });
        },
      );
      if (outcome.kind === "STALE" || startedEpoch === null) return outcome;

      const current = identityRef.current;
      const mayWrite =
        mountedRef.current &&
        actionEpochRef.current === startedEpoch &&
        current.client === client &&
        current.visitId === visitId &&
        current.isPending;
      if (!mayWrite) return outcome;

      if (outcome.kind === "SUCCESS") {
        if (outcome.material.valetSessionId !== visitId)
          return { kind: "STALE" };
        const remaining = handoffSecondsRemaining(
          outcome.material.expiresAt,
          Date.now(),
        );
        proofRevokedRef.current = false;
        setUiState({
          ...emptyUiState(client, visitId, outcome.material.method),
          material: remaining > 0 ? outcome.material : null,
          secondsRemaining: remaining,
        });
      } else if (outcome.kind === "FAILED") {
        setUiState({
          ...emptyUiState(client, visitId, method),
          error: getLocalizedErrorMessage(outcome.error, t),
          recoveryState: outcome.recovery,
        });
      }
      return outcome;
    },
    [beginMutation, client, isFresh, isPending, recoveryState, t, visitId],
  );

  useEffect(() => {
    if (!client || !isPending || !isFresh || !visitId) return;
    const claimed = pendingEntryRef.current;
    if (claimed?.client === client && claimed.visitId === visitId) return;

    pendingEntryRef.current = { client, visitId };
    void fetchMaterial(preferred, false).then((outcome) => {
      const current = identityRef.current;
      if (
        outcome.kind === "BUSY" &&
        current.client === client &&
        current.visitId === visitId &&
        current.isPending
      ) {
        pendingEntryRef.current = null;
      }
    });
  }, [client, fetchMaterial, isFresh, isPending, preferred, visitId]);

  useEffect(() => {
    if (!material) return undefined;
    const interval = setInterval(() => {
      const remaining = handoffSecondsRemaining(material.expiresAt, Date.now());
      setUiState((current) => {
        if (current.material !== material) return current;
        if (remaining <= 0) {
          return { ...current, material: null, secondsRemaining: 0 };
        }
        return { ...current, secondsRemaining: remaining };
      });
    }, 1_000);
    return () => clearInterval(interval);
  }, [material]);

  const switchMethod = useCallback(
    async (newMethod: HandoffStandardMethod) => {
      await fetchMaterial(newMethod, true);
    },
    [fetchMaterial],
  );

  const rotateCurrent = useCallback(async () => {
    await fetchMaterial(activeMethod, true);
  }, [activeMethod, fetchMaterial]);

  return {
    activeMethod,
    material,
    isLoading: isPending ? visibleUi?.operation === "ISSUE" : false,
    isRotating: isPending ? visibleUi?.operation === "ROTATE" : false,
    error: isPending ? (visibleUi?.error ?? null) : null,
    recoveryState: isPending ? recoveryState : null,
    secondsRemaining: material ? visibleUi?.secondsRemaining : undefined,
    isExpired: isPending && visibleUi?.secondsRemaining === 0,
    switchMethod,
    rotateCurrent,
  };
}
