import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = randomUUID().replaceAll("-", "");
const names = [`vlt_255_upgrade_${suffix}`, `vlt_255_fresh_${suffix}`];
const clients: Client[] = [];
const ids = Object.fromEntries(
  [
    "organization",
    "location",
    "user",
    "member",
    "vehicle",
    "session",
    "audit",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;
async function apply(client: Client, name: string) {
  await client.query(
    await readFile(
      new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
      "utf8",
    ),
  );
}
async function bootstrap(sql: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
async function auditRequiredFieldCodes(db: Client) {
  const codes: string[] = [];
  for (let missing = 0; missing < 7; missing += 1) {
    const values: unknown[] = [
      randomUUID(),
      ids.organization,
      "vehicle.recorded",
      "Vehicle",
      randomUUID(),
      { source: "integrity-test" },
      new Date(),
    ];
    values[missing] = null;
    try {
      await db.query(
        "INSERT INTO audit_events (id,organization_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at) VALUES($1,$2,'SYSTEM',$3,$4,$5,$6,$7)",
        values,
      );
      throw new Error("Expected invalid Audit input to fail");
    } catch (error) {
      codes.push((error as { code: string }).code);
    }
  }
  return codes;
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
  for (const name of expectedMigrationDirectories.slice(0, 54))
    await apply(clients[0]!, name);
  for (const name of expectedMigrationDirectories)
    await apply(clients[1]!, name);
}, 120_000);
afterAll(async () => {
  for (const client of clients) await client.end();
  for (const name of names)
    await bootstrap(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}, 60_000);

describe("Issue #255 fresh and forward migration from actual 054", () => {
  it("preserves pre-existing intake/credentials/audit and function ACL while adding terminal truth", async () => {
    const db = clients[0]!;
    await db.query(
      "INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES($1,'Operator','ACTIVE','Asia/Amman',now())",
      [ids.organization],
    );
    await db.query(
      "INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at) VALUES($1,$2,'Hotel','AMM','Address','Asia/Amman','JOD','ACTIVE',now())",
      [ids.location, ids.organization],
    );
    await db.query(
      "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'not-real','ACTIVE',now())",
      [ids.user, `${suffix}@test.example`],
    );
    await db.query(
      "INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at) VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',now())",
      [ids.member, ids.organization, ids.user],
    );
    await db.query(
      "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'History canary',now())",
      [ids.vehicle, ids.organization],
    );
    await db.query(
      `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,state,
      checked_in_by_membership_id,customer_access_token_hash,customer_access_expires_at,updated_at)
      VALUES($1,$2,$3,$4,'CHECKING_IN',$5,'historical-credential',now()+interval '1 hour',now())`,
      [ids.session, ids.organization, ids.location, ids.vehicle, ids.member],
    );
    await db.query(
      `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,actor_type,
      event_type,entity_type,entity_id,metadata_json,occurred_at) VALUES($1,$2,$3,$4,'SYSTEM',
      'PRESERVATION_CANARY','ValetSession',$4,'{"preserve":true}',now())`,
      [ids.audit, ids.organization, ids.location, ids.session],
    );
    const snapshot = () =>
      db.query(
        "SELECT to_jsonb(s) AS session,(SELECT to_jsonb(a) FROM audit_events a WHERE id=$2) AS audit FROM valet_sessions s WHERE id=$1",
        [ids.session, ids.audit],
      );
    const before = (await snapshot()).rows;
    const baselineAuditValidation = await auditRequiredFieldCodes(db);
    expect(baselineAuditValidation).toContain("42501");
    const acl = (
      await db.query(
        "SELECT proacl FROM pg_proc WHERE oid='public.management_location_has_blockers(uuid,uuid)'::regprocedure",
      )
    ).rows;
    for (const name of expectedMigrationDirectories.slice(54))
      await apply(db, name);
    expect((await snapshot()).rows).toEqual(before);
    expect(await auditRequiredFieldCodes(db)).toEqual(baselineAuditValidation);
    expect(
      (
        await db.query(
          "SELECT proacl FROM pg_proc WHERE oid='public.management_location_has_blockers(uuid,uuid)'::regprocedure",
        )
      ).rows,
    ).toEqual(acl);
    await db.query(
      "UPDATE valet_sessions SET state='CANCELLED',version=version+1 WHERE id=$1",
      [ids.session],
    );
    expect(
      (
        await db.query(
          "SELECT public.management_location_has_blockers($1,$2) AS blocked",
          [ids.organization, ids.location],
        )
      ).rows[0].blocked,
    ).toBe(false);
    await expect(
      db.query("UPDATE valet_sessions SET completed_at=now() WHERE id=$1", [
        ids.session,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await db.query(
      `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,state,
      checked_in_by_membership_id,customer_access_token_hash,customer_access_expires_at,updated_at)
      VALUES($1,$2,$3,$4,'CHECKING_IN',$5,'new-disabled-placeholder',now(),now())`,
      [randomUUID(), ids.organization, ids.location, ids.vehicle, ids.member],
    );
    expect(
      (
        await db.query(
          "SELECT public.management_location_has_blockers($1,$2) AS blocked",
          [ids.organization, ids.location],
        )
      ).rows[0].blocked,
    ).toBe(true);
  });
  it("preserves independent Shift and Task drain blockers after all custody rows are cancelled", async () => {
    const db = clients[0]!;
    const blocked = async () =>
      (
        await db.query(
          "SELECT public.management_location_has_blockers($1,$2) AS blocked",
          [ids.organization, ids.location],
        )
      ).rows[0].blocked;
    await db.query(
      "UPDATE valet_sessions SET state='CANCELLED' WHERE location_id=$1",
      [ids.location],
    );
    expect(await blocked()).toBe(false);
    const shiftId = randomUUID();
    await db.query(
      "INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at) VALUES($1,$2,$3,$4,'ACTIVE',now())",
      [shiftId, ids.organization, ids.location, ids.member],
    );
    expect(await blocked()).toBe(true);
    await db.query(
      "UPDATE shifts SET status='ENDED',ended_at=now() WHERE id=$1",
      [shiftId],
    );
    expect(await blocked()).toBe(false);
    const taskId = randomUUID();
    await db.query(
      "INSERT INTO tasks(id,organization_id,location_id,valet_session_id,task_type,status,updated_at) VALUES($1,$2,$3,$4,'PARKING','QUEUED',now())",
      [taskId, ids.organization, ids.location, ids.session],
    );
    expect(await blocked()).toBe(true);
    await db.query("UPDATE tasks SET status='CANCELLED' WHERE id=$1", [taskId]);
    expect(await blocked()).toBe(false);
  });
  it("fresh and upgraded indexes/checks/function security match exactly", async () => {
    const shape = async (client: Client) => {
      const indexes = (
        await client.query(
          "SELECT indexname,indexdef FROM pg_indexes WHERE tablename='valet_sessions' ORDER BY indexname",
        )
      ).rows;
      const checks = (
        await client.query(
          "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='valet_sessions'::regclass AND contype='c' ORDER BY conname",
        )
      ).rows;
      const fn = (
        await client.query(
          "SELECT prosecdef,proconfig,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid='public.management_location_has_blockers(uuid,uuid)'::regprocedure",
        )
      ).rows;
      return { indexes, checks, fn };
    };
    expect(await shape(clients[0]!)).toEqual(await shape(clients[1]!));
  });
});
