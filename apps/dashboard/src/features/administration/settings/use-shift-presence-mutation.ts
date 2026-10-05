"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { PresenceIntent as Intent } from "./shift-presence-retained-intent";
import { usePresenceRetainedIntent } from "./use-presence-retained-intent";
import { executeSensitiveMutation } from "../sensitive-mutation-executor";
import type { PresenceApi, PresenceCanonical } from "./shift-presence-api";
import {
  isPresenceDenied,
  presenceErrorKey,
  presenceOutcomeUnknown,
} from "./shift-presence-errors";
import type { PresenceCopyKey } from "./shift-presence-copy";

interface MutationState {
  readonly busy: boolean;
  readonly message: PresenceCopyKey | null;
  readonly mfaOpen: boolean;
  readonly denied: boolean;
  readonly canonical: PresenceCanonical | null;
}

async function readCanonical(
  api: PresenceApi,
  query: Intent["query"],
): Promise<PresenceCanonical> {
  if (query.kind === "POLICY")
    return { kind: "POLICY", value: await api.policy() };
  if (query.kind === "ZONE")
    return { kind: "ZONE", value: await api.zone(query.entityId) };
  return { kind: "EXCEPTION", value: await api.exception(query.entityId) };
}

/** Presence-only exact receipt recovery around the existing sensitive executor. */
export function useShiftPresenceMutation(
  api: PresenceApi,
  onCanonical: (canonical: PresenceCanonical) => void,
  onRefresh: () => void,
) {
  const alive = useRef(false);
  const flight = useRef(false);
  const retained = usePresenceRetainedIntent(api.target);
  const lastIntent = useRef<Intent | null>(null);
  const [state, setState] = useState<MutationState>({
    busy: false,
    message: null,
    mfaOpen: false,
    denied: false,
    canonical: null,
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function publish(canonical: PresenceCanonical) {
    if (!alive.current) return;
    onCanonical(canonical);
    setState((value) => ({ ...value, canonical }));
  }
  async function reconcileExact(
    intent: Intent,
  ): Promise<PresenceCanonical | null> {
    try {
      const result = await api.result(intent.mutationId, intent.query);
      if (!alive.current || !retained.current()) return null;
      publish(result.canonical);
      const committed = result.attribution === "COMMITTED";
      if (committed) retained.clear(intent);
      setState((value) => ({
        ...value,
        message: committed ? "saved" : "unknown",
      }));
      onRefresh();
      return committed ? result.canonical : null;
    } catch (error) {
      if (!alive.current || !retained.current()) return null;
      const denied = isPresenceDenied(error);
      setState((value) => ({
        ...value,
        message: denied ? "denied" : "unknown",
        denied,
        canonical: denied ? null : value.canonical,
      }));
      return null;
    }
  }
  async function run(
    intent: Intent,
    operation: () => Promise<PresenceCanonical>,
  ): Promise<PresenceCanonical | null> {
    if (
      !alive.current ||
      flight.current ||
      retained.read() ||
      !retained.current() ||
      state.denied ||
      state.mfaOpen
    )
      return null;
    flight.current = true;
    lastIntent.current = intent;
    let completed: PresenceCanonical | null = null;
    let conflicted = false;
    setState((value) => ({ ...value, busy: true, message: "saving" }));
    try {
      await executeSensitiveMutation(
        async () => {
          await retained.prepare();
          if (!alive.current || !retained.current()) return null;
          // Register before the write can yield/unmount; no payload enters memory.
          if (!retained.retain(intent)) return null;
          try {
            const canonical = await operation();
            if (alive.current) retained.clear(intent);
            return canonical;
          } catch (error) {
            if (!presenceOutcomeUnknown(error)) {
              retained.clear(intent);
              throw error;
            }
            if (!alive.current || !retained.current()) throw error;
            setState((value) => ({
              ...value,
              message: "reconciling",
            }));
            completed = await reconcileExact(intent);
            return null;
          }
        },
        {
          isCurrent: () => alive.current && retained.current(),
          onSuccess: (canonical) => {
            if (canonical === null) return;
            completed = canonical;
            publish(canonical);
            setState((value) => ({ ...value, message: "saved" }));
            onRefresh();
          },
          onMfaRequired: () =>
            setState((value) => ({ ...value, message: null, mfaOpen: true })),
          onError: (error) => {
            const denied = isPresenceDenied(error);
            setState((value) => ({
              ...value,
              message: presenceErrorKey(error),
              denied,
              canonical: denied ? null : value.canonical,
            }));
          },
          onConflict: () => {
            conflicted = true;
          },
        },
      );
      if (conflicted) await refreshTarget(intent);
      return alive.current ? completed : null;
    } finally {
      flight.current = false;
      if (alive.current) setState((value) => ({ ...value, busy: false }));
    }
  }
  async function refreshTarget(intent: Intent) {
    if (!alive.current) return;
    flight.current = true;
    setState((value) => ({ ...value, busy: true }));
    try {
      const canonical = intent.create
        ? { kind: "POLICY" as const, value: await api.policy() }
        : await readCanonical(api, intent.query);
      if (!alive.current) return;
      publish(canonical);
      onRefresh();
    } catch (error) {
      if (!alive.current) return;
      const denied = isPresenceDenied(error);
      setState((value) => ({
        ...value,
        message: denied ? "denied" : "failed",
        denied,
        canonical: denied ? null : value.canonical,
      }));
    } finally {
      flight.current = false;
      if (alive.current) setState((value) => ({ ...value, busy: false }));
    }
  }
  async function reconcile() {
    const intent = retained.read();
    if (!alive.current || flight.current || !intent) return;
    flight.current = true;
    setState((value) => ({ ...value, busy: true, message: "reconciling" }));
    try {
      await reconcileExact(intent);
    } finally {
      flight.current = false;
      if (alive.current) setState((value) => ({ ...value, busy: false }));
    }
  }
  function onAssured() {
    if (!alive.current || !state.mfaOpen) return;
    setState((value) => ({ ...value, mfaOpen: false, message: "mfaRetry" }));
    if (lastIntent.current) void refreshTarget(lastIntent.current);
  }
  return {
    ...state,
    pending: retained.pending,
    message:
      retained.pending && !state.busy && !state.denied
        ? ("unknown" as const)
        : state.message,
    run,
    reconcile,
    onAssured,
    blocked:
      state.busy || retained.pending !== null || state.denied || state.mfaOpen,
    closeMfa: () => {
      if (alive.current) setState((value) => ({ ...value, mfaOpen: false }));
    },
  };
}
export type PresenceMutation = ReturnType<typeof useShiftPresenceMutation>;
