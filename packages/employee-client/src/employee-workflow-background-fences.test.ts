import { describe, expect, it } from "vitest";
import {
  openParkingStart,
  parkingStartHarness,
  parkingStartedResult,
} from "./employee-parking-start-test-fixture";
import {
  confirmParkedHarness,
  deferred,
  openConfirmParked,
  parkedResponse,
  readyToConfirm,
} from "./employee-confirm-parked-test-fixture";
import {
  openRetrieval,
  retrievalHarness,
  startRetrievalResult,
} from "./employee-retrieval-flow-test-fixture";

describe("protected workflow background fences", () => {
  it("ignores a late Start Parking completion and requires safe reconciliation", async () => {
    const { session, transport } = parkingStartHarness();
    await openParkingStart(session);
    const result = deferred<ReturnType<typeof parkingStartedResult>>();
    transport.startResults.push(result.promise);
    const command = session.startParking();
    session.suspendForBackground();
    result.resolve(parkingStartedResult());
    await command;
    expect(session.current().phase).toBe("ambiguous");
    expect(transport.startCalls).toHaveLength(1);
  });

  it("ignores a late Confirm Parked completion and never replays it", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    readyToConfirm(session);
    const result = deferred<ReturnType<typeof parkedResponse>>();
    transport.confirmResults.push(result.promise);
    const command = session.confirmParked();
    session.suspendForBackground();
    result.resolve(parkedResponse());
    await command;
    expect(session.current().phase).toBe("ambiguous");
    expect(transport.confirmCalls).toHaveLength(1);
  });

  it("ignores a late Retrieval completion and never replays it", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    expect(session.confirmKeySlot()).toBe(true);
    const result = deferred<ReturnType<typeof startRetrievalResult>>();
    transport.startResults.push(result.promise);
    const command = session.startRetrieval();
    session.suspendForBackground();
    result.resolve(startRetrievalResult());
    await command;
    expect(session.current().phase).toBe("ambiguous");
    expect(transport.startCalls).toHaveLength(1);
  });
});
