"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getLocalizedErrorMessage } from "../../i18n/error-translator";
import { useTranslation } from "../../i18n/use-translation";
import { GuestApiError } from "../../lib/api/api-error";
import type {
  GuestHandoffMaterial,
  HandoffStandardMethod,
} from "../../lib/api/guest-api-types";
import { useGuestAuth } from "../auth/guest-auth-context";
import type { BeginGuestMutation, GuestMutationTicket } from "../session/guest-request-coordinator";
import { useGuestSession } from "../session/use-guest-session";

export type HandoffRecoveryState = "ALREADY_ISSUED" | "ALREADY_VERIFIED" | null;

export type HandoffMutationOutcome =
  | { readonly kind: "SUCCESS"; readonly material: GuestHandoffMaterial }
  | { readonly kind: "BUSY" }
  | { readonly kind: "STALE" }
  | {
      readonly kind: "FAILED";
      readonly error: unknown;
      readonly recovery: HandoffRecoveryState;
    };

interface HandoffUiState {
  readonly client: ReturnType<typeof useGuestAuth>["client"];
  readonly valetSessionId: string | undefined;
  readonly method: HandoffStandardMethod;
  readonly material: GuestHandoffMaterial | null;
  readonly operation: "ISSUE" | "ROTATE" | null;
  readonly error: string | null;
  readonly recoveryState: HandoffRecoveryState;
  readonly secondsRemaining: number | undefined;
}
function emptyUiState(
  client: ReturnType<typeof useGuestAuth>["client"],
  valetSessionId: string | undefined,
  method: HandoffStandardMethod,
): HandoffUiState {
  return {
    client,
    valetSessionId,
    method,
    material: null,
    operation: null,
    error: null,
    recoveryState: null,
    secondsRemaining: undefined,
  };
}
export function classifyHandoffRecovery(error: unknown): HandoffRecoveryState {
  if (!(error instanceof GuestApiError)) return null;
  if (error.code === "HANDOFF_VERIFICATION_ALREADY_ISSUED") {
    return "ALREADY_ISSUED";
  }
  if (error.code === "HANDOFF_VERIFICATION_ALREADY_VERIFIED") {
    return "ALREADY_VERIFIED";
  }
  return null;
}
export function handoffSecondsRemaining(
  expiresAt: string,
  now: number,
): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}
async function settleTicket(ticket: GuestMutationTicket): Promise<void> {
  try {
    await ticket.finish();
  } catch {
    // Reconcile only. A failed/ambiguous POST is never replayed here.
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
    await settleTicket(ticket);
    if (!wasCurrent) return { kind: "STALE" };
    return { kind: "FAILED", error, recovery: classifyHandoffRecovery(error) };
  }

  if (!ticket.isCurrent()) {
    await settleTicket(ticket);
    return { kind: "STALE" };
  }

  try {
    await ticket.finish();
  } catch (error: unknown) {
    return { kind: "FAILED", error, recovery: null };
  }
  return { kind: "SUCCESS", material };
}
export function useHandoff(
  preferredMethod: HandoffStandardMethod = "PICKUP_CODE",
) {
  const { t } = useTranslation();
  const { client } = useGuestAuth();
  const { session, beginMutation } = useGuestSession();
  const visitId = session?.valetSessionId;
  const isPending = session?.state === "HANDOFF_PENDING";

  const mountedRef = useRef(true);
  const actionEpochRef = useRef(0);
  const identityRef = useRef({ client, visitId, isPending });
  const pendingEntryRef = useRef<{
    client: typeof client;
    visitId: string;
  } | null>(null);
  const [uiState, setUiState] = useState<HandoffUiState>(() =>
    emptyUiState(client, visitId, preferredMethod),
  );
  const visibleUi =
    uiState.client === client && uiState.valetSessionId === visitId
      ? uiState
      : null;
  const material = isPending ? (visibleUi?.material ?? null) : null;
  const activeMethod = isPending
    ? (visibleUi?.method ?? preferredMethod)
    : preferredMethod;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      actionEpochRef.current += 1;
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
    if (!changed) return;

    const clearEpoch = actionEpochRef.current;
    queueMicrotask(() => {
      const current = identityRef.current;
      if (
        !mountedRef.current ||
        actionEpochRef.current !== clearEpoch ||
        current.client !== client ||
        current.visitId !== visitId ||
        current.isPending !== isPending
      ) {
        return;
      }
      setUiState(emptyUiState(client, visitId, preferredMethod));
    });
  }, [client, isPending, preferredMethod, visitId]);

  const fetchMaterial = useCallback(
    async (
      method: HandoffStandardMethod,
      rotate: boolean,
    ): Promise<HandoffMutationOutcome> => {
      if (!client || !isPending || !visitId) return { kind: "STALE" };
      if (visibleUi?.recoveryState === "ALREADY_VERIFIED" && rotate) {
        return { kind: "STALE" };
      }

      let startedEpoch: number | null = null;
      const outcome = await runHandoffMutation(
        beginMutation,
        () =>
          rotate ? client.rotateHandoff(method) : client.issueHandoff(method),
        () => {
          startedEpoch = ++actionEpochRef.current;
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
    [beginMutation, client, isPending, t, visibleUi?.recoveryState, visitId],
  );

  useEffect(() => {
    if (!client || !isPending || !visitId) return;
    const claimed = pendingEntryRef.current;
    if (claimed?.client === client && claimed.visitId === visitId) return;

    pendingEntryRef.current = { client, visitId };
    void fetchMaterial(preferredMethod, false).then((outcome) => {
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
  }, [client, fetchMaterial, isPending, preferredMethod, session, visitId]);

  useEffect(() => {
    if (!material) return undefined;
    const interval = setInterval(() => {
      const remaining = handoffSecondsRemaining(material.expiresAt, Date.now());
      setUiState((current) => {
        if (current.material !== material) return current;
        if (remaining <= 0) {
          return {
            ...current,
            material: null,
            secondsRemaining: 0,
          };
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
    recoveryState: isPending ? (visibleUi?.recoveryState ?? null) : null,
    secondsRemaining: material ? visibleUi?.secondsRemaining : undefined,
    isExpired: isPending && visibleUi?.secondsRemaining === 0,
    switchMethod,
    rotateCurrent,
  };
}
