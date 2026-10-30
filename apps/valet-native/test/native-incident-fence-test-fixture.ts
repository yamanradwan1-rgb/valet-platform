import type { IncidentRecoveryContext } from "@valet/employee-client";
import { vi } from "vitest";

import { NativeIncidentSession } from "../src/incident/native-incident-session";
import {
  recoveryContext,
  recoveryMarker,
} from "./native-incident-recovery-telemetry-fixture";

export { recoveryContext as contextA, recoveryMarker as markerA };
export type RecoveryAction = "restore" | "retire" | "acknowledge" | "purge";

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function markerFor(context: IncidentRecoveryContext) {
  return { ...recoveryMarker, ...context };
}

export function resolved(
  context = recoveryContext,
  outcome: "RESERVED" | "UNKNOWN" = "RESERVED",
) {
  const marker = markerFor(context);
  return {
    kind: "resolved" as const,
    marker,
    deadlineReached: false,
    resolution: {
      outcome,
      incidentId: marker.incidentId,
      sessionId: marker.sessionId,
      ...(outcome === "RESERVED"
        ? { expiresAt: "2026-09-12T12:15:00.000Z" }
        : {}),
    },
  };
}

export function fenceHarness() {
  const request = vi.fn();
  const recovery = {
    restore: vi.fn(async (context: IncidentRecoveryContext) =>
      resolved(context),
    ),
    retire: vi.fn(async (marker: typeof recoveryMarker) => ({
      outcome: "RETIRED" as const,
      incidentId: marker.incidentId,
      sessionId: marker.sessionId,
    })),
    clearResolved: vi.fn(async () => {}),
    purge: vi.fn(async () => {}),
    prepare: vi.fn(),
    reserve: vi.fn(),
  };
  const session = new NativeIncidentSession(
    () => ({ request }) as never,
    recovery as never,
  );
  const notifications: unknown[] = [];
  session.subscribe((value) => notifications.push(value));
  async function begin(action: RecoveryAction) {
    await session.observeRecoveryContext(recoveryContext);
    const entered = deferred();
    const cleanup = deferred();
    recovery[
      action === "purge" ? "purge" : "clearResolved"
    ].mockImplementationOnce(() => {
      entered.resolve();
      return cleanup.promise;
    });
    if (action === "restore")
      recovery.restore.mockResolvedValueOnce(
        resolved(recoveryContext, "UNKNOWN"),
      );
    const operation =
      action === "restore"
        ? session.observeRecoveryContext(recoveryContext)
        : action === "retire"
          ? session.retire()
          : action === "acknowledge"
            ? session.acknowledge()
            : session.purgeRecovery();
    const result = operation.then(
      (value) => ({ value, error: undefined }),
      (error) => ({ value: undefined, error }),
    );
    await entered.promise;
    return { cleanup, result };
  }
  return { session, recovery, request, notifications, begin };
}
