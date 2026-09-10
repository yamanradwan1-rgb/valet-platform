import { useState, useSyncExternalStore } from "react";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import {
  nativeContextualRoute,
  type NativeContextualRoute,
  type NativeWorkflowOrigin,
} from "./native-contextual-route";

export function useNativeContextualRoute(runtime: NativeEmployeeRuntime) {
  const [route, setRoute] = useState<NativeContextualRoute | null>(null);
  const incident = useSyncExternalStore(
    (listener) => runtime.incident.subscribe(listener),
    () => runtime.incident.current(),
  );
  const guestAccess = useSyncExternalStore(
    (listener) => runtime.guestAccess.subscribe(listener),
    () => runtime.guestAccess.current(),
  );
  const open = (
    kind: NativeContextualRoute["kind"],
    origin: NativeWorkflowOrigin,
    sessionId: string,
  ) => {
    const next = nativeContextualRoute(kind, origin, sessionId);
    if (next === null) return;
    setRoute(next);
    if (kind === "incident") void runtime.incident.open(next);
    else void runtime.guestAccess.open(next);
  };
  const close = () => {
    runtime.incident.clear();
    runtime.guestAccess.clear();
    setRoute(null);
  };
  return { close, guestAccess, incident, open, route };
}
