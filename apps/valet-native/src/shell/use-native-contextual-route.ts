import { useState, useSyncExternalStore } from "react";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import {
  inactiveNativeGuestAccessSnapshot,
  type NativeGuestAccessSnapshot,
} from "../guest-access/native-guest-access-types";
import type { NativeIncidentSnapshot } from "../incident/native-incident-types";
import {
  handleNativeContextualSystemBack,
  nativeContextualRoute,
  type NativeContextualRoute,
  type NativeWorkflowOrigin,
} from "./native-contextual-route";

const inactiveIncident: NativeIncidentSnapshot = {
  detail: null,
  error: null,
  phase: "inactive",
  report: null,
  target: null,
};

export interface NativeContextualPresentation {
  readonly close: () => void;
  readonly guestAccess: NativeGuestAccessSnapshot;
  readonly incident: NativeIncidentSnapshot;
  readonly onSystemBack: () => boolean;
  readonly open: (
    kind: NativeContextualRoute["kind"],
    origin: NativeWorkflowOrigin,
    sessionId: string,
  ) => void;
  readonly route: NativeContextualRoute | null;
}

export function useNativeContextualRoute(
  runtime: NativeEmployeeRuntime | undefined,
  identityGeneration: number,
): NativeContextualPresentation {
  const [heldRoute, setHeldRoute] = useState<{
    readonly identityGeneration: number;
    readonly route: NativeContextualRoute;
  } | null>(null);
  const route =
    heldRoute?.identityGeneration === identityGeneration
      ? heldRoute.route
      : null;
  const incident = useSyncExternalStore(
    (listener) => runtime?.incident.subscribe(listener) ?? (() => undefined),
    () => runtime?.incident.current() ?? inactiveIncident,
  );
  const guestAccess = useSyncExternalStore(
    (listener) => runtime?.guestAccess.subscribe(listener) ?? (() => undefined),
    () => runtime?.guestAccess.current() ?? inactiveNativeGuestAccessSnapshot,
  );
  const open = (
    kind: NativeContextualRoute["kind"],
    origin: NativeWorkflowOrigin,
    sessionId: string,
  ) => {
    if (runtime === undefined) return;
    const next = nativeContextualRoute(kind, origin, sessionId);
    if (next === null) return;
    setHeldRoute({ identityGeneration, route: next });
    if (kind === "incident") void runtime.incident.open(next);
    else void runtime.guestAccess.open(next);
  };
  const close = () => {
    if (runtime === undefined || route === null) return;
    const busy =
      route.kind === "incident"
        ? incident.phase === "submitting"
        : guestAccess.mutation !== null;
    if (busy) return;
    clearNativeContextualSessions(runtime);
    setHeldRoute(null);
  };
  const onSystemBack = () => {
    const busy =
      route?.kind === "incident"
        ? incident.phase === "submitting"
        : guestAccess.mutation !== null;
    return handleNativeContextualSystemBack(route, busy, close);
  };
  return { close, guestAccess, incident, onSystemBack, open, route };
}

export function clearNativeContextualSessions(
  runtime: Pick<NativeEmployeeRuntime, "guestAccess" | "incident">,
): void {
  runtime.incident.clear();
  runtime.guestAccess.clear();
}
