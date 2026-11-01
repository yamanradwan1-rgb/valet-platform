import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { DashboardScopeDiscoveryService } from "../src/modules/dashboard/dashboard-scope-discovery.service";
import {
  barrier,
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";

const organizationsPath = "/v1/staff/dashboard/organizations";
const locationsPath = (organizationId: string) =>
  `${organizationsPath}/${organizationId}/locations`;

type HttpResult = Awaited<ReturnType<typeof fixture.managementGet>>;

function projectsProtectedItem(response: HttpResult, marker: string): boolean {
  const items = response.body?.items;
  return (
    Array.isArray(items) &&
    items.some(
      (item: { locationId?: string; organizationId?: string }) =>
        item.locationId === marker || item.organizationId === marker,
    )
  );
}

function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), 8_000);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

async function managerScenario() {
  const user = await fixture.createUser();
  const { membershipId, organizationId } = await fixture.createMembership(
    user.id,
    {
      role: "LOCATION_MANAGER",
    },
  );
  const location = await fixture.addLocation(organizationId);
  await fixture.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
    [organizationId, membershipId, location.locationId],
  );
  const manager = await fixture.nativeLogin(user);
  const adminUser = await fixture.createUser();
  await fixture.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
  const admin = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(admin);
  return {
    admin,
    locationId: location.locationId,
    manager,
    membershipId,
    organizationId,
  };
}

async function versionOf(membershipId: string): Promise<number> {
  const result = await fixture.query<{ version: number }>(
    "SELECT version FROM organization_memberships WHERE id=$1",
    [membershipId],
  );
  return result.rows[0]!.version;
}

function pauseAfterLocationsProjection(locationId: string) {
  const entered = barrier();
  const resume = barrier();
  const original = DashboardScopeDiscoveryService.prototype.listLocations;
  vi.spyOn(
    DashboardScopeDiscoveryService.prototype,
    "listLocations",
  ).mockImplementation(async function (
    this: DashboardScopeDiscoveryService,
    ...args
  ) {
    const projection = await original.apply(this, args);
    if (projection.items.some((item) => item.locationId === locationId)) {
      entered.release();
      await resume.promise;
    }
    return projection;
  });
  return { entered, resume };
}

function pauseAfterOrganizationsProjection(organizationId: string) {
  const entered = barrier();
  const resume = barrier();
  const original = DashboardScopeDiscoveryService.prototype.listOrganizations;
  vi.spyOn(
    DashboardScopeDiscoveryService.prototype,
    "listOrganizations",
  ).mockImplementation(async function (
    this: DashboardScopeDiscoveryService,
    ...args
  ) {
    const projection = await original.apply(this, args);
    if (
      projection.items.some((item) => item.organizationId === organizationId)
    ) {
      entered.release();
      await resume.promise;
    }
    return projection;
  });
  return { entered, resume };
}

async function runPostProjectionRace(options: {
  kind: string;
  marker: string;
  read: () => Promise<HttpResult>;
  write: () => Promise<HttpResult>;
  gate: ReturnType<typeof pauseAfterLocationsProjection>;
  enforceU001: boolean;
}) {
  let readerCompletedAt = 0;
  const reader = options.read().then((result) => {
    readerCompletedAt = performance.now();
    return result;
  });
  let writer: Promise<HttpResult> | undefined;
  let previous: HttpResult | undefined;
  let committed = 0;
  let writerStatus = 0;
  const started = performance.now();
  let writerCompletedAt = 0;
  try {
    // This gate follows the real PostgreSQL authorization SELECT and transaction.
    // The HTTP response has not been serialized/delivered at this point.
    await bounded(options.gate.entered.promise, "P1-B SQL projection gate");
    writer = options.write();
    const result = await bounded(writer, "P1-B canonical HTTP writer");
    writerCompletedAt = performance.now();
    writerStatus = result.status;
    expect(result.status).toBe(201);
    committed = 1;
  } finally {
    options.gate.resume.release();
    const settled = await Promise.allSettled([
      bounded(reader, "P1-B reader drain"),
      ...(writer === undefined ? [] : [bounded(writer, "P1-B writer drain")]),
    ]);
    if (settled[0]?.status === "fulfilled") previous = settled[0].value;
  }
  if (previous === undefined)
    throw new Error("P1-B HTTP reader did not drain.");
  const fresh = await bounded(options.read(), "P1-B fresh read");
  const oldDisclosure = projectsProtectedItem(previous, options.marker);
  const freshDisclosure = projectsProtectedItem(fresh, options.marker);
  console.log(
    "ISSUE333_P1B_POST_COMMIT",
    JSON.stringify({
      kind: options.kind,
      writerStatus,
      committed,
      readerStatus: previous.status,
      freshStatus: fresh.status,
      oldDisclosure,
      freshDisclosure,
      readerDeliveredAfterWriter: readerCompletedAt > writerCompletedAt,
      elapsedMs: Math.round(performance.now() - started),
      gate: "POST_REAL_SQL_TRANSACTION_PRE_HTTP_DELIVERY",
    }),
  );
  expect(previous.status).toBe(200);
  expect(fresh.status).toBe(200);
  expect(freshDisclosure).toBe(false);
  if (options.enforceU001) {
    // U-001 governs LocationAccess revocation. Other lifecycle transitions
    // retain their separately accepted in-flight semantics.
    expect(oldDisclosure).toBe(false);
  }
}

beforeAll(startIssue333Lab, 180_000);
afterAll(stopIssue333Lab, 90_000);
afterEach(() => vi.restoreAllMocks());

describe("Issue #333 P1-B: deterministic post-commit HTTP disclosure boundary", () => {
  it("does not deliver revoked Location after canonical grant revoke", async () => {
    const subject = await managerScenario();
    const retained = await fixture.addLocation(subject.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
      [subject.organizationId, subject.membershipId, retained.locationId],
    );
    const gate = pauseAfterLocationsProjection(subject.locationId);
    try {
      await runPostProjectionRace({
        kind: "LOCATION_GRANT_REVOKE",
        marker: subject.locationId,
        gate,
        enforceU001: true,
        read: () =>
          fixture.managementGet(
            locationsPath(subject.organizationId),
            subject.manager.accessToken,
          ),
        write: async () => {
          const result = await fixture.managementPost(
            `/v1/staff/management/organizations/${subject.organizationId}/staff/${subject.membershipId}/location-access/revoke`,
            subject.admin.accessToken,
            {
              expectedVersion: await versionOf(subject.membershipId),
              locationIds: [subject.locationId],
            },
          );
          const persisted = await fixture.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM membership_location_access
             WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
            [subject.organizationId, subject.membershipId, subject.locationId],
          );
          expect(persisted.rows[0]?.count).toBe("0");
          return result;
        },
      });
    } finally {
      gate.resume.release();
    }
  }, 40_000);

  for (const change of ["ROLE_DOWNGRADE", "MEMBERSHIP_DEACTIVATION"] as const) {
    it(`records the protected response after canonical ${change}`, async () => {
      const subject = await managerScenario();
      const gate = pauseAfterOrganizationsProjection(subject.organizationId);
      try {
        await runPostProjectionRace({
          kind: change,
          marker: subject.organizationId,
          gate,
          enforceU001: false,
          read: () =>
            fixture.managementGet(
              organizationsPath,
              subject.manager.accessToken,
            ),
          write: async () =>
            fixture.managementPost(
              `/v1/staff/management/organizations/${subject.organizationId}/staff/${subject.membershipId}/${change === "ROLE_DOWNGRADE" ? "role" : "deactivate"}`,
              subject.admin.accessToken,
              {
                expectedVersion: await versionOf(subject.membershipId),
                ...(change === "ROLE_DOWNGRADE"
                  ? { role: "VALET_EMPLOYEE" }
                  : {}),
              },
            ),
        });
      } finally {
        gate.resume.release();
      }
    }, 40_000);
  }
});
