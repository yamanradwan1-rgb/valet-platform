import { describe, expect, it } from "vitest";

import { EmployeeApiError } from "./api-error";
import {
  activeParkingDetail,
  activeParkingTask,
  confirmParkedHarness,
  deferred,
  openConfirmParked,
  parkedDetail,
  parkedResponse,
  readyToConfirm,
} from "./employee-confirm-parked-test-fixture";
import { ids } from "./employee-operational-test-fixture";
import { parkingStartScope } from "./employee-parking-start-test-fixture";

function apiError(code: string, status: number) {
  return new EmployeeApiError({ code, message: code, status });
}

describe("MOB-012B protected attempt and recovery", () => {
  it("coalesces rapid Confirm Parked taps and freezes candidate changes", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    await readyToConfirm(session);
    const pending = deferred<ReturnType<typeof parkedResponse>>();
    transport.confirmResults.push(pending.promise);

    const first = session.confirmParked();
    const second = session.confirmParked();
    session.enterKeySlot("K-99");
    session.backToSpot();
    expect(first).toBe(second);
    expect(transport.confirmCalls).toHaveLength(1);
    expect(session.current()).toMatchObject({
      keySlotCandidate: "K-03",
      parkingSpotCandidate: "P-101",
      phase: "submitting",
    });

    pending.resolve(parkedResponse());
    await first;
    expect(session.current().phase).toBe("parked");
  });

  it("returns an occupied Spot to Spot selection with no automatic resend", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    await readyToConfirm(session);
    transport.confirmResults.push(
      Promise.reject(apiError("PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE", 409)),
    );
    transport.queueResults.push(
      Promise.resolve({ tasks: [activeParkingTask()] }),
    );
    transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
    await session.confirmParked();
    expect(session.current()).toMatchObject({
      conflict: "spot",
      keySlotCandidate: "",
      parked: null,
      parkingSpotCandidate: "",
      phase: "spot",
    });
    expect(transport.confirmCalls).toHaveLength(1);
  });

  it("returns a lost Key Slot to Slot selection and preserves only the Spot", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    await readyToConfirm(session);
    transport.confirmResults.push(
      Promise.reject(apiError("KEY_CUSTODY_NOT_READY", 409)),
    );
    transport.queueResults.push(
      Promise.resolve({ tasks: [activeParkingTask()] }),
    );
    transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
    await session.confirmParked();
    expect(session.current()).toMatchObject({
      conflict: "slot",
      keySlotCandidate: "",
      parkingSpotCandidate: "P-101",
      phase: "slot",
    });
    expect(transport.confirmCalls).toHaveLength(1);
  });

  it("refreshes stale versions without replaying the protected command", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    await readyToConfirm(session);
    transport.confirmResults.push(
      Promise.reject(apiError("VERSION_CONFLICT", 409)),
    );
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          activeParkingTask({
            valetSessionVersion: 4,
            version: 5,
          }),
        ],
      }),
    );
    transport.sessionResults.push(
      Promise.resolve(activeParkingDetail({ version: 4 })),
    );
    await session.confirmParked();
    expect(session.current()).toMatchObject({
      conflict: "stale",
      phase: "spot",
      session: { version: 4 },
      task: { version: 5 },
    });
    expect(transport.confirmCalls).toHaveLength(1);
  });

  it("adopts canonical PARKED after an ambiguous response without resending", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    await readyToConfirm(session);
    transport.confirmResults.push(
      Promise.reject(apiError("GATEWAY_TIMEOUT", 504)),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [] }));
    transport.sessionResults.push(Promise.resolve(parkedDetail()));
    await session.confirmParked();
    expect(session.current()).toMatchObject({
      parked: {
        keySlotCode: "K-03",
        parkingSpotCode: "P-101",
        source: "reconciliation",
      },
      phase: "parked",
    });
    expect(transport.confirmCalls).toHaveLength(1);
  });

  it("adopts canonical PARKED in a fresh process without transient candidates", async () => {
    const { session, transport } = confirmParkedHarness();
    transport.queueResults.push(Promise.resolve({ tasks: [] }));
    transport.sessionResults.push(Promise.resolve(parkedDetail()));

    await session.open(7, parkingStartScope, ids.task, ids.session);

    expect(session.current()).toMatchObject({
      keySlotCandidate: "",
      parked: {
        keySlotCode: "K-03",
        parkingSpotCode: "P-101",
        source: "reconciliation",
      },
      parkingSpotCandidate: "",
      phase: "parked",
    });
    expect(transport.confirmCalls).toHaveLength(0);
  });

  it("keeps unknown state ambiguous and Check Server State read-only", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    await readyToConfirm(session);
    transport.confirmResults.push(
      Promise.reject(apiError("REQUEST_TIMEOUT", 408)),
    );
    transport.queueResults.push(Promise.reject(apiError("UNAVAILABLE", 503)));
    transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
    await session.confirmParked();
    expect(session.current().phase).toBe("ambiguous");

    transport.queueResults.push(
      Promise.resolve({ tasks: [activeParkingTask()] }),
    );
    transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
    await session.checkServerState();
    expect(session.current().phase).toBe("spot");
    expect(transport.confirmCalls).toHaveLength(1);
  });
});
