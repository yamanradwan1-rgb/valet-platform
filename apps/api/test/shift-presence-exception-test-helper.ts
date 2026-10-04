import { randomUUID } from "node:crypto";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import type { PresenceServerTestContext } from "./shift-presence-server-test-context";

export async function pendingPresenceException(
  db: PresenceServerTestContext,
  action: "START" | "END" = "START",
  role: "ORG_ADMIN" | "LOCATION_MANAGER" = "ORG_ADMIN",
) {
  const fixture = await db.createFixture();
  const shiftId =
    action === "END" ? (await db.start(fixture)).shiftId : undefined;
  await db.policy(fixture, "REQUIRE_OR_OVERRIDE");
  const requester = await db.session(fixture.userId);
  const challenge = await db.challenge(fixture, requester.context, shiftId);
  const exception = await db.presence.requestException(
    requester.context,
    challenge.operationId,
    { challengeId: challenge.challengeId, reason: "GPS_UNAVAILABLE" },
  );
  const manager = await db.manager(fixture, role);
  return {
    fixture,
    requester,
    challenge,
    exception,
    manager,
    shiftId,
    async approve() {
      return db.management.review(
        manager.context,
        manager.target,
        String(exception.exceptionId),
        { expectedRevision: 1, mutationId: randomUUID() },
        "APPROVED",
      );
    },
    consume(pool = db.runtimePool) {
      const presence = {
        kind: "EXCEPTION" as const,
        operationId: challenge.operationId,
        challengeId: challenge.challengeId,
        exceptionId: String(exception.exceptionId),
      };
      return action === "START"
        ? createStartShiftCommandExecutor(pool)({
            authenticatedUserId: fixture.userId,
            targetLocationId: fixture.locationId,
            sessionContext: requester.context,
            presence,
          })
        : createEndShiftCommandExecutor(pool)({
            authenticatedUserId: fixture.userId,
            shiftId: shiftId!,
            cashReported: "0",
            sessionContext: requester.context,
            presence,
          });
    },
  };
}
