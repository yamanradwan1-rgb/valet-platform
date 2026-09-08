import { describe, expect, it } from "vitest";

import {
  confirmParkedHarness,
  openConfirmParked,
  parkedResponse,
} from "./employee-confirm-parked-test-fixture";
import { ids } from "./employee-operational-test-fixture";

describe("MOB-012B Confirm Parked flow", () => {
  it("enforces Spot first, Key Slot second, then sends one exact atomic command", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    expect(session.current().phase).toBe("spot");

    session.enterKeySlot("K-03");
    session.continueToKeySlot();
    expect(session.current()).toMatchObject({
      keySlotCandidate: "",
      phase: "spot",
    });

    session.enterParkingSpot(" P-101 ");
    session.continueToKeySlot();
    expect(session.current()).toMatchObject({
      parkingSpotCandidate: "P-101",
      phase: "slot",
    });
    session.enterKeySlot(" K-03 ");
    expect(session.current()).toMatchObject({
      keySlotCandidate: "K-03",
      parked: null,
      phase: "ready",
    });

    transport.confirmResults.push(Promise.resolve(parkedResponse()));
    await session.confirmParked();
    expect(transport.confirmCalls).toEqual([
      {
        input: {
          expectedSessionVersion: 3,
          expectedTaskVersion: 4,
          keySlotCode: "K-03",
          parkingSpotCode: "P-101",
        },
        sessionId: ids.session,
      },
    ]);
    expect(session.current()).toMatchObject({
      parked: {
        keySlotCode: "K-03",
        response: parkedResponse(),
        source: "command",
      },
      phase: "parked",
    });
    expect(Object.keys(session.current()).join(" ")).not.toMatch(/retriev/i);
  });

  it("normalizes manual and QR input into the same candidate-only state", async () => {
    const manual = confirmParkedHarness();
    await openConfirmParked(manual.session, manual.transport);
    manual.session.enterParkingSpot(" P-101 ");
    manual.session.continueToKeySlot();
    manual.session.enterKeySlot(" K-03 ");

    const scanned = confirmParkedHarness();
    await openConfirmParked(scanned.session, scanned.transport);
    expect(scanned.session.scanParkingSpot(" vaylet:parking-spot:P-101 ")).toBe(
      true,
    );
    scanned.session.continueToKeySlot();
    expect(scanned.session.scanKeySlot("vaylet:key-slot:K-03")).toBe(true);
    expect(scanned.session.current()).toMatchObject({
      keySlotCandidate: manual.session.current().keySlotCandidate,
      parked: null,
      parkingSpotCandidate: manual.session.current().parkingSpotCandidate,
      phase: "ready",
    });
    expect(scanned.transport.confirmCalls).toHaveLength(0);
  });

  it("rejects wrong QR kinds without advancing the ordered flow", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    expect(session.scanParkingSpot("vaylet:key-slot:K-03")).toBe(false);
    expect(session.current().phase).toBe("spot");
    session.enterParkingSpot("P-101");
    session.continueToKeySlot();
    expect(session.scanKeySlot("vaylet:parking-spot:P-101")).toBe(false);
    expect(session.current().phase).toBe("slot");
  });
});
