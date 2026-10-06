import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PresenceTestContext,
  type PresenceFixture,
} from "./shift-presence-test-context.js";

const context = new PresenceTestContext();
let legacy: PresenceFixture;
beforeAll(
  () =>
    context.setup(async () => {
      legacy = await context.fixture();
      await context.admin.query(
        `UPDATE organizations SET shift_start_presence_mode='WARN_ONLY' WHERE id=$1`,
        [legacy.organizationId],
      );
      await context.admin.query(
        `UPDATE locations SET shift_end_presence_mode_override='WARN_ONLY' WHERE id=$1`,
        [legacy.locationId],
      );
    }, "20261007006900"),
  120_000,
);
afterAll(() => context.teardown(), 60_000);

describe("Issue #267 strict rollout activation persistence", () => {
  it("deploys migration 069 without converting existing policy rows", async () => {
    const f = legacy;
    const result = await context.admin.query(
      `SELECT o.shift_start_presence_mode,o.shift_end_presence_mode,
      o.shift_presence_revision AS organization_revision,
      l.shift_start_presence_mode_override,l.shift_end_presence_mode_override,l.shift_presence_revision
      FROM organizations o JOIN locations l ON l.organization_id=o.id WHERE l.id=$1`,
      [f.locationId],
    );
    expect(result.rows[0]).toEqual({
      shift_start_presence_mode: "WARN_ONLY",
      shift_end_presence_mode: "OFF",
      organization_revision: 2,
      shift_start_presence_mode_override: null,
      shift_end_presence_mode_override: "WARN_ONLY",
      shift_presence_revision: 2,
    });
    expect(
      (
        await context.admin.query(
          `SELECT count(*)::int AS count FROM _prisma_migrations WHERE migration_name='20261007006900_shift_presence_strict_rollout_activation' AND finished_at IS NOT NULL`,
        )
      ).rows[0].count,
    ).toBe(1);
    await context.admin.query(
      `UPDATE organizations SET shift_start_presence_mode='REQUIRE' WHERE id=$1`,
      [f.organizationId],
    );
    await context.admin.query(
      `UPDATE locations SET shift_end_presence_mode_override='REQUIRE_OR_OVERRIDE' WHERE id=$1`,
      [f.locationId],
    );
    expect(
      (
        await context.admin.query(
          `SELECT shift_start_presence_mode,shift_presence_revision FROM organizations WHERE id=$1`,
          [f.organizationId],
        )
      ).rows[0],
    ).toEqual({
      shift_start_presence_mode: "REQUIRE",
      shift_presence_revision: 3,
    });
    expect(
      (
        await context.admin.query(
          `SELECT shift_end_presence_mode_override,shift_presence_revision FROM locations WHERE id=$1`,
          [f.locationId],
        )
      ).rows[0],
    ).toEqual({
      shift_end_presence_mode_override: "REQUIRE_OR_OVERRIDE",
      shift_presence_revision: 3,
    });
  });
  it("removes release-only constraints while domain, thresholds and revisions remain guarded", async () => {
    const f = await context.fixture();
    expect(
      (
        await context.admin.query(
          `SELECT conname FROM pg_constraint WHERE conname IN
           ('organizations_presence_strict_release_closed','locations_presence_strict_release_closed')`,
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await context.admin.query(
          `SELECT conname FROM pg_constraint WHERE conname IN
           ('organizations_presence_accuracy','organizations_presence_age','organizations_presence_revision',
            'locations_presence_accuracy','locations_presence_age','locations_presence_revision')`,
        )
      ).rowCount,
    ).toBe(6);
    await expect(
      context.admin.query(
        `UPDATE organizations SET shift_start_presence_mode=$2 WHERE id=$1`,
        [f.organizationId, "INVALID_MODE"],
      ),
    ).rejects.toMatchObject({ code: "22P02" });
    for (const value of [0, 201]) {
      await expect(
        context.admin.query(
          `UPDATE organizations SET shift_presence_max_accuracy_meters=$2 WHERE id=$1`,
          [f.organizationId, value],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }
    await context.admin.query(
      `UPDATE organizations SET shift_presence_max_accuracy_meters=25 WHERE id=$1 AND shift_presence_revision=1`,
      [f.organizationId],
    );
    expect(
      (
        await context.admin.query(
          `SELECT shift_presence_revision FROM organizations WHERE id=$1`,
          [f.organizationId],
        )
      ).rows[0].shift_presence_revision,
    ).toBe(2);
    expect(
      (
        await context.admin.query(
          `UPDATE organizations SET shift_presence_max_accuracy_meters=30 WHERE id=$1 AND shift_presence_revision=1 RETURNING id`,
          [f.organizationId],
        )
      ).rowCount,
    ).toBe(0);
    await expect(
      context.admin.query(
        `UPDATE organizations SET shift_presence_revision=8 WHERE id=$1`,
        [f.organizationId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
