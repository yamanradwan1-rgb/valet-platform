import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ShiftTestContext } from "./shift-test-context";
import { presenceTransaction } from "./shift-presence-test-helpers";
import { allocatePresenceChallenge } from "../src/modules/shifts/shift-presence-challenge";
import { requestPresenceException } from "../src/modules/shifts/shift-presence-exception";

const db = new ShiftTestContext("presence-forward-existing-data");
const root = resolve("../../packages/database/prisma/migrations");
let migrations: string[];
beforeAll(async () => {
  const bootstrap = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  try {
    await bootstrap.query(`CREATE DATABASE "${db.databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  migrations = (await readdir(root))
    .filter((name) => /^\d{14}_/.test(name))
    .sort();
  // Execute the unchanged real SQL migrations, never schema synchronization.
  for (const name of migrations.filter((name) => name < "20261004006000")) {
    await db.adminPool.query(
      await readFile(resolve(root, name, "migration.sql"), "utf8"),
    );
  }
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("representative GPS-A data survives GPS-B forward migrations", () => {
  it("preserves OFF defaults, revisions, opaque intent and independent pending exception", async () => {
    const f = await db.createFixture();
    const op = {
      ...f,
      action: "START" as const,
      shiftId: null,
      operationId: randomUUID(),
      targetFingerprint: "a".repeat(64),
    };
    const challenge = await presenceTransaction(db.adminPool, (tx) =>
      allocatePresenceChallenge(tx, op),
    );
    const exception = await presenceTransaction(db.adminPool, (tx) =>
      requestPresenceException(tx, op, "GPS_UNAVAILABLE"),
    );
    for (const name of migrations.filter((name) => name >= "20261004006000")) {
      await db.adminPool.query(
        await readFile(resolve(root, name, "migration.sql"), "utf8"),
      );
    }
    expect(
      (
        await db.adminPool.query(
          `SELECT shift_start_presence_mode,shift_end_presence_mode,shift_presence_revision FROM organizations WHERE id=$1`,
          [f.organizationId],
        )
      ).rows[0],
    ).toEqual({
      shift_start_presence_mode: "OFF",
      shift_end_presence_mode: "OFF",
      shift_presence_revision: 1,
    });
    const row = (
      await db.adminPool.query(
        `SELECT target_fingerprint,request_fingerprint,request_policy_fingerprint,denial_reason,status FROM shift_presence_operations WHERE operation_id=$1`,
        [op.operationId],
      )
    ).rows[0];
    expect(row).toEqual({
      target_fingerprint: op.targetFingerprint,
      request_fingerprint: null,
      request_policy_fingerprint: null,
      denial_reason: null,
      status: "PENDING",
    });
    expect(
      (
        await db.adminPool.query(
          `SELECT id,expires_at,consumed_at FROM shift_presence_challenges WHERE id=$1`,
          [challenge.id],
        )
      ).rows[0],
    ).toMatchObject({
      id: challenge.id,
      expires_at: challenge.expires_at,
      consumed_at: null,
    });
    expect(
      (
        await db.adminPool.query(
          `SELECT status,revision,expiry_cause FROM shift_presence_exceptions WHERE id=$1`,
          [exception.id],
        )
      ).rows[0],
    ).toEqual({ status: "PENDING", revision: 1, expiry_cause: null });
    await expect(
      db.adminPool.query(
        `UPDATE organizations SET shift_start_presence_mode='REQUIRE' WHERE id=$1`,
        [f.organizationId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "organizations_presence_strict_release_closed",
    });
  });
});
