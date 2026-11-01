import { randomUUID } from "node:crypto";

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

const mapPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/live-operations-map`;
const locationsPath = (organizationId: string) =>
  `/v1/staff/dashboard/organizations/${organizationId}/locations`;

async function within<T>(value: Promise<T>, what: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      value,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${what} timed out`)),
          8_000,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

beforeAll(startIssue333Lab, 180_000);
afterAll(stopIssue333Lab, 90_000);
afterEach(() => vi.restoreAllMocks());

describe("Issue #333 practical LocationAccess security gates", () => {
  it("honors committed revoke for new Live Map and Dashboard reads, retaining only B", async () => {
    const subject = await prepareLiveMapScenario();
    const retained = await fixture.addLocation(subject.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
      [subject.organizationId, subject.membershipId, retained.locationId],
    );
    const before = await fixture.managementGet(
      mapPath(subject.locationId),
      subject.manager.accessToken,
    );
    expect(before.status).toBe(200);
    expect(JSON.stringify(before.body)).toContain(liveMapSentinel);

    await revokeLiveMapGrant(subject);
    const map = await fixture.managementGet(
      mapPath(subject.locationId),
      subject.manager.accessToken,
    );
    expect(map.status).toBe(404);
    expect(JSON.stringify(map.body)).not.toContain(liveMapSentinel);
    const scope = await fixture.managementGet(
      locationsPath(subject.organizationId),
      subject.manager.accessToken,
    );
    expect(scope.status).toBe(200);
    expect(scope.body?.items).toEqual([
      expect.objectContaining({ locationId: retained.locationId }),
    ]);
    expect(JSON.stringify(scope.body)).not.toContain(subject.locationId);
  });

  it("permits a genuinely pre-authorized in-flight reply after revoke commit", async () => {
    const subject = await prepareLiveMapScenario();
    const authorized = barrier();
    const resume = barrier();
    const original = liveMapAuthorization.authorizeLiveMapRead;
    let paused = false;
    vi.spyOn(liveMapAuthorization, "authorizeLiveMapRead").mockImplementation(
      async (...args) => {
        const result = await original(...args);
        if (!paused && args[1].locationId === subject.locationId && result) {
          paused = true;
          authorized.release();
          await resume.promise;
        }
        return result;
      },
    );
    const pending = fixture.managementGet(
      mapPath(subject.locationId),
      subject.manager.accessToken,
    );
    try {
      await within(authorized.promise, "pre-revoke authorization");
      await revokeLiveMapGrant(subject);
      resume.release();
      const earlier = await within(pending, "in-flight HTTP completion");
      // The owner's practical contract explicitly accepts either completion
      // of a previously admitted request or best-effort cancellation.
      expect([200, 404]).toContain(earlier.status);
      if (earlier.status === 200) {
        expect(JSON.stringify(earlier.body)).toContain(liveMapSentinel);
      } else {
        expect(JSON.stringify(earlier.body)).not.toContain(liveMapSentinel);
      }
      const fresh = await fixture.managementGet(
        mapPath(subject.locationId),
        subject.manager.accessToken,
      );
      expect(fresh.status).toBe(404);
      expect(JSON.stringify(fresh.body)).not.toContain(liveMapSentinel);
    } finally {
      resume.release();
      await Promise.allSettled([pending]);
    }
  }, 30_000);

  it("keeps foreign tenants, ungranted Locations and Supervisor shift scope concealed", async () => {
    const subject = await prepareLiveMapScenario();
    const ungranted = await fixture.addLocation(subject.organizationId);
    const outsider = await fixture.createUser();
    await fixture.createMembership(outsider.id, { role: "LOCATION_MANAGER" });
    const foreign = await fixture.nativeLogin(outsider);
    for (const [locationId, token] of [
      [ungranted.locationId, subject.manager.accessToken],
      [subject.locationId, foreign.accessToken],
    ] as const) {
      const response = await fixture.managementGet(mapPath(locationId), token);
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain(liveMapSentinel);
    }
    const supervisor = await fixture.createUser();
    const supervisorMembership = await fixture.addMembership(
      subject.organizationId,
      supervisor.id,
      "VALET_SUPERVISOR",
    );
    await fixture.query(
      `INSERT INTO membership_location_access
        (organization_id, membership_id, location_id) VALUES ($1,$2,$3)`,
      [subject.organizationId, supervisorMembership, subject.locationId],
    );
    const access = await fixture.nativeLogin(supervisor);
    const route = mapPath(subject.locationId);
    expect(
      (await fixture.managementGet(route, access.accessToken)).status,
    ).toBe(404);
    const shiftId = randomUUID();
    await fixture.query(
      `INSERT INTO shifts
        (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
      [
        shiftId,
        subject.organizationId,
        subject.locationId,
        supervisorMembership,
      ],
    );
    expect(
      (await fixture.managementGet(route, access.accessToken)).status,
    ).toBe(200);
    await fixture.query(
      `UPDATE shifts SET status='ENDED', ended_at=clock_timestamp() WHERE id=$1`,
      [shiftId],
    );
    expect(
      (await fixture.managementGet(route, access.accessToken)).status,
    ).toBe(404);
  });

  it("requires Company Admin MFA before the same protected Live Map read", async () => {
    const subject = await prepareLiveMapScenario();
    const user = await fixture.createUser();
    await fixture.addMembership(subject.organizationId, user.id, "ORG_ADMIN");
    const admin = await fixture.nativeLogin(user);
    const path = mapPath(subject.locationId);
    expect((await fixture.managementGet(path, admin.accessToken)).status).toBe(
      403,
    );
    await fixture.enrollAndAssure(admin);
    const accepted = await fixture.managementGet(path, admin.accessToken);
    expect(accepted.status).toBe(200);
    expect(JSON.stringify(accepted.body)).toContain(liveMapSentinel);
  });
});
