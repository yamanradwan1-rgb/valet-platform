import { describe, expect, it } from "vitest";

import { classifyEmergencyTakeoverDomain } from "../src/modules/dispatch/emergency-takeover-domain";

const base = {
  currentAssigneeMembershipId: "A",
  replacementAssigneeMembershipId: "B",
  retrievalRequestStatus: null,
  sessionState: "PARKING",
  taskStatus: "IN_PROGRESS",
  taskType: "PARKING",
} as const;

describe("emergency takeover domain", () => {
  it("accepts only the locked, already moving Parking lifecycle", () => {
    expect(classifyEmergencyTakeoverDomain(base)).toEqual({
      allowed: true,
      movementActive: true,
    });
    expect(
      classifyEmergencyTakeoverDomain({ ...base, taskStatus: "COMPLETED" }),
    ).toMatchObject({ allowed: false, reason: "INVALID_LIFECYCLE" });
    expect(
      classifyEmergencyTakeoverDomain({ ...base, sessionState: "PARKED" }),
    ).toMatchObject({ allowed: false, reason: "INVALID_LIFECYCLE" });
  });

  it.each([
    ["RETRIEVING", true],
    ["READY", false],
    ["HANDOFF_PENDING", false],
  ])("preserves eligible Retrieval %s (moving=%s)", (sessionState, moving) => {
    expect(
      classifyEmergencyTakeoverDomain({
        ...base,
        taskType: "RETRIEVAL",
        retrievalRequestStatus: "ACCEPTED",
        sessionState,
      }),
    ).toEqual({ allowed: true, movementActive: moving });
  });

  it("fails closed for Retrieval without accepted request", () => {
    expect(
      classifyEmergencyTakeoverDomain({
        ...base,
        taskType: "RETRIEVAL",
        sessionState: "HANDOFF_PENDING",
        retrievalRequestStatus: "OPEN",
      }),
    ).toMatchObject({ allowed: false });
  });

  it.each([null, "B"])("rejects missing or unchanged A owner: %s", (owner) => {
    expect(
      classifyEmergencyTakeoverDomain({
        ...base,
        currentAssigneeMembershipId: owner,
      }),
    ).toMatchObject({ allowed: false, reason: "INVALID_OWNER" });
  });
});
