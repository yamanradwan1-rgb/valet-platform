import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManagementAlertMfaFixture } from "./management-alert-mfa-fixture";

/** Real mounted Nest HTTP + PG17, not a mocked source/controller. */
const fixture = new ManagementAlertMfaFixture();
const flags = [
  "MANAGEMENT_ALERTS_PHASE1_ENABLED",
  "MANAGEMENT_ALERTS_PHASE23_ENABLED",
  "MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER",
  "MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER",
] as const;
const saved = Object.fromEntries(flags.map((key) => [key, process.env[key]]));
const path = (id: string) => "/v1/staff/dashboard/locations/" + id + "/alerts";
let admin: Awaited<ReturnType<typeof fixture.createAssuredAdmin>>;
let lm: Awaited<ReturnType<typeof fixture.createManager>>;

beforeAll(async () => {
  // Defense in depth: do not allow the legacy fixture's 5432 fallback, even
  // when invoked through a nonstandard runner. Global setup must own a lease.
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || !process.env.VAYLET_TEST_RUN_ID) {
    throw new Error(
      "Issue414 P23 HTTP requires an owned disposable PG17 lease.",
    );
  }
  const url = new URL(raw);
  const ci =
    process.env.CI === "true" &&
    process.env.GITHUB_ACTIONS === "true" &&
    process.env.VAYLET_ISSUE215_TEST_TARGET === "ci" &&
    Boolean(process.env.VAYLET_ISSUE215_CI_POSTGRES_CONTAINER_ID);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.password ||
    url.search ||
    url.hash ||
    process.env.NODE_ENV === "production" ||
    (ci
      ? url.hostname !== "localhost" ||
        url.port !== "5432" ||
        url.username !== "valet" ||
        url.pathname !== "/valet"
      : url.hostname !== "127.0.0.1" ||
        url.port !== "45432" ||
        url.username !== "vaylet_test_admin" ||
        url.pathname !== "/vaylet_test")
  ) {
    throw new Error(
      "Issue414 P23 HTTP refuses an unverified PG17 test target.",
    );
  }
  process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED = "disabled";
  process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "disabled";
  await fixture.start();
  const clock = await fixture.query<{ at: Date }>(
    "SELECT clock_timestamp()::timestamptz(3) AS at",
  );
  // Disposable PG fixture is quiescent: this is NOT a production cutover.
  const cutover = clock.rows[0]!.at.toISOString();
  process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER = cutover;
  process.env.MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER = cutover;
  admin = await fixture.createAssuredAdmin();
  lm = await fixture.createManager(admin.membership.organizationId);
  await fixture.grantLocation(
    admin.membership.organizationId,
    lm.membershipId,
    admin.location.locationId,
  );
}, 180_000);

afterAll(async () => {
  try {
    await fixture.stop();
  } finally {
    for (const key of flags) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}, 120_000);

describe("Issue414 P23 mounted HTTP versioning, roles and retirement", () => {
  it("retains P1 ABI and prevents V2 exposure unless both flags ON", async () => {
    const base = path(admin.location.locationId);
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "enabled";
    const p1Off = await fixture.managementGet(
      base + "/preview-unified",
      admin.auth.accessToken,
    );
    expect(p1Off.status).toBe(404);
    expect(p1Off.headers.get("cache-control")).toContain("no-store");
    process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED = "enabled";
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "disabled";
    expect(
      (
        await fixture.managementGet(
          base + "/preview-unified",
          admin.auth.accessToken,
        )
      ).status,
    ).toBe(404);
    const legacy = await fixture.managementGet(
      base + "/preview",
      admin.auth.accessToken,
    );
    expect(legacy.status).toBe(200);
    expect(legacy.body).toEqual({ items: [], count: 0, hasMore: false });
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "enabled";
    const sameLegacy = await fixture.managementGet(
      base + "/preview",
      admin.auth.accessToken,
    );
    expect(sameLegacy.status).toBe(200);
    expect(sameLegacy.body).toEqual(legacy.body);
    const v2 = await fixture.managementGet(
      base + "/preview-unified",
      admin.auth.accessToken,
    );
    expect(v2.status).toBe(200);
    expect(v2.body).toEqual({ items: [], count: 0, hasMore: false });
    expect(v2.headers.get("cache-control")).toContain("no-store");
  });

  it("CA and exact-granted LM see active stopped intake; never Seen an ACTIVE case", async () => {
    const id = admin.location.locationId;
    const base = path(id);
    await fixture.query(
      "UPDATE locations SET accepting_intake=FALSE,updated_at=clock_timestamp() WHERE id=$1",
      [id],
    );
    for (const bearer of [admin.auth.accessToken, lm.auth.accessToken]) {
      const response = await fixture.managementGet(
        base + "/preview-unified",
        bearer,
      );
      expect(response.status).toBe(200);
      const items = response.body?.items as Array<Record<string, unknown>>;
      const condition = items.find((item) => item.category === "ALT-16");
      expect(condition).toMatchObject({
        category: "ALT-16",
        caseKind: "ACTIVE",
        sourceId: id,
        episodeId: "current",
        occurredAt: null,
      });
      expect(condition).not.toHaveProperty("seen");
      const exact = await fixture.managementGet(
        base + "/sources-unified/ALT-16/" + id + "?episodeId=current",
        bearer,
      );
      expect(exact.status).toBe(200);
      expect(exact.body?.item).toMatchObject({
        sourceId: id,
        category: "ALT-16",
      });
      const noSeen = await fixture.managementPut(
        base + "/sources-unified/ALT-16/" + id + "/seen",
        bearer,
        { episodeId: randomUUID() },
      );
      expect(noSeen.status).not.toBe(200);
    }
  });

  it("revoked LM cannot read, and resumption retires ALT16 and exact detail", async () => {
    const id = admin.location.locationId;
    const base = path(id);
    const other = await fixture.addLocation(admin.membership.organizationId);
    const foreign = await fixture.managementGet(
      path(other.locationId) + "/preview-unified",
      lm.auth.accessToken,
    );
    expect(foreign.status).not.toBe(200);
    expect(foreign.body?.items).toBeUndefined();
    await fixture.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
      [lm.membershipId, id],
    );
    const revoked = await fixture.managementGet(
      base + "/preview-unified",
      lm.auth.accessToken,
    );
    expect(revoked.status).not.toBe(200);
    expect(revoked.body?.items).toBeUndefined();
    await fixture.query(
      "UPDATE locations SET accepting_intake=TRUE,updated_at=clock_timestamp() WHERE id=$1",
      [id],
    );
    const current = await fixture.managementGet(
      base + "/preview-unified",
      admin.auth.accessToken,
    );
    expect(current.status).toBe(200);
    expect(
      (current.body?.items as Array<{ category: string }>).some(
        (item) => item.category === "ALT-16",
      ),
    ).toBe(false);
    expect(
      (
        await fixture.managementGet(
          base + "/sources-unified/ALT-16/" + id + "?episodeId=current",
          admin.auth.accessToken,
        )
      ).status,
    ).toBe(404);
    const noToken = await fixture.request(base + "/preview-unified", {
      method: "GET",
    });
    expect(noToken.status).toBe(401);
    expect(noToken.headers.get("cache-control")).toContain("no-store");
  });
});
