import assert from "node:assert/strict";
import pg from "pg";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Explicit G2 URL required");
const uri = new globalThis.URL(raw);
if (uri.hostname !== "127.0.0.1" || uri.port !== "55480" ||
    uri.pathname !== "/issue300_g2" || uri.search || uri.hash)
  throw new Error("Refusing any database other than task-owned G2");
const db = new pg.Client({ connectionString: raw,
  application_name: "issue300_option_b_runtime_acl_rollback" });
await db.connect();
let inTransaction = false;
async function denied(sql, params = [], code) {
  await db.query("SAVEPOINT denied_action");
  let error;
  try { await db.query(sql, params); } catch (caught) { error = caught; }
  await db.query("ROLLBACK TO SAVEPOINT denied_action");
  await db.query("RELEASE SAVEPOINT denied_action");
  assert.equal(error?.code,code, "DB must reject privilege or rewrite attempt");
}
try {
  assert.equal((await db.query("SELECT current_database() AS db")).rows[0].db,
    "issue300_g2");
  const source = (await db.query(`SELECT t.id AS task, s.id AS session,
      s.organization_id AS org, s.location_id AS loc
    FROM tasks t JOIN valet_sessions s ON s.id=t.valet_session_id
    JOIN organizations org ON org.id=s.organization_id
    WHERE org.name='Task Issue300' ORDER BY t.created_at,t.id LIMIT 1`)).rows[0];
  assert.ok(source?.task && source?.session);
  await db.query("BEGIN"); inTransaction = true;
  await db.query(`CREATE ROLE issue300_option_b_probe_role NOLOGIN NOSUPERUSER
    NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  await db.query(`GRANT USAGE ON SCHEMA public TO issue300_option_b_probe_role`);
  for (const table of ["tasks","valet_sessions"]) await db.query(
    `GRANT SELECT,UPDATE ON public.${table} TO issue300_option_b_probe_role`);
  await db.query("SET LOCAL ROLE issue300_option_b_probe_role");
  const role = (await db.query("SELECT current_user AS name")).rows[0].name;
  assert.equal(role,"issue300_option_b_probe_role");
  for (const table of ["tasks","valet_sessions"]) {
    const p = (await db.query(`SELECT
      has_table_privilege(current_user,$1,'UPDATE') AS write,
      has_table_privilege(current_user,$1,'DELETE') AS remove,
      has_table_privilege(current_user,$1,'TRUNCATE') AS truncate,
      has_table_privilege(current_user,$1,'TRIGGER') AS trigger,
      pg_has_role(current_user,(SELECT relowner FROM pg_class
        WHERE oid=$1::regclass),'MEMBER') AS owner`,
    [`public.${table}`])).rows[0];
    assert.deepEqual(Object.values(p),[true,false,false,false,false]);
  }
  await denied("DELETE FROM public.tasks WHERE id=$1",[source.task],"42501");
  await denied("TRUNCATE TABLE public.tasks",[],"42501");
  await denied("ALTER TABLE public.tasks DISABLE TRIGGER tasks_issue300_relation_immutable",[],"42501");
  await denied("SET LOCAL session_replication_role = replica",[],"42501");
  await denied("UPDATE public.tasks SET valet_session_id=$2 WHERE id=$1",
    [source.task,source.session === source.task ? source.loc : source.task],"23514");
  await denied("UPDATE public.valet_sessions SET vehicle_id=$2 WHERE id=$1",
    [source.session,source.task],"23514");
  await db.query("UPDATE public.tasks SET version=version+1 WHERE id=$1",
    [source.task]);
  await db.query("ROLLBACK"); inTransaction = false;
  globalThis.console.log("PASS Option B runtime ACL: role cannot delete/truncate/alter/disable triggers or change identity, can still update Task version, and test role rolls back");
} finally {
  if (inTransaction) await db.query("ROLLBACK").catch(() => undefined);
  await db.end();
}
