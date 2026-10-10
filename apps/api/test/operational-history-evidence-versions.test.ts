import { describe, expect, it } from "vitest";

import { classifyParkingHistory } from "../src/modules/dashboard/operational-history-evidence-classifier";
import type { ParkingTaskDispatchEvidence } from "../src/modules/dashboard/operational-history-evidence-classifier";
import type { ParkingAuditEvidence } from "../src/modules/dashboard/operational-history-audit-discovery";

const sessionId = "33333333-3333-4333-8333-333333333333";
const taskId = "44444444-4444-4444-8444-444444444444";
const actorId = "55555555-5555-4555-8555-555555555555";
const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const occurredAt = new Date("2026-10-09T12:34:56.123Z");

function classify(
  fromSessionVersion: number,
  toSessionVersion: number,
  fromTaskVersion = 4,
  toTaskVersion = 5,
) {
  const task: ParkingTaskDispatchEvidence = {
    sessionId, taskId, status: "COMPLETED", taskVersion: toTaskVersion,
    ownerId: actorId, dispatchId: "77777777-7777-4777-8777-777777777777",
    actorId, newAssigneeId: actorId, previousAssigneeId: null,
    reason: null, occurredAt,
  };
  const audit: ParkingAuditEvidence = {
    implicatedSessionId: sessionId, valetSessionId: sessionId,
    auditId: "88888888-8888-4888-8888-888888888888",
    organizationId, locationId, actorId, entityType: "VALET_SESSION",
    entityId: sessionId, occurredAt,
    metadata: {
      taskId, fromTaskStatus: "IN_PROGRESS", toTaskStatus: "COMPLETED",
      fromTaskVersion, toTaskVersion,
      fromSessionState: "PARKING", toSessionState: "PARKED",
      fromSessionVersion, toSessionVersion,
    },
  };
  return classifyParkingHistory([task], [audit], { organizationId, locationId, sessionId }).proof;
}

describe("DEC-102 canonical PostgreSQL INTEGER version evidence", () => {
  it("proves versions valid for the stored version domain", () => {
    expect(classify(7, 8)).toBe("PROVEN");
    expect(classify(2147483646, 2147483647)).toBe("PROVEN");
  });

  it.each([
    [2147483647, 2147483648],
    [2147483648, 2147483649],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1],
    [0, 1],
    [-1, 0],
    [1.5, 2.5],
  ])("rejects impossible Session version %s to %s", (from, to) => {
    expect(classify(from, to)).toBe("UNVERIFIABLE");
  });

  it.each([
    [2147483647, 2147483648],
    [2147483648, 2147483649],
    [0, 1],
  ])("rejects impossible Task version %s to %s", (from, to) => {
    expect(classify(7, 8, from, to)).toBe("UNVERIFIABLE");
  });
});
