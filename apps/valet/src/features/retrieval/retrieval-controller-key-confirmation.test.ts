import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { RetrievalController } from "./retrieval-controller";
import type { ActiveRetrievalSession } from "./retrieval-types";

const KEY_SLOT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_KEY_SLOT_ID = "22222222-2222-4222-8222-222222222222";

const session: ActiveRetrievalSession = {
  expectedKeySlotCode: "K-03",
  expectedKeySlotId: KEY_SLOT_ID,
  handoff: { pendingAt: null, verification: null },
  isKeyConfirmed: false,
  locationId: "33333333-3333-4333-8333-333333333333",
  parkingSpotCode: "P-01",
  parkingZoneCode: "ZONE-A",
  readyAt: null,
  retrievalStartedAt: null,
  sessionId: "44444444-4444-4444-8444-444444444444",
  sessionVersion: 4,
  state: "REQUESTED",
  taskId: "55555555-5555-4555-8555-555555555555",
  taskStatus: "ACCEPTED",
  taskVersion: 2,
  vehicle: {
    color: null,
    make: null,
    model: null,
    plateCountry: null,
    plateNumberRaw: null,
    temporaryDescriptor: "Test vehicle",
  },
};

function controller() {
  const api = { request: vi.fn() } as unknown as EmployeeApiClient;
  const result = new RetrievalController(api, vi.fn());
  result.setActiveSession(session);
  return result;
}

describe("RetrievalController key confirmation exact identity", () => {
  it.each([
    ["K-03", true],
    [" K-03 ", true],
    ["k-03", false],
    ["K03", false],
  ])("uses trim-only exact semantics for V1/manual input %j", (input, accepted) => {
    expect(controller().confirmKey(input)).toBe(accepted);
  });

  it("accepts V2 only when both exact code and UUID match", () => {
    expect(controller().confirmKey(" K-03 ", KEY_SLOT_ID)).toBe(true);
    expect(controller().confirmKey("K-03", OTHER_KEY_SLOT_ID)).toBe(false);
    expect(controller().confirmKey("k-03", KEY_SLOT_ID)).toBe(false);
  });
});
