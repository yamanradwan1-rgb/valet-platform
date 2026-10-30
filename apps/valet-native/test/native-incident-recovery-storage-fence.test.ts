import {
  IncidentRecoveryState,
  type IncidentRecoveryMarker,
  type IncidentRecoveryStore,
} from "@valet/employee-client";
import { expect, it, vi } from "vitest";
import { NativeIncidentSession } from "../src/incident/native-incident-session";
import {
  contextA,
  markerA,
  deferred,
} from "./native-incident-fence-test-fixture";

function storageHarness() {
  let stored: IncidentRecoveryMarker | null = markerA;
  const entered = deferred();
  const release = deferred();
  let deletions = 0;
  const store: IncidentRecoveryStore = {
    async read() {
      return stored;
    },
    async write(marker) {
      stored = marker;
    },
    async delete() {
      if (++deletions === 1) {
        entered.resolve();
        await release.promise;
      }
      stored = null;
    },
  };
  const transport = {
    read: vi.fn(async (marker: IncidentRecoveryMarker) => ({
      outcome: "UNKNOWN" as const,
      incidentId: marker.incidentId,
      sessionId: marker.sessionId,
    })),
    reserve: vi.fn(),
    retire: vi.fn(),
  };
  const recovery = new IncidentRecoveryState(
    store,
    transport,
    () => "00010203-0405-8607-8809-0a0b0c0d0e10",
  );
  return {
    store,
    recovery,
    transport,
    entered,
    release,
    deletions: () => deletions,
  };
}

it("serialized cleanup and purge cannot overtake a later replacement marker write", async () => {
  const h = storageHarness();
  const session = new NativeIncidentSession(
    () => ({ request: vi.fn() }) as never,
    h.recovery,
  );
  const oldRestore = session.observeRecoveryContext(contextA);
  await h.entered.promise;
  const purge = session.purgeRecovery();
  const replacement = h.recovery.prepare(
    { ...contextA, membershipId: contextA.locationId },
    markerA.sessionId,
  );
  h.release.resolve();
  await Promise.all([oldRestore, purge]);
  const newer = await replacement;
  expect(await h.store.read()).toEqual(newer);
  expect(h.deletions()).toBe(2);
  expect(session.current().phase).toBe("inactive");
  expect(h.transport.reserve).not.toHaveBeenCalled();
});

it("old exact-marker cleanup queued after replacement preparation must not delete the replacement", async () => {
  const h = storageHarness();
  const first = h.recovery.clearResolved();
  await h.entered.promise;
  const replacement = h.recovery.prepare(
    { ...contextA, membershipId: contextA.locationId },
    markerA.sessionId,
  );
  // Reflect.apply also exercises the old baseline's zero-argument method;
  // baseline ignores the expected marker and deletes the new durable value.
  const stale = Reflect.apply(h.recovery.clearResolved, h.recovery, [
    markerA,
  ]) as Promise<void>;
  const outcome = stale.then(
    () => null,
    (error) => error,
  );
  h.release.resolve();
  await first;
  const newer = await replacement;
  const cleanupResult = await outcome;
  expect(await h.store.read()).toEqual(newer);
  expect(cleanupResult).toBeInstanceOf(Error);
  expect(h.deletions()).toBe(1);
});
