import { describe, expect, it, vi } from "vitest";

import type { StartParkingPayload } from "../../features/check-in";
import type { Screen } from "../../types/employee-ui";
import { employeeDictionary } from "../../lib/i18n/dictionary";
import type {
  ActiveParkingTarget,
  ActiveRetrievalTarget,
} from "./employee-workspace";
import {
  keySlotGate,
  launchScanHubTile,
  licensePlateGate,
  parkingSpotGate,
  pickupHandoffGate,
  scanHubLaunchTarget,
} from "./scan-hub-tiles";

const PARKING_TARGET: ActiveParkingTarget = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskVersion: 3,
};

const PARKING_PAYLOAD: StartParkingPayload = {
  keySlotCode: "K-07",
  locationId: "33333333-3333-4333-8333-333333333333",
  parkingStartedAt: "2026-08-25T10:00:00.000Z",
  sessionId: "44444444-4444-4444-8444-444444444444",
  sessionVersion: 5,
  taskId: "55555555-5555-4555-8555-555555555555",
  taskVersion: 1,
  vehicle: {
    color: null,
    make: null,
    model: "Nissan Patrol",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
};

const RETRIEVAL_TARGET: ActiveRetrievalTarget = {
  currentAssigneeMembershipId: "66666666-6666-4666-8666-666666666666",
  sessionId: "77777777-7777-4777-8777-777777777777",
  taskId: "88888888-8888-4888-8888-888888888888",
  taskStatus: "IN_PROGRESS",
  taskVersion: 2,
};

describe("VUI-011B scan hub tile gates (DEC-066 §5)", () => {
  it("keeps the License Plate tile permanently available", () => {
    expect(licensePlateGate()).toEqual({
      available: true,
      disabledReasonKey: null,
    });
  });

  it("never enables the Key Slot tile and never gives it a route", () => {
    const gate = keySlotGate();
    expect(gate.available).toBe(false);
    expect(gate.disabledReasonKey).toBe("scanHubKeySlotDisabled");
    // No scan-first discovery and no blind Check-In routing.
    expect(scanHubLaunchTarget("keySlot")).toBeNull();
    expect(launchScanHubTile("keySlot", vi.fn())).toBe(false);
  });

  it("defines every disabled-reason key in BOTH English and Arabic", () => {
    const en = employeeDictionary("en");
    const ar = employeeDictionary("ar");
    for (const key of [
      "scanHubKeySlotDisabled",
      "scanHubParkingDisabled",
      "scanHubRetrievalDisabled",
    ] as const) {
      expect(typeof en[key]).toBe("string");
      expect(en[key].length).toBeGreaterThan(0);
      expect(typeof ar[key]).toBe("string");
      expect(ar[key].length).toBeGreaterThan(0);
    }
  });

  it("disables Parking Spot when no parking target AND no payload exist", () => {
    const gate = parkingSpotGate(null, null);
    expect(gate.available).toBe(false);
    expect(gate.disabledReasonKey).toBe("scanHubParkingDisabled");
  });

  it("enables Parking Spot from a target alone and echoes the SAME objects", () => {
    const gate = parkingSpotGate(PARKING_TARGET, null);
    expect(gate.available).toBe(true);
    expect(gate.disabledReasonKey).toBeNull();
    expect(gate.parkingTarget).toBe(PARKING_TARGET);
    expect(gate.parkingPayload).toBeNull();
    // No new identifiers are ever constructed.
    expect(scanHubLaunchTarget("parkingSpot")).toBe("parking");
  });

  it("enables Parking Spot from a payload alone and echoes the SAME objects", () => {
    const gate = parkingSpotGate(null, PARKING_PAYLOAD);
    expect(gate.available).toBe(true);
    expect(gate.parkingPayload).toBe(PARKING_PAYLOAD);
    expect(gate.parkingTarget).toBeNull();
  });

  it("disables Pickup/Handoff without an exact retrieval target", () => {
    const gate = pickupHandoffGate(null);
    expect(gate.available).toBe(false);
    expect(gate.disabledReasonKey).toBe("scanHubRetrievalDisabled");
  });

  it("enables Pickup/Handoff via the unchanged retrieval target only", () => {
    const gate = pickupHandoffGate(RETRIEVAL_TARGET);
    expect(gate.available).toBe(true);
    expect(gate.disabledReasonKey).toBeNull();
    expect(gate.retrievalTarget).toBe(RETRIEVAL_TARGET);
    expect(scanHubLaunchTarget("pickupHandoff")).toBe("retrieval");
  });
});

describe("VUI-011B scan hub launches", () => {
  function recordingNav(): { calls: Screen[]; nav: (s: Screen) => void } {
    const calls: Screen[] = [];
    return { calls, nav: (s: Screen) => void calls.push(s) };
  }

  it("routes License Plate to the existing Check-In flow", () => {
    const { calls, nav } = recordingNav();
    expect(launchScanHubTile("licensePlate", nav)).toBe(true);
    expect(calls).toEqual(["check-in"]);
  });

  it("routes contextual tiles to their own existing workflow screens", () => {
    const first = recordingNav();
    expect(launchScanHubTile("parkingSpot", first.nav)).toBe(true);
    expect(first.calls).toEqual(["parking"]);

    const second = recordingNav();
    expect(launchScanHubTile("pickupHandoff", second.nav)).toBe(true);
    expect(second.calls).toEqual(["retrieval"]);
  });
});
