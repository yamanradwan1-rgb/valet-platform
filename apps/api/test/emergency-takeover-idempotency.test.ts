import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  fingerprintEmergencyIntent,
  replayEmergencyReceipt,
} from "../src/modules/dispatch/emergency-takeover-idempotency";
import type {
  EmergencyTakeoverCommandRequest,
  EmergencyTakeoverReceipt,
  LockedEmergencySession,
} from "../src/modules/dispatch/emergency-takeover-types";

const organizationId = randomUUID();
const locationId = randomUUID();
const sessionId = randomUUID();
const taskId = randomUUID();
const actorId = randomUUID();
const replacementId = randomUUID();
const operationId = randomUUID();

const session: LockedEmergencySession = {
  id: sessionId,
  organization_id: organizationId,
  location_id: locationId,
  state: "HANDOFF_PENDING",
  version: 8,
};
const request: EmergencyTakeoverCommandRequest = {
  taskId,
  operationId,
  expectedVersion: 4,
  targetAssigneeMembershipId: replacementId,
  reason: "Absent original assignee",
  staffSessionContext: {
    userId: randomUUID(),
    staffAuthSessionId: randomUUID(),
    accessTokenHash: "hidden",
    createdAt: new Date(),
  },
};

describe("emergency takeover operation identity", () => {
  const fingerprint = fingerprintEmergencyIntent(
    request,
    actorId,
    session,
    request.reason,
  );

  it("is stable for an identical retry even with a replacement access credential", () => {
    const retry = {
      ...request,
      staffSessionContext: {
        ...request.staffSessionContext,
        accessTokenHash: "new-credential-hash",
      },
    };
    expect(
      fingerprintEmergencyIntent(retry, actorId, session, request.reason),
    ).toBe(fingerprint);
    expect(fingerprint).toMatch(/^[a-f\d]{64}$/);
  });

  it("binds the actor, target, scope, expected version and reason", () => {
    expect(
      fingerprintEmergencyIntent(
        request,
        randomUUID(),
        session,
        request.reason,
      ),
    ).not.toBe(fingerprint);
    expect(
      fingerprintEmergencyIntent(
        { ...request, expectedVersion: 5 },
        actorId,
        session,
        request.reason,
      ),
    ).not.toBe(fingerprint);
    expect(
      fingerprintEmergencyIntent(
        { ...request, targetAssigneeMembershipId: randomUUID() },
        actorId,
        session,
        request.reason,
      ),
    ).not.toBe(fingerprint);
    expect(
      fingerprintEmergencyIntent(
        request,
        actorId,
        { ...session, location_id: randomUUID() },
        request.reason,
      ),
    ).not.toBe(fingerprint);
    expect(
      fingerprintEmergencyIntent(request, actorId, session, "Different cause"),
    ).not.toBe(fingerprint);
  });

  it("returns the original recorded result or a payload conflict", () => {
    const receipt: EmergencyTakeoverReceipt = {
      organization_id: organizationId,
      operation_id: operationId,
      task_id: taskId,
      actor_membership_id: actorId,
      previous_assignee_membership_id: randomUUID(),
      new_assignee_membership_id: replacementId,
      expected_task_version: 4,
      result_task_version: 5,
      expected_session_version: 8,
      result_session_version: 9,
      request_fingerprint: fingerprint,
    };
    expect(replayEmergencyReceipt(receipt, fingerprint)).toEqual({
      operationId,
      replayed: true,
      sessionVersion: 9,
      task: {
        id: taskId,
        status: "IN_PROGRESS",
        version: 5,
        assigneeMembershipId: replacementId,
      },
    });
    expect(() => replayEmergencyReceipt(receipt, "f".repeat(64))).toThrowError(
      expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }),
    );
  });
});
