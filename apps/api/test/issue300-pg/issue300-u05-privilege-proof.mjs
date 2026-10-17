import assert from "node:assert/strict";
import pg from "pg";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Dedicated G2 URL required");
const u = new globalThis.URL(raw);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("Untrusted database connection");
const client = new pg.Client({ connectionString: raw,
  application_name: "issue300_u05_runtime_privilege_rollback" });
await client.connect();
let active = false;
async function denied(sql, pattern) {
  await client.query("SAVEPOINT u05_prohibit");
  let error;
  try { await client.query(sql); } catch (caught) { error = caught; }
  await client.query("ROLLBACK TO SAVEPOINT u05_prohibit");
  await client.query("RELEASE SAVEPOINT u05_prohibit");
  assert.ok(error, `Unsafe statement unexpectedly succeeded: ${pattern}`);
  assert.match(String(error.message), pattern);
}
try {
  assert.equal((await client.query("SELECT current_database() AS db")).rows[0].db,
    "issue300_g2");
  const p = (await client.query(
    `SELECT s.organization_id AS org,s.location_id AS loc,s.id AS session,
       s.checked_in_by_membership_id AS actor,t.id AS task,k.id AS slot
     FROM valet_sessions s JOIN tasks t ON t.organization_id=s.organization_id
       AND t.location_id=s.location_id AND t.valet_session_id=s.id
     JOIN key_slots k ON k.organization_id=s.organization_id
       AND k.location_id=s.location_id
     JOIN organizations org ON org.id=s.organization_id
     WHERE org.name='Task Issue300' LIMIT 1`,
  )).rows[0];
  assert.ok(p?.session && p?.task);
  // All role DDL and test inserts exist only inside this rollback-only
  // transaction in the dedicated G2 database. No prod/shared role changes.
  await client.query("BEGIN");
  active = true;
  await client.query("CREATE ROLE issue300_u05_proof_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
  await client.query("GRANT USAGE ON SCHEMA public TO issue300_u05_proof_role");
  for (const table of ["key_custody_events", "dispatch_events", "incidents"]) {
    await client.query(`GRANT SELECT, INSERT ON public.${table} TO issue300_u05_proof_role`);
  }
  await client.query("SET LOCAL ROLE issue300_u05_proof_role");
  assert.equal((await client.query("SELECT current_user AS role")).rows[0].role,
    "issue300_u05_proof_role");
  for (const name of ["key_custody_events", "dispatch_events", "incidents"]) {
    const check = (await client.query(
      `SELECT has_table_privilege(current_user,$1,'SELECT') AS read,
        has_table_privilege(current_user,$1,'INSERT') AS insert,
        has_table_privilege(current_user,$1,'UPDATE') AS update,
        has_table_privilege(current_user,$1,'DELETE') AS delete,
        has_table_privilege(current_user,$1,'TRUNCATE') AS truncate,
        has_table_privilege(current_user,$1,'TRIGGER') AS trigger,
        pg_has_role(current_user,(SELECT relowner FROM pg_class
          WHERE oid=$1::regclass),'MEMBER') AS owner`,
      [`public.${name}`],
    )).rows[0];
    assert.equal(check.read,true);assert.equal(check.insert,true);
    assert.equal(check.update,false);assert.equal(check.delete,false);
    assert.equal(check.truncate,false);assert.equal(check.trigger,false);
    assert.equal(check.owner,false);
  }
  await denied("ALTER TABLE public.incidents DISABLE TRIGGER incidents_pagination_birth_insert",/must be owner|permission denied/i);
  await denied("SET session_replication_role = replica",/permission denied|superuser/i);
  await denied("UPDATE public.incidents SET pagination_birth_xid='1'::xid8",/permission denied/i);
  await denied("DELETE FROM public.incidents WHERE FALSE",/permission denied/i);
  const current = (await client.query("SELECT pg_current_xact_id()::text AS xid")).rows[0].xid;
  const custody = (await client.query(
    `INSERT INTO public.key_custody_events(id,organization_id,location_id,
       valet_session_id,key_slot_id,actor_membership_id,event_type,pagination_birth_xid)
     VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'CHECKED_OUT','1'::xid8)
     RETURNING pagination_birth_xid::text AS marker`,
    [p.org,p.loc,p.session,p.slot,p.actor],
  )).rows[0];
  const dispatch = (await client.query(
    `INSERT INTO public.dispatch_events(id,organization_id,location_id,
       task_id,valet_session_id,event_type,actor_membership_id,
       new_assignee_membership_id,pagination_birth_xid)
     VALUES(gen_random_uuid(),$1,$2,$3,$4,'ASSIGNED',$5,$5,NULL)
     RETURNING pagination_birth_xid::text AS marker`,
    [p.org,p.loc,p.task,p.session,p.actor],
  )).rows[0];
  const incident = (await client.query(
    `INSERT INTO public.incidents(id,organization_id,location_id,
       valet_session_id,status,severity,type,description,
       reported_by_membership_id,pagination_birth_xid)
     VALUES(gen_random_uuid(),$1,$2,$3,'OPEN','LOW','TEST_ONLY',
       'G2 rollback only',$4,'1'::xid8)
     RETURNING pagination_birth_xid::text AS marker`,
    [p.org,p.loc,p.session,p.actor],
  )).rows[0];
  for (const value of [custody,dispatch,incident]) assert.equal(value.marker,current);
  await client.query("ROLLBACK");
  active = false;
  globalThis.console.log("PASS U05 local ACL: rollback-only NOLOGIN nonowner writer granted SELECT+INSERT but denied table UPDATE/DELETE/TRUNCATE/TRIGGER, DDL and replication bypass; explicit spoof/NULL markers overwritten across all three sources; proof role removed by ROLLBACK");
} finally {
  if (active) await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
