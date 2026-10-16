import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = randomUUID().replaceAll("-", "");
const names = [`vlt_261_upgrade_${suffix}`, `vlt_261_fresh_${suffix}`];
const clients: Client[] = [];
const ids = Array.from({ length: 8 }, () => randomUUID());
const [org, location, user, member, vehicle, intake, completed, audit] = ids;
async function bootstrap(sql: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
async function apply(client: Client, name: string) {
  await client.query(
    await readFile(
      new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
      "utf8",
    ),
  );
}
async function shape(client: Client) {
  return (
    await client.query(`SELECT conname,pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid='valet_sessions'::regclass AND contype='c' ORDER BY conname`)
  ).rows;
}
beforeAll(async () => {
  for (const name of names) {
    await bootstrap(`CREATE DATABASE "${name}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    const client = new Client({ connectionString: url.toString() });
    await client.connect();
    clients.push(client);
  }
  for (const name of expectedMigrationDirectories.slice(0, 56))
    await apply(clients[0]!, name);
  for (const name of expectedMigrationDirectories)
    await apply(clients[1]!, name);
}, 120_000);
afterAll(async () => {
  for (const client of clients) await client.end();
  for (const name of names)
    await bootstrap(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}, 60_000);

describe("DEC-098 forward 057 migration from 056 and fresh database", () => {
  it("retains intake, completed-intake, credentials and append-only history without ACL drift", async () => {
    const db = clients[0]!;
    await db.query(
      "INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES($1,'Operator','ACTIVE','Asia/Amman',now())",
      [org],
    );
    await db.query(
      "INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at) VALUES($1,$2,'Hotel','AMM','Address','Asia/Amman','JOD','ACTIVE',now())",
      [location, org],
    );
    await db.query(
      "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'not-real','ACTIVE',now())",
      [user, `${suffix}@test.example`],
    );
    await db.query(
      "INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at) VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',now())",
      [member, org, user],
    );
    await db.query(
      "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'Historical vehicle',now())",
      [vehicle, org],
    );
    for (const session of [intake, completed])
      await db.query(
        `INSERT INTO valet_sessions
      (id,organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
       customer_access_token_hash,customer_access_expires_at,checking_in_completed_at,updated_at)
      VALUES($1::uuid,$2,$3,$4,$5,$6,'retained-credential:' || $1::text,now()+interval '1 hour',$7,now())`,
        [
          session,
          org,
          location,
          vehicle,
          session === intake ? "CANCELLED" : "AWAITING_PARKING",
          member,
          session === intake ? null : new Date("2026-10-03T10:00:00Z"),
        ],
      );
    await db.query(
      `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,actor_type,
      event_type,entity_type,entity_id,metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,'SYSTEM','PRESERVATION_CANARY','ValetSession',$4,'{"preserve":true}',now())`,
      [audit, org, location, completed],
    );
    const snapshot = async () => ({
      sessions: (
        await db.query("SELECT to_jsonb(s) FROM valet_sessions s ORDER BY id")
      ).rows,
      history: (
        await db.query("SELECT to_jsonb(a) FROM audit_events a ORDER BY id")
      ).rows,
    });
    const before = await snapshot();
    const permissions = async () => ({
      fn: (
        await db.query(
          "SELECT proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.management_location_has_blockers(uuid,uuid)'::regprocedure",
        )
      ).rows,
      tables: (
        await db.query(
          "SELECT relname,relacl FROM pg_class WHERE relname IN ('audit_events','dispatch_events','key_custody_events') ORDER BY relname",
        )
      ).rows,
    });
    const acl = await permissions();
    await expect(
      db.query("UPDATE valet_sessions SET state='CANCELLED' WHERE id=$1", [
        completed,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await apply(db, expectedMigrationDirectories[56]!);
    expect(await snapshot()).toEqual(before);
    expect(await permissions()).toEqual(acl);
    await db.query("UPDATE valet_sessions SET state='CANCELLED' WHERE id=$1", [
      completed,
    ]);
    expect(
      (
        await db.query(
          "SELECT checking_in_completed_at FROM valet_sessions WHERE id=$1",
          [completed],
        )
      ).rows[0].checking_in_completed_at,
    ).toEqual(new Date("2026-10-03T10:00:00Z"));
  });
  it("rejects every physical timestamp/resource shape for either terminal intake form", async () => {
    const db = clients[0]!;
    for (const session of [intake, completed]) {
      for (const column of [
        "parking_started_at",
        "parked_at",
        "retrieval_requested_at",
        "retrieval_started_at",
        "ready_at",
        "handoff_pending_at",
        "completed_at",
      ]) {
        await expect(
          db.query(`UPDATE valet_sessions SET ${column}=now() WHERE id=$1`, [
            session,
          ]),
        ).rejects.toMatchObject({ code: "23514" });
      }
      for (const column of [
        "completed_by_membership_id",
        "current_assignee_membership_id",
      ]) {
        await expect(
          db.query(`UPDATE valet_sessions SET ${column}=$2 WHERE id=$1`, [
            session,
            member,
          ]),
        ).rejects.toMatchObject({ code: "23514" });
      }
      // Existing scoped resources make the CHECK, rather than an absent FK target, decisive.
      const key = randomUUID();
      const zone = randomUUID();
      const spot = randomUUID();
      await db.query(
        "INSERT INTO key_slots(id,organization_id,location_id,code,status,updated_at) VALUES($1::uuid,$2,$3,$1::text,'ACTIVE',now())",
        [key, org, location],
      );
      await db.query(
        "INSERT INTO parking_zones(id,organization_id,location_id,code,label,status,updated_at) VALUES($1::uuid,$2,$3,$1::text,'Zone','ACTIVE',now())",
        [zone, org, location],
      );
      await db.query(
        "INSERT INTO parking_spots(id,organization_id,location_id,parking_zone_id,code,label,status,updated_at) VALUES($1::uuid,$2,$3,$4,$1::text,'Spot','ACTIVE',now())",
        [spot, org, location, zone],
      );
      for (const [column, value] of [
        ["key_slot_id", key],
        ["parking_zone_id", zone],
        ["parking_spot_id", spot],
      ])
        await expect(
          db.query(`UPDATE valet_sessions SET ${column}=$2 WHERE id=$1`, [
            session,
            value,
          ]),
        ).rejects.toMatchObject({ code: "23514" });
    }
    // Later migrations may add checks, but must retain every existing restriction.
    expect(await shape(clients[1]!)).toEqual(
      expect.arrayContaining(await shape(clients[0]!)),
    );
  });
});
