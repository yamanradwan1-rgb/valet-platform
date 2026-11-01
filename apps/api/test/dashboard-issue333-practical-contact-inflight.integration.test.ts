import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as contactAuthorization from "../src/modules/management/management-visit-contact-authorization";
import {
  contacts,
  practicalContactScenario,
  practicalRevoke,
  startPracticalContacts,
  stopPracticalContacts,
} from "./dashboard-issue333-practical-contact-fixture";

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((done) => {
    release = done;
  });
  return { promise, release };
}

async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Contact HTTP gate timed out")),
          8_000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

beforeAll(startPracticalContacts, 180_000);
afterEach(async () => {
  vi.restoreAllMocks();
  await contacts.resetLimits();
});
afterAll(stopPracticalContacts, 90_000);

describe("Issue #333 practical bounded in-flight Visit Contact response", () => {
  it("accepts pre-revoke admission but fresh A+B search projects B only", async () => {
    const s = await practicalContactScenario();
    const customerId = await contacts.createCustomer(
      s.organizationId,
      "+962790333999",
      "Practical Inflight",
    );
    const aVehicle = await contacts.createVehicle(s.organizationId, {
      plateNumber: "P333-INFLIGHT-A",
    });
    const bVehicle = await contacts.createVehicle(s.organizationId, {
      plateNumber: "P333-INFLIGHT-B",
    });
    for (const [locationId, vehicleId] of [
      [s.a, aVehicle],
      [s.b, bVehicle],
    ] as const) {
      await contacts.createVisit({
        customerId,
        locationId,
        membershipId: s.membershipId,
        organizationId: s.organizationId,
        vehicleId,
      });
    }
    const path = `/v1/staff/management/organizations/${s.organizationId}/visit-contacts?name=Practical%20Inflight`;
    const entered = latch();
    const release = latch();
    const original = contactAuthorization.authorizeVisitContactRead;
    let paused = false;
    vi.spyOn(
      contactAuthorization,
      "authorizeVisitContactRead",
    ).mockImplementation(async (...args) => {
      const viewer = await original(...args);
      if (!paused && viewer.membershipId === s.membershipId) {
        paused = true;
        entered.release();
        await release.promise;
      }
      return viewer;
    });
    const pending = contacts.managementGet(path, s.manager.accessToken);
    try {
      await bounded(entered.promise);
      await practicalRevoke(s);
      release.release();
      const earlier = await bounded(pending);
      expect([200, 404]).toContain(earlier.status);
      if (earlier.status === 200) {
        expect(JSON.stringify(earlier.body)).toContain(aVehicle);
      }
      const fresh = await contacts.managementGet(path, s.manager.accessToken);
      expect(fresh.status).toBe(200);
      expect(fresh.body?.items).toEqual([
        expect.objectContaining({
          completedVisitCount: 1,
          associatedVehicles: [
            expect.objectContaining({ vehicleId: bVehicle }),
          ],
        }),
      ]);
      expect(JSON.stringify(fresh.body)).not.toContain(aVehicle);
    } finally {
      release.release();
      await Promise.allSettled([pending]);
    }
  }, 35_000);
});
