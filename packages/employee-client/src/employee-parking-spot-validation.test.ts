import type { ParkingSpotValidationResponse } from "@valet/contracts";
import { describe, expect, it } from "vitest";
import { EmployeeApiError } from "./api-error";
import {
  activeParkingDetail,
  activeParkingTask,
  confirmParkedHarness,
  deferred,
  openConfirmParked,
  validatedSpot,
} from "./employee-confirm-parked-test-fixture";
import { createEmployeeConfirmParkedTransport } from "./employee-confirm-parked-transport";
import type { EmployeeClient } from "./employee-client";
import { ids } from "./employee-operational-test-fixture";

describe("#264 authoritative validation boundary", () => {
  it.each(["manual", "QR V1", "QR V2"])(
    "awaits current %s validation for numeric code",
    async (mode) => {
      const { session, transport } = confirmParkedHarness();
      await openConfirmParked(session, transport);
      const held = deferred<ParkingSpotValidationResponse>();
      transport.validationResults.push(held.promise);
      if (mode === "manual") session.enterParkingSpot(" 14 ");
      else
        expect(
          session.scanParkingSpot(
            mode === "QR V2"
              ? `vaylet:v2:parking-spot:${validatedSpot().parkingSpotId}:14`
              : "vaylet:parking-spot:14",
          ),
        ).toBe(true);
      const first = session.continueToKeySlot();
      expect(session.continueToKeySlot()).toBe(first);
      expect(transport.validationCalls).toHaveLength(1);
      expect(transport.validationCalls[0]?.input).toEqual({
        taskId: ids.task,
        expectedShiftId: session.current().scope!.shiftId,
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        parkingSpotCode: "14",
        ...(mode === "QR V2"
          ? { parkingSpotId: validatedSpot().parkingSpotId }
          : {}),
      });
      expect(session.current()).toMatchObject({
        phase: "spot",
        parkingSpotValidationPending: true,
      });
      session.enterKeySlot("K-03");
      held.resolve(validatedSpot({ parkingSpotCode: "14" }));
      await first;
      expect(session.current()).toMatchObject({
        phase: "slot",
        keySlotCandidate: "",
        parkingSpotValidationPending: false,
      });
      expect(transport.confirmCalls).toHaveLength(0);
    },
  );

  it.each([
    "wrong-location",
    "missing",
    "inactive",
    "occupied",
    "zone-incompatible",
  ])("retains correction and Scan again after concealed %s", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    session.enterParkingSpot("P-101");
    transport.validationResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
          status: 409,
          message: "Unavailable",
        }),
      ),
    );
    await session.continueToKeySlot();
    expect(session.current()).toMatchObject({
      phase: "spot",
      conflict: "spot",
      parkingSpotValidation: null,
    });
    session.enterParkingSpot("");
    expect(session.scanParkingSpot("vaylet:parking-spot:P-101")).toBe(true);
    await session.continueToKeySlot();
    expect(session.current().phase).toBe("slot");
  });

  it("allows network retry without ambiguous mutation or canonical reads", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    session.enterParkingSpot("P-101");
    transport.validationResults.push(Promise.reject(new Error("offline")));
    await session.continueToKeySlot();
    expect(session.current()).toMatchObject({
      phase: "spot",
      parkingSpotValidationPending: false,
    });
    expect(session.current().failure).not.toBeNull();
    await session.continueToKeySlot();
    expect(session.current().phase).toBe("slot");
  });

  it.each([
    { sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { sessionVersion: 4 },
    { taskVersion: 5 },
    { parkingSpotCode: "P-102" },
    { available: false },
    { parkingZoneId: "invalid" },
    { unexpected: true },
    { parkingSpotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  ])(
    "never substitutes a mismatched/malformed response %j",
    async (overrides) => {
      const { session, transport } = confirmParkedHarness();
      await openConfirmParked(session, transport);
      session.acceptParkingSpotScan({
        kind: "parking-spot",
        version: "V2",
        resourceCode: "P-101",
        resourceId: validatedSpot().parkingSpotId,
      });
      transport.validationResults.push(
        Promise.resolve({
          ...validatedSpot(),
          ...overrides,
        } as ParkingSpotValidationResponse),
      );
      await session.continueToKeySlot();
      expect(session.current()).toMatchObject({
        phase: "spot",
        parkingSpotValidation: null,
      });
    },
  );

  it("canonical refresh cannot accept text or reuse older accepted proof", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    session.enterParkingSpot("P-101");
    for (const validated of [false, true]) {
      if (validated) await session.continueToKeySlot();
      transport.queueResults.push(
        Promise.resolve({ tasks: [activeParkingTask()] }),
      );
      transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
      await session.checkServerState();
      expect(session.current()).toMatchObject({
        phase: "spot",
        parkingSpotValidation: null,
      });
    }
  });

  it("sends the exact staff GET and strictly parses success", async () => {
    const calls: unknown[] = [];
    const transport = createEmployeeConfirmParkedTransport({
      request: async (input: unknown) => {
        calls.push(input);
        return validatedSpot();
      },
    } as unknown as EmployeeClient);
    const query = {
      taskId: ids.task,
      expectedShiftId: ids.shift,
      expectedSessionVersion: 3,
      expectedTaskVersion: 4,
      parkingSpotCode: " P-101 ",
      parkingSpotId: validatedSpot().parkingSpotId,
    };
    expect(await transport.validateParkingSpot(ids.session, query)).toEqual(
      validatedSpot(),
    );
    expect(calls).toEqual([
      {
        method: "GET",
        path: `/v1/staff/valet-sessions/${ids.session}/parking-spot-validation`,
        params: {
          ...query,
          expectedSessionVersion: "3",
          expectedTaskVersion: "4",
          parkingSpotCode: "P-101",
        },
      },
    ]);
  });
});
