"use client";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useStaffAuth } from "../../../lib/auth/staff-auth-context";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import type { PresenceTarget } from "./shift-presence-api";
import {
  presenceIntentLifetime,
  presenceIntentScope,
  type PresenceIntent,
} from "./shift-presence-retained-intent";

export function usePresenceRetainedIntent(target: PresenceTarget) {
  const { client } = useStaffAuth();
  const { identityGeneration, sessionGeneration } = useProtectedDashboard();
  const lifetime = useMemo(
    () => presenceIntentLifetime(client, identityGeneration, sessionGeneration),
    [client, identityGeneration, sessionGeneration],
  );
  const key = presenceIntentScope(target);
  const snapshot = useCallback(() => lifetime.get(key), [lifetime, key]);
  const pending = useSyncExternalStore(
    lifetime.subscribe,
    snapshot,
    () => null,
  );
  useLayoutEffect(() => {
    lifetime.watch();
  }, [lifetime]);
  return {
    pending,
    current: lifetime.isCurrent,
    read: snapshot,
    // Auth refresh is pre-dispatch. A failed refresh cannot make a write unknown.
    prepare: async () => {
      if (!client.isTokenFresh()) await client.refresh();
    },
    retain: (intent: PresenceIntent) => lifetime.retain(key, intent),
    clear: (intent: PresenceIntent) => lifetime.clear(key, intent.mutationId),
  };
}
