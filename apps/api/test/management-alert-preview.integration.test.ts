import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { listManagementAlertPreview } from "../src/modules/dashboard/management-alert-preview-query";
import { readManagementAlertSourceDetail } from "../src/modules/dashboard/management-alert-source-detail-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const database = new DashboardOverviewTestContext(
  "414-alert-integrated-preview",
);
let context: StaffSessionContext;
let locationId: string;
let organizationId: string;
let cutoffBefore: string | undefined;

beforeAll(async () => {
  cutoffBefore =
    process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER;
  await database.setup();
  const fixture = await database.managerFixture();
  organizationId = fixture.organizationId;
  locationId = fixture.locationId;
  context = await database.staffSessionContext(fixture.userId);
  const clock = await database.adminPool.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
    clock.rows[0]!.now.toISOString();
}, 120_000);

afterAll(async () => {
  if (cutoffBefore === undefined) {
    delete process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER;
  } else {
    process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
      cutoffBefore;
  }
  await database.teardown();
}, 120_000);

const preview = () =>
  listManagementAlertPreview(database.runtimePool, { context, locationId });

describe("Issue #414 P1 integrated source-authorized alert preview (real PostgreSQL)", () => {
  it("includes source-entitled incidents without leaking ineligible sources", async () => {
    const before = await preview();
    expect(before).toEqual({ items: [], count: 0, hasMore: false });

    const sessionId = await database.seedSession({ state: "PARKED" });
    const incidentId = await database.seedIncident({
      sessionId,
      status: "OPEN",
    });
    const result = await preview();
    expect(
      result.items.find((item) => item.sourceId === incidentId),
    ).toMatchObject({
      sourceKind: "INCIDENT",
      severity: "IMPORTANT",
      category: "ALT-08",
      locationId,
    });
    expect(result.count).toBe(result.items.length);
    expect(result.hasMore).toBe(false);
    expect(JSON.stringify(result)).not.toContain("Details");
  });

  it("proves 20+ with 21 distinct current authorized cases", async () => {
    // The other tests intentionally keep eligible incidents. A separate
    // fixture is necessary: 21 new cases on top of one existing case would
    // exercise 22, never the exact 20 -> 21 overflow boundary.
    const isolated = new DashboardOverviewTestContext(
      "414-preview-exact-20-21",
    );
    await isolated.setup();
    try {
      const owner = await isolated.managerFixture();
      const sessionId = await isolated.seedSession({ state: "PARKED" });
      const isolatedContext = await isolated.staffSessionContext(owner.userId);
      const read = () =>
        listManagementAlertPreview(isolated.runtimePool, {
          context: isolatedContext,
          locationId: owner.locationId,
        });

      expect(await read()).toEqual({ items: [], count: 0, hasMore: false });
      const firstTwentyIds = await Promise.all(
        Array.from({ length: 20 }, () =>
          isolated.seedIncident({ sessionId, status: "OPEN" }),
        ),
      );
      expect(new Set(firstTwentyIds).size).toBe(20);
      const exactlyTwenty = await read();
      expect(exactlyTwenty).toMatchObject({ count: 20, hasMore: false });
      expect(exactlyTwenty.items).toHaveLength(20);
      expect(new Set(exactlyTwenty.items.map((item) => item.sourceId))).toEqual(
        new Set(firstTwentyIds),
      );

      const twentyFirstId = await isolated.seedIncident({
        sessionId,
        status: "OPEN",
      });
      const allAuthorizedIds = new Set([...firstTwentyIds, twentyFirstId]);
      expect(allAuthorizedIds.size).toBe(21);
      const overflow = await read();
      expect(overflow).toMatchObject({ count: 20, hasMore: true });
      expect(overflow.items).toHaveLength(20);
      const visible = overflow.items.map((item) => item.sourceId);
      expect(new Set(visible).size).toBe(20);
      expect(visible.every((id) => allAuthorizedIds.has(id))).toBe(true);
      expect(visible).toContain(twentyFirstId);
      expect(overflow.items.every((item) => item.category === "ALT-08")).toBe(
        true,
      );
    } finally {
      await isolated.teardown();
    }
  }, 120_000);

  it("reauthorizes a selected exact case and rejects old/foreign episodes", async () => {
    const selected = (await preview()).items[0]!;
    const exact = await readManagementAlertSourceDetail(database.runtimePool, {
      context,
      locationId,
      category: selected.category,
      sourceId: selected.sourceId,
      episodeId: selected.episodeId,
    });
    expect(exact.item).toEqual(selected);
    await expect(
      readManagementAlertSourceDetail(database.runtimePool, {
        context,
        locationId,
        category: selected.category,
        sourceId: selected.sourceId,
        episodeId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      readManagementAlertSourceDetail(database.runtimePool, {
        context,
        locationId,
        category: selected.category,
        sourceId: randomUUID(),
        episodeId: selected.episodeId,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("treats revoked Location rights as failure rather than authoritative zero", async () => {
    await database.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND location_id=$2`,
      [organizationId, locationId],
    );
    await expect(preview()).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });
});
