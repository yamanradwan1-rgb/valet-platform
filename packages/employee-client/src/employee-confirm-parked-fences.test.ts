import { describe, expect, it } from "vitest";

import {
  activeParkingDetail,
  activeParkingTask,
  confirmParkedHarness,
  deferred,
  openConfirmParked,
  parkedResponse,
  readyToConfirm,
} from "./employee-confirm-parked-test-fixture";
import { ids } from "./employee-operational-test-fixture";
import { parkingStartScope } from "./employee-parking-start-test-fixture";

describe("MOB-012B authority and late-result fences", () => {
  it("does not enable confirmation for a Task owned by another employee", async () => {
    const { session, transport } = confirmParkedHarness();
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          activeParkingTask({
            currentAssigneeMembershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          }),
        ],
      }),
    );
    transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
    await session.open(7, parkingStartScope, ids.task, ids.session);
    expect(session.current()).toMatchObject({
      conflict: "authority",
      phase: "unavailable",
    });
    session.enterParkingSpot("P-101");
    session.continueToKeySlot();
    session.enterKeySlot("K-03");
    await session.confirmParked();
    expect(transport.confirmCalls).toHaveLength(0);
  });

  it("treats a mismatched success response as ambiguous and never adopts it", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    readyToConfirm(session);
    transport.confirmResults.push(
      Promise.resolve(
        parkedResponse({
          taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      ),
    );
    transport.queueResults.push(
      Promise.resolve({ tasks: [activeParkingTask()] }),
    );
    transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
    await session.confirmParked();
    expect(session.current()).toMatchObject({ parked: null, phase: "ready" });
    expect(transport.confirmCalls).toHaveLength(1);
  });

  it.each([
    ["identity", 8, parkingStartScope],
    [
      "Location",
      7,
      {
        ...parkingStartScope,
        locationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    ],
    [
      "Shift",
      7,
      {
        ...parkingStartScope,
        shiftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    ],
    [
      "membership",
      7,
      {
        ...parkingStartScope,
        membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
    ],
    [
      "organization",
      7,
      {
        ...parkingStartScope,
        organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
    ],
  ] as const)(
    "ignores a late result after %s invalidation",
    async (_, generation, scope) => {
      const { session, transport } = confirmParkedHarness();
      await openConfirmParked(session, transport);
      readyToConfirm(session);
      const command = deferred<ReturnType<typeof parkedResponse>>();
      const queue = deferred<{
        tasks: ReturnType<typeof activeParkingTask>[];
      }>();
      const detail = deferred<ReturnType<typeof activeParkingDetail>>();
      transport.confirmResults.push(command.promise);
      const submitted = session.confirmParked();
      transport.queueResults.push(queue.promise);
      transport.sessionResults.push(detail.promise);
      void session.open(generation, scope, ids.task, ids.session);

      command.resolve(parkedResponse());
      await submitted;
      expect(session.current()).toMatchObject({
        identityGeneration: generation,
        parked: null,
        phase: "loading",
        scope,
      });
      session.clear();
    },
  );

  it("ignores a late result after Task and session workflow replacement", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    readyToConfirm(session);
    const command = deferred<ReturnType<typeof parkedResponse>>();
    const queue = deferred<{ tasks: ReturnType<typeof activeParkingTask>[] }>();
    const detail = deferred<ReturnType<typeof activeParkingDetail>>();
    transport.confirmResults.push(command.promise);
    const submitted = session.confirmParked();
    transport.queueResults.push(queue.promise);
    transport.sessionResults.push(detail.promise);
    void session.open(
      7,
      parkingStartScope,
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
    );
    command.resolve(parkedResponse());
    await submitted;
    expect(session.current()).toMatchObject({ parked: null, phase: "loading" });
    session.clear();
  });

  it("ignores a late command result after workflow purge", async () => {
    const { session, transport } = confirmParkedHarness();
    await openConfirmParked(session, transport);
    readyToConfirm(session);
    const command = deferred<ReturnType<typeof parkedResponse>>();
    transport.confirmResults.push(command.promise);
    const submitted = session.confirmParked();
    session.clear();
    command.resolve(parkedResponse());
    await submitted;
    expect(session.current()).toMatchObject({
      parked: null,
      phase: "inactive",
    });
  });
});
