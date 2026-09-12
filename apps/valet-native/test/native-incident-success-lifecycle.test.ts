import { describe, expect, it, vi } from "vitest";

import { NativeIncidentSession } from "../src/incident/native-incident-session";
import { target } from "./native-guest-access-runtime-test-support";
import { detail } from "./native-parity-11-test-fixture";

const incidentId = "11111111-1111-4111-8111-111111111111";
const report = {
  createdAt: "2026-09-10T10:00:00.000Z",
  incidentId,
  reportedByMembershipId: "33333333-3333-4333-8333-333333333333",
  sessionId: target.sessionId,
  severity: "HIGH" as const,
  status: "OPEN" as const,
  type: "VEHICLE_DAMAGE" as const,
};

async function successfulIncident() {
  const request = vi
    .fn()
    .mockResolvedValueOnce(detail())
    .mockResolvedValueOnce(report);
  const createIncidentId = vi.fn(() => incidentId);
  const session = new NativeIncidentSession(
    () => ({ request }) as never,
    createIncidentId,
  );
  await session.open(target);
  await session.submit({
    description: "Damage",
    severity: "HIGH",
    type: "VEHICLE_DAMAGE",
  });
  expect(session.current()).toMatchObject({ phase: "success", report });
  return { createIncidentId, request, session };
}

describe("Native Incident success lifecycle", () => {
  it("preserves confirmed success through background and foreground", async () => {
    const test = await successfulIncident();
    const confirmed = test.session.current().report;
    test.session.suspendForBackground();
    await test.session.revalidate();

    expect(test.session.current()).toMatchObject({
      phase: "success",
      report: confirmed,
    });
    expect(test.request).toHaveBeenCalledTimes(2);
    expect(test.createIncidentId).toHaveBeenCalledOnce();
  });

  it("preserves confirmed success through network recovery", async () => {
    const test = await successfulIncident();
    const confirmed = test.session.current().report;
    await test.session.revalidate();

    expect(test.session.current()).toMatchObject({
      phase: "success",
      report: confirmed,
    });
    expect(test.request).toHaveBeenCalledTimes(2);
    expect(test.createIncidentId).toHaveBeenCalledOnce();
  });

  it("still purges confirmed success at an identity or scope boundary", async () => {
    const test = await successfulIncident();
    test.session.clear();
    expect(test.session.current()).toMatchObject({
      phase: "inactive",
      report: null,
      target: null,
    });
  });
});
