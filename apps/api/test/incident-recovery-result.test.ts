import { expect, it } from "vitest";

import { projectRecoveryResult } from "../src/modules/incidents/incident-recovery-result";

const incidentId = "018f1234-5678-8abc-9234-56789abcdef0";
const binding = {
  incidentId,
  locationId: "11111111-1111-4111-8111-111111111111",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  sessionId: "44444444-4444-4444-8444-444444444444",
};
const intent = {
  expires_at: new Date("2026-09-12T12:15:00.000Z"),
  incident_id: incidentId,
  location_id: binding.locationId,
  organization_id: binding.organizationId,
  reporting_membership_id: binding.membershipId,
  state: "RETIRED" as const,
  valet_session_id: binding.sessionId,
};
const incident = {
  created_at: new Date("2026-09-12T12:01:00.000Z"),
  id: incidentId,
  reported_by_membership_id: binding.membershipId,
  severity: "LOW" as const,
  status: "OPEN" as const,
  type: "OTHER" as const,
  valet_session_id: binding.sessionId,
};

it("fails closed for the impossible Incident plus RETIRED invariant", () => {
  expect(() =>
    projectRecoveryResult(
      binding,
      incident,
      intent,
      new Date("2026-09-12T12:02:00.000Z"),
    ),
  ).toThrow("terminal invariant failed");
});
