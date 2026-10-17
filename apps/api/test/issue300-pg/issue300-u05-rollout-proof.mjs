import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Require task-owned PostgreSQL credential");
const addr = new globalThis.URL(raw);
if (addr.hostname !== "127.0.0.1" || addr.port !== "55480" ||
    addr.pathname !== "/issue300_g2" || addr.search || addr.hash)
  throw new Error("Refusing any non-G2 database");
const original = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/database/prisma/migrations/20261018009400_issue_300_u05_birth_xid/migration.sql"),"utf8");
const probeSchema = "issue300_u05_atomic_probe";
const migration = original.replaceAll("public.key_custody_events",probeSchema+".custody")
  .replaceAll("public.dispatch_events",probeSchema+".dispatch")
  .replaceAll("public.incidents",probeSchema+".incident");
for (const name of ["custody", "dispatch", "incident"])
  assert.ok(migration.includes(probeSchema+"."+name));
const a = new pg.Client({ connectionString: raw,
  application_name: "issue300_u05_probe_writer_A" });
const b = new pg.Client({ connectionString: raw,
  application_name: "issue300_u05_probe_migrator_B" });
let schemaCreated = false;
await Promise.all([a.connect(),b.connect()]);
try {
  assert.equal((await a.query("SELECT current_database() AS db")).rows[0].db,
    "issue300_g2");
  const exists = (await a.query(
    `SELECT to_regnamespace($1) IS NOT NULL AS exists`, [probeSchema],
  )).rows[0].exists;
  if (exists) throw new Error("Probe schema unexpectedly exists; do not overwrite");
  await a.query(`CREATE SCHEMA ${probeSchema}`);
  schemaCreated = true;
  for (const name of ["custody","dispatch","incident"]) {
    await a.query(`CREATE TABLE ${probeSchema}.${name}(
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, value text NOT NULL)`);
    await a.query(`INSERT INTO ${probeSchema}.${name}(value) VALUES('legacy')`);
  }
  // R05: a statement fails mid-DDL and the entire transaction rolls back;
  // no partially exposed column/default/trigger on any of the three probes.
  await b.query("BEGIN");
  await b.query(`LOCK TABLE ${probeSchema}.custody, ${probeSchema}.dispatch,
    ${probeSchema}.incident IN ACCESS EXCLUSIVE MODE`);
  await b.query(`ALTER TABLE ${probeSchema}.custody
    ADD COLUMN pagination_birth_xid xid8`);
  await b.query("ROLLBACK");
  const colsBefore = await a.query(
    `SELECT count(*)::int AS total FROM information_schema.columns
      WHERE table_schema=$1 AND column_name='pagination_birth_xid'`, [probeSchema],
  );
  assert.equal(colsBefore.rows[0].total,0);
  globalThis.console.log("PASS U05-R05 subset: interrupted DDL transaction leaves zero partial columns/triggers");

  // Writer A holds RowExclusive before migration. B's exact three-table lock
  // must refuse progress; an intentionally shorter LOCAL lock timeout proves
  // full aborted activation without killing an operational process.
  await a.query("BEGIN");
  await a.query(`INSERT INTO ${probeSchema}.dispatch(value) VALUES('held-legacy')`);
  let timedOut = false;
  try {
    await b.query(migration.replace("SET LOCAL lock_timeout = '5s'",
      "SET LOCAL lock_timeout = '200ms'"));
  } catch (error) { timedOut = error.code === "55P03"; }
  assert.equal(timedOut,true,"DDL must fail closed on locked legacy writer");
  await b.query("ROLLBACK").catch(() => undefined);
  assert.equal((await a.query(
    `SELECT count(*)::int AS total FROM information_schema.columns
      WHERE table_schema=$1 AND column_name='pagination_birth_xid'`,
    [probeSchema])).rows[0].total,0);
  await a.query("COMMIT");
  globalThis.console.log("PASS U05-R04 subset: old writer blocks ACCESS EXCLUSIVE and lock timeout leaves all three schemas unchanged");

  // Start idle tx BEFORE activation, but write only AFTER it commits. With no
  // earlier table lock it must be marked, not misclassified as legacy.
  await a.query("BEGIN");
  await b.query(migration);
  const present = await b.query(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema=$1 AND column_name='pagination_birth_xid'`, [probeSchema],
  );
  assert.equal(present.rows.length,3);
  const xid = (await a.query("SELECT pg_current_xact_id()::text AS xid")).rows[0].xid;
  for (const name of ["custody","dispatch","incident"]) {
    const legacy = await b.query(
      `SELECT count(*) FILTER (WHERE pagination_birth_xid IS NULL)::int AS legacy
       FROM ${probeSchema}.${name}`);
    assert.ok(legacy.rows[0].legacy>=1);
    const newRow = await a.query(
      `INSERT INTO ${probeSchema}.${name}(value,pagination_birth_xid)
       VALUES('new-committed','1'::xid8)
       RETURNING pagination_birth_xid::text AS birth`);
    assert.equal(newRow.rows[0].birth,xid);
  }
  await a.query("COMMIT");
  globalThis.console.log("PASS U05-R04/R05 subset: migration94 body atomic across 3 copied source tables, legacy NULL retained, prestarted delayed writer marked after activation");
} finally {
  await a.query("ROLLBACK").catch(() => undefined);
  await b.query("ROLLBACK").catch(() => undefined);
  if (schemaCreated) {
    const check = await a.query("SELECT current_database() AS db");
    if (check.rows[0].db === "issue300_g2") {
      await a.query(`DROP SCHEMA ${probeSchema} CASCADE`);
      globalThis.console.log("PASS G2 rollout cleanup: only exact disposable issue300_u05_atomic_probe schema dropped");
    } else globalThis.process.exitCode = 1;
  }
  await Promise.all([a.end(),b.end()]);
}
