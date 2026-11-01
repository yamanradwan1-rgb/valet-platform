import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { StaffManagementMutationService } from "../src/modules/management/staff-management-mutation.service";
import { presenceReadBudget } from "../src/modules/management/presence-management-read-recovery";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceReadProbe } from "./shift-presence-read-probe";
import {
  presenceCommitBarrier,
  observePresenceCommandWait,
  abortPresenceCommitBarriers,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("issue406-read-contention");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);
afterEach(() => abortPresenceCommitBarriers());

describe("Issue 406: concurrent authorized configuration reads recover", () => {
  it.each(
    (["policy", "zones"] as const).flatMap((kind) =>
      (["COMMIT", "ROLLBACK"] as const).map((outcome) => ({ kind, outcome })),
    ),
  )(
    "held policy read vs $kind recovers after $outcome",
    async ({ kind, outcome }) => {
      const f = await db.createFixture();
      const firstActor = await db.manager(f);
      const secondActor = await db.manager(f, "LOCATION_MANAGER");
      const zoneId = await db.zone(f);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(gate.pool)
        .location(firstActor.context, firstActor.target)
        .catch((error) => error);
      await gate.atCommit;
      const probe = presenceReadProbe(db.runtimePool);
      const service = new PresenceManagementService(probe.pool);
      const second = (
        kind === "policy"
          ? service.location(secondActor.context, secondActor.target)
          : service.zones(secondActor.context, secondActor.target, {
              limit: 50,
            })
      ).catch((error) => error);
      await probe.atBusy; // Real false try-lock result, not an injected exception.
      gate.finish(outcome);
      await first;
      const result = await second;
      if (kind === "policy") expect(result.locationId).toBe(f.locationId);
      else
        expect(result.items.map((zone: { id: string }) => zone.id)).toEqual([
          zoneId,
        ]);
      expect(probe.errors).toEqual([]);
      expect(
        probe.statements.filter((sql) => sql === "BEGIN").length,
      ).toBeGreaterThan(1);
      expect(
        probe.statements.filter((sql) => sql === "BEGIN").length,
      ).toBeLessThanOrEqual(presenceReadBudget.attempts);
      expect(probe.statements).toContain("ROLLBACK");
      expect(probe.statements.at(-1)).toBe("COMMIT");
    },
  );

  it.each(["COMMIT", "ROLLBACK"] as const)(
    "configuration writer releases the earlier settings guard: %s",
    async (outcome) => {
      const f = await db.createFixture();
      const a = await db.manager(f);
      const b = await db.manager(f, "LOCATION_MANAGER");
      const gate = presenceCommitBarrier(db.runtimePool);
      const writer = new PresenceManagementService(gate.pool)
        .setCompany(a.context, a.companyTarget, {
          mutationId: randomUUID(),
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "WARN_ONLY",
        })
        .catch((error) => error);
      await gate.atCommit;
      const read = db.management.location(b.context, b.target);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await writer;
      expect((await read).effective.startMode).toBe(
        outcome === "COMMIT" ? "WARN_ONLY" : "OFF",
      );
    },
  );

  it("actual short staff-management activity recovers without stale authority", async () => {
    const f = await db.createFixture();
    const a = await db.manager(f);
    const b = await db.manager(f, "LOCATION_MANAGER");
    const gate = presenceCommitBarrier(db.runtimePool);
    const writer = new StaffManagementMutationService(gate.pool)
      .status(
        a.context,
        f.organizationId,
        f.membershipId,
        { expectedVersion: 1 },
        "INACTIVE",
      )
      .catch((error) => error);
    await gate.atCommit;
    const probe = presenceReadProbe(db.runtimePool);
    const read = new PresenceManagementService(probe.pool).location(
      b.context,
      b.target,
    );
    await probe.atBusy;
    gate.finish("COMMIT");
    await writer;
    expect((await read).locationId).toBe(f.locationId);
    expect(probe.errors).toEqual([]);
  });

  it("Company policy and individual zone reads also recover", async () => {
    const f = await db.createFixture();
    const a = await db.manager(f);
    const b = await db.manager(f);
    const zoneId = await db.zone(f);
    for (const kind of ["company", "zone"] as const) {
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(gate.pool)
        .location(a.context, a.target)
        .catch((error) => error);
      await gate.atCommit;
      const probe = presenceReadProbe(db.runtimePool);
      const service = new PresenceManagementService(probe.pool);
      const read =
        kind === "company"
          ? service.company(b.context, b.companyTarget)
          : service.zone(b.context, b.target, zoneId);
      await probe.atBusy;
      gate.finish("COMMIT");
      await first;
      expect(await read).toMatchObject(
        kind === "company"
          ? {
              organizationId: f.organizationId,
              capabilities: { canEdit: true },
            }
          : { zone: { id: zoneId } },
      );
    }
  });

  it("same-session policy and zones serialize without a false denial", async () => {
    const f = await db.createFixture();
    const a = await db.manager(f);
    const gate = presenceCommitBarrier(db.runtimePool);
    const first = new PresenceManagementService(gate.pool).location(
      a.context,
      a.target,
    );
    await gate.atCommit;
    const read = db.management.zones(a.context, a.target, { limit: 50 });
    await observePresenceCommandWait(db);
    gate.finish("COMMIT");
    await first;
    expect((await read).items).toEqual([]);
  });

  it("a held read in another Organization does not contend", async () => {
    const f = await db.createFixture();
    const other = await db.createFixture();
    const a = await db.manager(f);
    const b = await db.manager(other);
    const gate = presenceCommitBarrier(db.runtimePool);
    const first = new PresenceManagementService(gate.pool)
      .location(a.context, a.target)
      .catch((error) => error);
    await gate.atCommit;
    expect((await db.management.location(b.context, b.target)).locationId).toBe(
      other.locationId,
    );
    gate.finish("COMMIT");
    await first;
  });

  it("prolonged advisory contention exhausts finite attempts outside transactions", async () => {
    const f = await db.createFixture();
    const a = await db.manager(f);
    const b = await db.manager(f);
    const gate = presenceCommitBarrier(db.runtimePool);
    const first = new PresenceManagementService(gate.pool)
      .location(a.context, a.target)
      .catch((error) => error);
    await gate.atCommit;
    const probe = presenceReadProbe(db.runtimePool);
    const started = performance.now();
    await expect(
      new PresenceManagementService(probe.pool).location(b.context, b.target),
    ).rejects.toMatchObject({
      code: "PRESENCE_AUTHORITY_BUSY",
      origin: "ADVISORY_TRY_LOCK_BUSY",
    });
    expect(performance.now() - started).toBeLessThan(2500);
    const begins = probe.statements.filter((sql) => sql === "BEGIN").length;
    expect(begins).toBeGreaterThan(1);
    expect(begins).toBeLessThanOrEqual(presenceReadBudget.attempts);
    expect(probe.statements.filter((sql) => sql === "ROLLBACK")).toHaveLength(
      begins,
    );
    expect(
      probe.statements.some((sql) =>
        /^\s*(?:UPDATE|INSERT|DELETE)\b|^COMMIT$/.test(sql),
      ),
    ).toBe(false);
    gate.finish("COMMIT");
    await first;
  });

  it("a held settings lock is interrupted by the total read deadline", async () => {
    const f = await db.createFixture();
    const a = await db.manager(f);
    const holder = await db.adminPool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('management-settings-org:'||$1::text,0))",
        [f.organizationId],
      );
      const started = performance.now();
      await expect(
        db.management.location(a.context, a.target),
      ).rejects.toMatchObject({
        code: "PRESENCE_AUTHORITY_BUSY",
        origin: "READ_BUDGET_EXHAUSTED",
      });
      expect(performance.now() - started).toBeLessThan(2500);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    expect((await db.management.location(a.context, a.target)).locationId).toBe(
      f.locationId,
    );
  });
});
