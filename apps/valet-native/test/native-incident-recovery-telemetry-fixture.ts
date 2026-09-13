/**
 * Shared fixture for the incident recovery exactly-once telemetry tests
 * (MOB-024A review fix #3). Mock-free by construction: the recovery chain
 * under test (native-incident-recovery-resolution + its telemetry owner)
 * is platform-neutral, so stores/transports are plain in-memory fakes and
 * the recording owner is the real bounded ring.
 */
import {
  IncidentRecoveryState,
  type IncidentRecoveryMarker,
  type IncidentRecoveryResolution,
  type IncidentRecoveryStore,
  type IncidentRecoveryTransport,
} from "@valet/employee-client";
import { vi } from "vitest";

import {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  installNativeTelemetry,
} from "../src/telemetry/native-telemetry-owner";

export const recoveryIncidentId = "018f1234-5678-8abc-9234-56789abcdef0";
export const recoverySessionId = "44444444-4444-4444-8444-444444444444";
export const recoveryContext = {
  installationGeneration: "installation-1",
  locationId: "11111111-1111-4111-8111-111111111111",
  membershipId: "33333333-3333-4333-8333-333333333333",
  organizationId: "22222222-2222-4222-8222-222222222222",
};
export const recoveryMarker: IncidentRecoveryMarker = {
  ...recoveryContext,
  createdAt: "2026-09-12T12:00:00.000Z",
  incidentId: recoveryIncidentId,
  protocol: "actor-bound-intent-v1",
  sessionId: recoverySessionId,
  version: 1,
};
export const recoveryReport = {
  createdAt: "2026-09-12T12:00:01.000Z",
  incidentId: recoveryIncidentId,
  reportedByMembershipId: recoveryContext.membershipId,
  sessionId: recoverySessionId,
  severity: "LOW" as const,
  status: "OPEN" as const,
  type: "OTHER" as const,
};
/** Frozen clock: the marker was written exactly at its createdAt instant. */
export const recoveryNow = () => Date.parse("2026-09-12T12:00:00.000Z");

export function recoveryMemoryStore(
  initial: IncidentRecoveryMarker | null = recoveryMarker,
): IncidentRecoveryStore {
  let stored: IncidentRecoveryMarker | null = initial;
  return {
    async delete() {
      stored = null;
    },
    async read() {
      return stored;
    },
    async write(value) {
      stored = value;
    },
  };
}

/**
 * Installs a recording owner backed by the real bounded ring, mirroring
 * production wiring (owner + BoundedTelemetryBuffer via the registry).
 */
export function recoveryRing(): BoundedTelemetryBuffer {
  const buffer = new BoundedTelemetryBuffer();
  installNativeTelemetry(
    new NativeTelemetryOwner(buffer, {
      appBuild: "101",
      appVersion: "1.4.0",
      platform: "android",
    }),
  );
  return buffer;
}

export function recoveryWith(
  resolution: IncidentRecoveryResolution,
  store: IncidentRecoveryStore = recoveryMemoryStore(),
): IncidentRecoveryState {
  // FOUND/RESERVED/RETIRED/UNKNOWN all come from the transport (the wire
  // response union); only UNAVAILABLE is locally minted — in production it
  // arises when the transport read FAILS, so this fixture models that
  // truthfully with a rejecting read.
  const readFails = resolution.outcome === "UNAVAILABLE";
  const transport: IncidentRecoveryTransport = {
    read: readFails
      ? vi.fn(async () => {
          throw new Error("recovery read unavailable");
        })
      : vi.fn(async () => resolution),
    reserve: vi.fn(),
    retire: vi.fn(),
  };
  return new IncidentRecoveryState(store, transport, undefined, recoveryNow);
}
