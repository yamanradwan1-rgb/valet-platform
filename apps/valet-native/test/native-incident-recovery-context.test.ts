import type {
  IncidentRecoveryMarker,
  IncidentRecoveryStore,
  InstallationAuthStateStore,
  StaffOperationalContextResponse,
} from "@valet/employee-client";
import { describe, expect, it } from "vitest";

import { resolveNativeIncidentRecoveryContext } from "../src/incident/native-incident-recovery-context";

const ids = {
  incident: "018f1234-5678-8abc-9234-56789abcdef0",
  location: "11111111-1111-4111-8111-111111111111",
  membership: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  session: "44444444-4444-4444-8444-444444444444",
};
const installationGeneration = "installation-generation-1";
const marker: IncidentRecoveryMarker = {
  createdAt: "2026-09-12T12:00:00.000Z",
  incidentId: ids.incident,
  installationGeneration,
  locationId: ids.location,
  membershipId: ids.membership,
  organizationId: ids.organization,
  protocol: "actor-bound-intent-v1",
  sessionId: ids.session,
  version: 1,
};
const response: StaffOperationalContextResponse = {
  contexts: [
    {
      activeShift: null,
      currentLocation: null,
      eligibleLocations: [
        {
          code: "AMM-1",
          currency: "JOD",
          timezone: "Asia/Amman",
          locationId: ids.location,
          name: "Amman",
        },
      ],
      membershipId: ids.membership,
      organization: { name: "VAYLET", organizationId: ids.organization },
      role: "VALET_EMPLOYEE",
    },
  ],
};

function recoveryStore(value: unknown): IncidentRecoveryStore {
  return {
    async delete() {},
    async read() {
      return value;
    },
    async write() {},
  };
}

function installationStore(): InstallationAuthStateStore {
  return {
    async read() {
      return {
        generation: installationGeneration,
        restoreBlocked: false,
        version: 1,
      };
    },
    async write() {},
  };
}

describe("Native Incident recovery operational-context binding", () => {
  it("uses the actual membership/Organization/Location shape after Shift end", async () => {
    await expect(
      resolveNativeIncidentRecoveryContext(
        response,
        recoveryStore(marker),
        installationStore(),
      ),
    ).resolves.toEqual({
      installationGeneration,
      locationId: ids.location,
      membershipId: ids.membership,
      organizationId: ids.organization,
    });
  });

  it("does not bind an old marker to a different current membership", async () => {
    const replacement = {
      contexts: [
        {
          ...response.contexts[0]!,
          membershipId: "55555555-5555-4555-8555-555555555555",
        },
      ],
    } satisfies StaffOperationalContextResponse;
    await expect(
      resolveNativeIncidentRecoveryContext(
        replacement,
        recoveryStore(marker),
        installationStore(),
      ),
    ).resolves.toBe("invalidated");
  });
});
