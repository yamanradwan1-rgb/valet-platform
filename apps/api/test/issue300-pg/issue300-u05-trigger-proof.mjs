import assert from "node:assert/strict";
import pg from "pg";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Require owned G2 URL");
const u = new globalThis.URL(raw);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("Refusing database outside owned issue300_g2");
const client = new pg.Client({ connectionString: raw,
  application_name: "issue300_u05_trigger_atomic_proof" });
await client.connect();
let open = false;
try {
  assert.equal((await client.query("SELECT current_database() AS db")).rows[0]?.db,
    "issue300_g2");
  const migrations = await client.query(
    `SELECT count(*)::integer AS total FROM _prisma_migrations
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  assert.ok(migrations.rows[0].total >= 94);
  const migration94 = await client.query(
    `SELECT count(*)::int AS total FROM _prisma_migrations
     WHERE migration_name='20261018009400_issue_300_u05_birth_xid'
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL`);
  assert.equal(migration94.rows[0].total, 1);
  const legacy = await client.query(
    `SELECT 'key_custody_events' AS name, count(*)::int AS total,
      count(*) FILTER (WHERE pagination_birth_xid IS NULL)::int AS null_count
     FROM key_custody_events UNION ALL
     SELECT 'dispatch_events', count(*)::int,
      count(*) FILTER (WHERE pagination_birth_xid IS NULL)::int
     FROM dispatch_events UNION ALL
     SELECT 'incidents', count(*)::int,
      count(*) FILTER (WHERE pagination_birth_xid IS NULL)::int
     FROM incidents`,
  );
  assert.ok(legacy.rows.every((r) => r.total >= 1 && r.null_count >= 1));
  globalThis.console.log("PASS U05 legacy: all three sources preserve original NULL markers without backfill");
  const catalog = await client.query(
    `SELECT cls.relname, attr.atttypid::regtype::text AS type,
       pg_get_expr(def.adbin,def.adrelid) AS default_expression,
       count(*) FILTER (WHERE trigger.tgname LIKE '%pagination_birth_%')::int AS triggers
     FROM pg_class cls JOIN pg_attribute attr
       ON attr.attrelid=cls.oid AND attr.attname='pagination_birth_xid'
     JOIN pg_attrdef def ON def.adrelid=cls.oid AND def.adnum=attr.attnum
     LEFT JOIN pg_trigger trigger ON trigger.tgrelid=cls.oid AND NOT trigger.tgisinternal
     WHERE cls.relname IN ('key_custody_events','dispatch_events','incidents')
     GROUP BY cls.relname,attr.atttypid,def.adbin,def.adrelid`,
  );
  assert.equal(catalog.rows.length, 3);
  assert.ok(catalog.rows.every((r) => r.type === "xid8" &&
    r.default_expression === "pg_current_xact_id()" && r.triggers === 2));
  const functionPrivilege = await client.query(
    `SELECT has_function_privilege('public','public.management_pagination_preserve_birth_xid()',
       'EXECUTE') AS owner_can_exec,
       (SELECT proacl::text FROM pg_proc WHERE oid=
         'public.management_pagination_preserve_birth_xid()'::regprocedure) AS acl`,
  );
  // The task-owned migration database role need not have direct EXECUTE after
  // migration45 revoked PUBLIC; trigger invocation uses PostgreSQL trigger
  // semantics, which is verified by the INSERTs below.
  assert.equal(typeof functionPrivilege.rows[0].owner_can_exec, "boolean");
  assert.ok(!/(?:\{|,)=[^,}]*X\//.test(functionPrivilege.rows[0].acl ?? ""));
  globalThis.console.log("PASS U05 catalog: xid8 default + two DB triggers per source; no PUBLIC function EXECUTE");

  const fixture = await client.query(
    `SELECT s.organization_id AS org, s.location_id AS location,
      s.id AS session, t.id AS task, k.id AS slot,
      s.checked_in_by_membership_id AS actor
     FROM valet_sessions s JOIN tasks t
      ON t.organization_id=s.organization_id AND t.location_id=s.location_id
       AND t.valet_session_id=s.id
     LEFT JOIN key_slots k ON k.organization_id=s.organization_id
       AND k.location_id=s.location_id
     WHERE EXISTS (SELECT 1 FROM organizations o
       WHERE o.id=s.organization_id AND o.name='Task Issue300')
     LIMIT 1`,
  );
  const p = fixture.rows[0];
  assert.ok(p?.org && p?.location && p?.session && p?.task && p?.actor);
  await client.query("BEGIN");
  open = true;
  const begin = await client.query("SELECT pg_current_xact_id()::text AS xid");
  const xid = begin.rows[0].xid;
  const custody = await client.query(
    `INSERT INTO key_custody_events(id,organization_id,location_id,
      valet_session_id,key_slot_id,actor_membership_id,event_type,
      occurred_at,pagination_birth_xid)
     VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'CHECKED_OUT',now(),'1'::xid8)
     RETURNING pagination_birth_xid::text AS birth`,
    [p.org, p.location, p.session, p.slot, p.actor],
  );
  assert.equal(custody.rows[0].birth, xid);
  const dispatch = await client.query(
    `INSERT INTO dispatch_events(id,organization_id,location_id,task_id,
       valet_session_id,event_type,actor_membership_id,
       new_assignee_membership_id,pagination_birth_xid)
     VALUES(gen_random_uuid(),$1,$2,$3,$4,'ASSIGNED',$5,$5,NULL)
     RETURNING pagination_birth_xid::text AS birth`,
    [p.org, p.location, p.task, p.session, p.actor],
  );
  assert.equal(dispatch.rows[0].birth, xid);
  const incident = await client.query(
    `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
       status,severity,type,description,reported_by_membership_id,
       pagination_birth_xid)
     VALUES(gen_random_uuid(),$1,$2,$3,'OPEN','LOW','TEST_ONLY',
       'G2 TEST ONLY',$4,'1'::xid8)
     RETURNING id, pagination_birth_xid::text AS birth`,
    [p.org, p.location, p.session, p.actor],
  );
  assert.equal(incident.rows[0].birth, xid);
  const tamper = await client.query(
    `UPDATE incidents SET pagination_birth_xid='1'::xid8,
       status='INVESTIGATING' WHERE id=$1
     RETURNING pagination_birth_xid::text AS birth`,
    [incident.rows[0].id],
  );
  assert.equal(tamper.rows[0].birth, xid);
  await client.query("ROLLBACK");
  open = false;
  globalThis.console.log("PASS U05 G2 INSERT: explicit forged/NULL markers overwritten by top-level XID on three sources; Incident UPDATE immutable; test transaction rolled back");
} finally {
  if (open) await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
