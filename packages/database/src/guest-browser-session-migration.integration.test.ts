import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyBaselineMigrations,
  applyMigration,
  createDisposableDatabase,
  dropDisposableDatabase,
  guestBrowserT1Migration,
  hashGuestSecret,
  seedPreT1Session,
} from "./guest-browser-session-test-fixture.js";

interface PgError extends Error {
  code?: string;
}

const guestToken = "G".repeat(43);
const enrollmentToken = `vge1.${"E".repeat(43)}`;
const browserToken = `vgb1.${"B".repeat(43)}`;
const secondEnrollmentToken = `vge1.${"N".repeat(43)}`;
const secondBrowserToken = `vgb1.${"S".repeat(43)}`;

let databaseName = "";
let client: Client;
let realSessionId = "";
let disabledSessionId = "";

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_t1_migration");
  databaseName = database.databaseName;
  client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  await applyBaselineMigrations(client);
  realSessionId = (
    await seedPreT1Session(client, "real", hashGuestSecret(guestToken))
  ).sessionId;
  disabledSessionId = (
    await seedPreT1Session(
      client,
      "disabled",
      `disabled:intake:${randomUUID()}`,
    )
  ).sessionId;
  await applyMigration(client, guestBrowserT1Migration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
}, 60_000);

describe("DEC-064 T1 guest browser continuity migration", () => {
  it("adds generation/consume state and backfills legacy credentials", async () => {
    const columns = await client.query<{
      column_default: string | null;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name,data_type,is_nullable,column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='valet_sessions'
         AND column_name IN ('customer_access_generation','customer_access_consumed_at')
       ORDER BY column_name`,
    );
    expect(columns.rows).toEqual([
      {
        column_default: null,
        column_name: "customer_access_consumed_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      },
      {
        column_default: "0",
        column_name: "customer_access_generation",
        data_type: "integer",
        is_nullable: "NO",
      },
    ]);
    const state = await client.query<{
      customer_access_consumed_at: Date | null;
      customer_access_generation: number;
      id: string;
    }>(
      `SELECT id::text,customer_access_generation,customer_access_consumed_at
       FROM valet_sessions WHERE id=ANY($1::uuid[]) ORDER BY id`,
      [[realSessionId, disabledSessionId]],
    );
    const byId = new Map(state.rows.map((row) => [row.id, row]));
    expect(byId.get(realSessionId)).toMatchObject({
      customer_access_consumed_at: null,
      customer_access_generation: 1,
    });
    expect(byId.get(disabledSessionId)).toMatchObject({
      customer_access_consumed_at: null,
      customer_access_generation: 0,
    });
    await expect(
      client.query(
        `UPDATE valet_sessions SET customer_access_generation=-1 WHERE id=$1`,
        [realSessionId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "valet_sessions_customer_access_generation_check",
    });
  });

  it("creates bounded enrollment/session integrity constraints", async () => {
    const constraints = await client.query<{
      definition: string;
      table_name: string;
    }>(
      `SELECT c.relname AS table_name,pg_get_constraintdef(k.oid,true) AS definition
       FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
       WHERE c.relname IN ('guest_browser_enrollments','guest_browser_sessions')
       ORDER BY c.relname,k.conname`,
    );
    const definitions = constraints.rows.map(
      (row) => `${row.table_name}:${row.definition}`,
    );
    expect(
      definitions.some((value) => value.includes("expires_at > created_at")),
    ).toBe(true);
    expect(
      definitions.some(
        (value) =>
          value.includes("exchanged_at IS NULL") &&
          value.includes("credential_generation > 0"),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) => value.includes("credential_generation > 0")),
    ).toBe(true);
    expect(
      definitions.some((value) => value.includes("revoked_at >= created_at")),
    ).toBe(true);
  });

  it("rejects raw verifier material in enrollment hash columns", async () => {
    const invalidHashes = [
      [`vge1.${"R".repeat(43)}`, `sha256:v1:${"b".repeat(64)}`],
      [`sha256:v1:${"A".repeat(64)}`, `sha256:v1:${"b".repeat(64)}`],
      [`sha256:v1:${"a".repeat(63)}`, `sha256:v1:${"b".repeat(64)}`],
    ];
    for (const [enrollmentHash, browserHash] of invalidHashes) {
      let error: PgError | undefined;
      try {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO guest_browser_enrollments(
             enrollment_token_hash,browser_session_token_hash,expires_at)
           VALUES($1,$2,clock_timestamp()+interval '5 minutes') RETURNING id::text`,
          [enrollmentHash, browserHash],
        );
        await client.query(
          `DELETE FROM guest_browser_enrollments WHERE id=$1`,
          [inserted.rows[0]!.id],
        );
      } catch (caught) {
        error = caught as PgError;
      }
      expect(error?.code).toBe("23514");
    }
  });

  it("rejects raw verifier material in authorized browser session rows", async () => {
    const enrollment = await client.query<{ id: string }>(
      `INSERT INTO guest_browser_enrollments(
         enrollment_token_hash,browser_session_token_hash,expires_at)
       VALUES($1,$2,clock_timestamp()+interval '5 minutes') RETURNING id::text`,
      [`sha256:v1:${"a".repeat(64)}`, `sha256:v1:${"b".repeat(64)}`],
    );
    let error: PgError | undefined;
    try {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO guest_browser_sessions(
           valet_session_id,credential_generation,enrollment_id,token_hash)
         VALUES($1,1,$2,$3) RETURNING id::text`,
        [realSessionId, enrollment.rows[0]!.id, browserToken],
      );
      await client.query(`DELETE FROM guest_browser_sessions WHERE id=$1`, [
        inserted.rows[0]!.id,
      ]);
    } catch (caught) {
      error = caught as PgError;
    } finally {
      await client.query(`DELETE FROM guest_browser_enrollments WHERE id=$1`, [
        enrollment.rows[0]!.id,
      ]);
    }
    expect(error?.code).toBe("23514");
  });

  it("recovers the committed browser after bearer expiry without resurrecting revoked access", async () => {
    const enrolled = await client.query<{ result_code: string }>(
      `SELECT result_code FROM guest_browser_enroll($1,$2)`,
      [enrollmentToken, browserToken],
    );
    expect(enrolled.rows[0]?.result_code).toBe("OK");
    const first = await client.query<{
      result_code: string;
      valet_session_id: string | null;
    }>(
      `SELECT result_code,valet_session_id::text FROM guest_browser_exchange($1,$2,$3)`,
      [guestToken, enrollmentToken, browserToken],
    );
    expect(first.rows[0]).toEqual({
      result_code: "AUTHORIZED",
      valet_session_id: realSessionId,
    });
    const persisted = await client.query<{
      browser_hash: string;
      consumed_at: Date | null;
      enrollment_hash: string;
      generation: number;
    }>(
      `SELECT s.customer_access_consumed_at AS consumed_at,
              b.credential_generation AS generation,b.token_hash AS browser_hash,
              e.enrollment_token_hash AS enrollment_hash
       FROM valet_sessions s
       JOIN guest_browser_sessions b ON b.valet_session_id=s.id
       JOIN guest_browser_enrollments e ON e.id=b.enrollment_id
       WHERE s.id=$1`,
      [realSessionId],
    );
    expect(persisted.rows[0]).toMatchObject({
      browser_hash: hashGuestSecret(browserToken),
      enrollment_hash: hashGuestSecret(enrollmentToken),
      generation: 1,
    });
    expect(persisted.rows[0]!.consumed_at).toBeInstanceOf(Date);

    await client.query(
      `UPDATE valet_sessions
       SET customer_access_expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1`,
      [realSessionId],
    );

    const retry = await client.query<{ result_code: string }>(
      `SELECT result_code FROM guest_browser_exchange($1,$2,$3)`,
      [guestToken, enrollmentToken, browserToken],
    );
    expect(retry.rows[0]?.result_code).toBe("RECOVERED");

    await client.query(`SELECT guest_browser_enroll($1,$2)`, [
      secondEnrollmentToken,
      secondBrowserToken,
    ]);
    const swapped = await client.query<{ result_code: string }>(
      `SELECT result_code FROM guest_browser_exchange($1,$2,$3)`,
      [guestToken, secondEnrollmentToken, secondBrowserToken],
    );
    expect(swapped.rows[0]?.result_code).toBe("INVALID_ACCESS");

    await client.query(
      `UPDATE valet_sessions
       SET customer_access_revoked_at=clock_timestamp(),customer_access_generation=2
       WHERE id=$1`,
      [realSessionId],
    );
    const revokedRetry = await client.query<{ result_code: string }>(
      `SELECT result_code FROM guest_browser_exchange($1,$2,$3)`,
      [guestToken, enrollmentToken, browserToken],
    );
    expect(revokedRetry.rows[0]?.result_code).toBe("INVALID_ACCESS");
  });
});
