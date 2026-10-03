import type { ParkingSpotValidationResponse } from "@valet/contracts";
import { describe, expect, it } from "vitest";
import {
  activeParkingDetail,
  activeParkingTask,
  confirmParkedHarness,
  deferred,
  openConfirmParked,
  validatedSpot,
} from "./employee-confirm-parked-test-fixture";
import { ids } from "./employee-operational-test-fixture";
import { parkingStartScope } from "./employee-parking-start-test-fixture";

describe("#264 monotonic candidate and lifecycle fences", () => {
  it.each(["manual-B", "A-B-A", "same-code-other-ID", "scan-again", "back"])(
    "L264-3: stale success after %s cannot advance",
    async (change) => {
      const { session, transport } = confirmParkedHarness();
      await openConfirmParked(session, transport);
      session.acceptParkingSpotScan({
        kind: "parking-spot",
        version: "V2",
        resourceCode: "P-101",
        resourceId: validatedSpot().parkingSpotId,
      });
      const held = deferred<ParkingSpotValidationResponse>();
      transport.validationResults.push(held.promise);
      const operation = session.continueToKeySlot();
      if (change === "manual-B" || change === "A-B-A")
        session.enterParkingSpot("P-102");
      if (change === "A-B-A")
        session.acceptParkingSpotScan({
          kind: "parking-spot",
          version: "V2",
          resourceCode: "P-101",
          resourceId: validatedSpot().parkingSpotId,
        });
      if (change === "same-code-other-ID")
        session.acceptParkingSpotScan({
          kind: "parking-spot",
          version: "V2",
          resourceCode: "P-101",
          resourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        });
      if (change === "scan-again") session.enterParkingSpot("");
      if (change === "back") session.backToSpot();
      held.resolve(validatedSpot());
      await operation;
      expect(session.current()).toMatchObject({
        phase: "spot",
        parkingSpotValidation: null,
        parkingSpotValidationPending: false,
      });
    },
  );

  it("L264-3: stale failure cannot overwrite newer success", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    session.enterParkingSpot("P-101");
    const old = deferred<ParkingSpotValidationResponse>();
    transport.validationResults.push(old.promise);
    const first = session.continueToKeySlot();
    session.enterParkingSpot("P-102");
    await session.continueToKeySlot();
    const current = session.current();
    old.reject(new Error("old failure"));
    await first;
    expect(session.current()).toBe(current);
    expect(current.phase).toBe("slot");
  });

  it.each([
    "background",
    "clear",
    "reopen",
    "identity",
    "shift",
    "membership",
    "organization",
    "location",
    "task",
    "session",
  ])(
    "L264-4: late response after %s cannot affect current work",
    async (change) => {
      const { session, transport } = confirmParkedHarness();
      await openConfirmParked(session, transport);
      session.enterParkingSpot("P-101");
      const held = deferred<ParkingSpotValidationResponse>();
      transport.validationResults.push(held.promise);
      const old = session.continueToKeySlot();
      if (change === "background") session.suspendForBackground();
      else if (change === "clear") session.clear();
      else {
        const other = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        const scope = { ...parkingStartScope };
        if (change === "shift") scope.shiftId = other;
        if (change === "membership") scope.membershipId = other;
        if (change === "organization") scope.organizationId = other;
        if (change === "location") scope.locationId = other;
        const taskId = change === "task" ? other : ids.task;
        const sessionId = change === "session" ? other : ids.session;
        transport.queueResults.push(
          Promise.resolve({
            tasks: [
              activeParkingTask({
                taskId,
                sessionId,
                currentAssigneeMembershipId: scope.membershipId,
              }),
            ],
          }),
        );
        transport.sessionResults.push(
          Promise.resolve(
            activeParkingDetail({ sessionId, locationId: scope.locationId }),
          ),
        );
        await session.open(
          change === "identity" ? 8 : 7,
          scope,
          taskId,
          sessionId,
        );
      }
      const current = session.current();
      held.resolve(validatedSpot());
      await old;
      expect(session.current()).toBe(current);
      expect(current.parkingSpotValidation).toBeNull();
      expect(["spot", "inactive"]).toContain(current.phase);
    },
  );

  it.each(["back", "background"])(
    "accepted proof invalidates on %s and needs fresh Continue",
    async (change) => {
      const { session, transport } = confirmParkedHarness();
      await openConfirmParked(session, transport);
      session.enterParkingSpot("P-101");
      await session.continueToKeySlot();
      session.enterKeySlot("K-03");
      if (change === "back") session.backToSpot();
      else {
        session.suspendForBackground();
        transport.queueResults.push(
          Promise.resolve({ tasks: [activeParkingTask()] }),
        );
        transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
        await session.checkServerState();
      }
      expect(session.current()).toMatchObject({
        phase: "spot",
        parkingSpotValidation: null,
        keySlotCandidate: "",
        keySlotResourceId: null,
      });
      expect(transport.validationCalls).toHaveLength(1);
      await session.continueToKeySlot();
      expect(transport.validationCalls).toHaveLength(2);
      expect(session.current().phase).toBe("slot");
    },
  );
});
