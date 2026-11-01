import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as liveMapAuthorization from "../src/modules/tracking/live-map-read-authorization";
import {
  barrier,
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";
import {
  liveMapSentinel,
  prepareLiveMapScenario,
  revokeLiveMapGrant,
} from "./dashboard-issue333-live-map-fixture";

type HttpResult = Awaited<ReturnType<typeof fixture.managementGet>>;

const trace: Array<Record<string, unknown>> = [];

beforeAll(startIssue333Lab, 180_000);
afterAll(stopIssue333Lab, 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length > 0) {
    console.log("ISSUE333_LIVE_MAP_TRACE", JSON.stringify(trace.splice(0)));
  }
});

function route(locationId: string) {
  return `/v1/staff/locations/${locationId}/live-operations-map`;
}

function disclosed(result: HttpResult): boolean {
  return JSON.stringify(result.body ?? {}).includes(liveMapSentinel);
}

function expectDenied(result: HttpResult) {
  expect(result.status).toBe(404);
  expect(disclosed(result)).toBe(false);
  expect(result.body).not.toHaveProperty("items");
}

describe("Issue #333 P1-A: real HTTP Live Operations authorization interleavings", () => {
  it("revoker-first denies a subsequent authenticated read and conceals the vehicle", async () => {
    const subject = await prepareLiveMapScenario();
    const before = await fixture.managementGet(
      route(subject.locationId),
      subject.manager.accessToken,
    );
    expect(before.status).toBe(200);
    expect(disclosed(before)).toBe(true);
    await revokeLiveMapGrant(subject);
    trace.push({ event: "CANONICAL_HTTP_REVOKE_COMMITTED" });
    const after = await fixture.managementGet(
      route(subject.locationId),
      subject.manager.accessToken,
    );
    expectDenied(after);
    trace.push({ event: "REVOKER_FIRST_DENIED", status: after.status });
  }, 25_000);

  it("reader-first records the exact disclosure outcome after canonical revocation commits", async () => {
    const subject = await prepareLiveMapScenario();
    const entered = barrier();
    const release = barrier();
    const original = liveMapAuthorization.authorizeLiveMapRead;
    let paused = false;
    let readerPid = -1;
    vi.spyOn(liveMapAuthorization, "authorizeLiveMapRead").mockImplementation(
      async (...args) => {
        const authorized = await original(...args);
        if (
          !paused &&
          args[1].locationId === subject.locationId &&
          authorized !== null
        ) {
          paused = true;
          const identity = await args[0].query<{
            isolation: string;
            pid: number;
            snapshot: string;
          }>(`SELECT pg_backend_pid()::integer AS pid,
                     txid_current_snapshot()::text AS snapshot,
                     current_setting('transaction_isolation') AS isolation`);
          readerPid = identity.rows[0]!.pid;
          trace.push({
            event: "RR_AUTHORIZATION_OBSERVED",
            hasGrant: true,
            readerPid,
            isolation: identity.rows[0]!.isolation,
            snapshot: identity.rows[0]!.snapshot,
          });
          expect(identity.rows[0]!.isolation).toBe("repeatable read");
          entered.release();
          await release.promise;
        }
        return authorized;
      },
    );
    const reader = fixture.managementGet(
      route(subject.locationId),
      subject.manager.accessToken,
    );
    try {
      await Promise.race([
        entered.promise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Live Map authorization gate timed out")),
            5_000,
          ),
        ),
      ]);
      await revokeLiveMapGrant(subject);
      trace.push({ event: "CANONICAL_HTTP_REVOKE_COMMITTED" });
      const running = await fixture.query<{
        blockers: number[];
        state: string;
      }>(
        `SELECT pg_blocking_pids(pid) AS blockers, state
        FROM pg_stat_activity WHERE pid=$1`,
        [readerPid],
      );
      expect(running.rowCount).toBe(1);
      trace.push({
        event: "POSTGRES_READER_AFTER_WRITER_COMMIT",
        readerPid,
        blockers: running.rows[0]!.blockers,
        state: running.rows[0]!.state,
      });
      release.release();
      const result = await reader;
      trace.push({
        event: "READER_FIRST_AFTER_REVOKE",
        disclosure: disclosed(result),
        status: result.status,
      });
      expect([200, 404]).toContain(result.status);
      if (result.status === 200) expect(disclosed(result)).toBe(true);
      else expectDenied(result);
      expectDenied(
        await fixture.managementGet(
          route(subject.locationId),
          subject.manager.accessToken,
        ),
      );
    } finally {
      release.release();
      await Promise.allSettled([reader]);
    }
  }, 25_000);

  it("rejects both an ungranted same-Organization and a foreign-Organization reader", async () => {
    const subject = await prepareLiveMapScenario();
    const otherLocation = await fixture.addLocation(subject.organizationId);
    const foreignUser = await fixture.createUser();
    await fixture.createMembership(foreignUser.id, {
      role: "LOCATION_MANAGER",
    });
    const foreignSession = await fixture.nativeLogin(foreignUser);
    const sameOrg = await fixture.managementGet(
      route(otherLocation.locationId),
      subject.manager.accessToken,
    );
    const foreign = await fixture.managementGet(
      route(subject.locationId),
      foreignSession.accessToken,
    );
    expectDenied(sameOrg);
    expectDenied(foreign);
    trace.push({
      event: "OBJECT_SCOPE_NEGATIVES_DENIED",
      sameOrg: sameOrg.status,
      foreign: foreign.status,
    });
  }, 25_000);
});
