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
    }),
  120_000,
);
afterAll(() => context.teardown(), 60_000);

describe("DEC-099 persistence and GPS-B closed strict release gate", () => {
  it("deploys migration 058 and backfills defaults on existing rows", async () => {
    const f = legacy;
    const result = await context.admin.query(
      `SELECT o.shift_start_presence_mode,o.shift_end_presence_mode,
      o.shift_presence_max_accuracy_meters,o.shift_presence_max_fix_age_seconds,
      l.shift_start_presence_mode_override,l.shift_end_presence_mode_override,l.shift_presence_revision
      FROM organizations o JOIN locations l ON l.organization_id=o.id WHERE l.id=$1`,
      [f.locationId],
    );
    expect(result.rows[0]).toEqual({
      shift_start_presence_mode: "OFF",
      shift_end_presence_mode: "OFF",
      shift_presence_max_accuracy_meters: 50,
      shift_presence_max_fix_age_seconds: 30,
      shift_start_presence_mode_override: null,
      shift_end_presence_mode_override: null,
      shift_presence_revision: 1,
    });
    expect(
      (
        await context.admin.query(
          `SELECT count(*)::int AS count FROM _prisma_migrations WHERE migration_name='20261004005800_shift_presence_foundation' AND finished_at IS NOT NULL`,
        )
      ).rows[0].count,
    ).toBe(1);
    for (const mode of ["REQUIRE", "REQUIRE_OR_OVERRIDE"]) {
      await expect(
        context.admin.query(
          `UPDATE organizations SET shift_start_presence_mode=$2 WHERE id=$1`,
          [f.organizationId, mode],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        context.admin.query(
          `UPDATE locations SET shift_end_presence_mode_override=$2 WHERE id=$1`,
          [f.locationId, mode],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }
    await context.admin.query(
      `UPDATE organizations SET shift_start_presence_mode='WARN_ONLY' WHERE id=$1`,
      [f.organizationId],
    );
    await context.admin.query(
      `UPDATE locations SET shift_end_presence_mode_override='WARN_ONLY' WHERE id=$1`,
      [f.locationId],
    );
  });
  it("enforces Company/Location threshold bounds and database revisions", async () => {
    const f = await context.fixture();
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
