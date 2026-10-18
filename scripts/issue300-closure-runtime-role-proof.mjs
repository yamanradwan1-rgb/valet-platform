// R2 W6 actual ordinary role, marker and immutable-attribution proof.
// Only --execute under Prime's exclusive, expiring disposable lease touches SQL.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAttestedTarget, pgClient, validateSource } from "./issue300-closure-migration-proof.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseRoot = resolve(root, "../issue-300-final-closure-r2/packages/database");
const evidenceTables = ["audit_events", "key_custody_events", "dispatch_events"];

function assert(ok, reason) {
  if (!ok) throw Error(reason);
}

async function provision(target) {
  await new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, ["scripts/provision-runtime-role.mjs"], {
      cwd: databaseRoot, windowsHide: true,
      env: { ...process.env, NODE_ENV: "test",
        MIGRATION_DATABASE_URL: target.migrationUrl, DATABASE_URL: target.runtimeUrl },
      stdio: "ignore",
    });
    child.once("error", rejectChild);
    child.once("close", (code) => code === 0 ? resolveChild() :
      rejectChild(Error(`Actual provisioner exited ${code}; reconcile before retry`)));
  });
}

async function denial(client, sql, values = [], expected = ["42501"]) {
  await client.query("SAVEPOINT w6_denial");
  let code;
  try { await client.query(sql, values); }
  catch (error) { code = error.code; }
  await client.query("ROLLBACK TO SAVEPOINT w6_denial");
  await client.query("RELEASE SAVEPOINT w6_denial");
  assert(expected.includes(code), `Expected SQLSTATE ${expected.join("/")} for restricted operation; got ${code ?? "success"}`);
}

async function checkRole(admin, runtime, target) {
  const role = (await runtime.query("SELECT current_user AS username")).rows[0].username;
  assert(role === target.runtimeRole, "Connected account is not the provisioned runtime role");
  const catalog = (await admin.query(
    `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit
       FROM pg_roles WHERE rolname = $1`, [role])).rows[0];
  assert(catalog && Object.values(catalog).every((value) => value === false),
    "Runtime role has privileged role flags");
  const owner = (await admin.query(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
      WHERE c.relnamespace='public'::regnamespace AND r.rolname=$1`, [role])).rows[0].n;
  assert(owner === 0, "Runtime role owns public schema objects");
  const containers = (await admin.query(
    `SELECT EXISTS(
         SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba
         WHERE d.datname=current_database() AND r.rolname=$1
       ) OR EXISTS(
         SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
         WHERE n.nspname='public' AND r.rolname=$1
       ) AS owns_container`, [role])).rows[0].owns_container;
  assert(containers === false, "Runtime role owns a database or public schema");
  const statements = {
    tasks: { SELECT: true, INSERT: true, UPDATE: true, DELETE: false,
      TRUNCATE: false, TRIGGER: false },
    valet_sessions: { SELECT: true, INSERT: true, UPDATE: true, DELETE: false,
      TRUNCATE: false, TRIGGER: false },
    incidents: { SELECT: true, INSERT: true, UPDATE: false, DELETE: false,
      TRUNCATE: false, TRIGGER: false },
    key_custody_events: { SELECT: true, INSERT: true, UPDATE: false,
      DELETE: false, TRUNCATE: false, TRIGGER: false },
    dispatch_events: { SELECT: true, INSERT: true, UPDATE: false,
      DELETE: false, TRUNCATE: false, TRIGGER: false },
    audit_events: { SELECT: true, INSERT: false, UPDATE: false,
      DELETE: false, TRUNCATE: false, TRIGGER: false },
  };
  for (const [table, permissions] of Object.entries(statements)) {
    for (const [operation, expected] of Object.entries(permissions)) {
      const result = await admin.query(
        "SELECT has_table_privilege($1, $2, $3) AS permitted",
        [role, `public.${table}`, operation]);
      assert(result.rows[0].permitted === expected,
        `Incorrect real runtime ${table} ${operation} grant`);
    }
  }
  const functions = ["management_pagination_preserve_birth_xid",
    "issue300_prevent_relation_rewrite", "issue300_prevent_attribution_rewrite"];
  for (const name of functions) {
    const result = (await admin.query(
      `SELECT p.prosecdef, p.proconfig,
              has_function_privilege($1,p.oid,'EXECUTE') AS runtime_exec,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(
                  p.proacl, acldefault('f',p.proowner))) acl
                WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
              ) AS public_denied,
              owner.rolname AS owner
         FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
        WHERE p.oid=to_regprocedure($2)`, [role, `public.${name}()`])).rows[0];
    assert(result && result.runtime_exec === false && result.public_denied === true &&
      result.prosecdef === false && result.owner !== role &&
      (result.proconfig ?? []).includes("search_path=pg_catalog, public"),
    `Unsafe trigger function grants or search_path: ${name}`);
  }
  for (const table of evidenceTables) {
    await runtime.query("BEGIN");
    try {
      await denial(runtime, `DELETE FROM public.${table} WHERE false`);
      await denial(runtime, `TRUNCATE public.${table}`);
      await denial(runtime, `ALTER TABLE public.${table} DISABLE TRIGGER ALL`);
    } finally { await runtime.query("ROLLBACK"); }
  }
  await runtime.query("BEGIN");
  try {
    await denial(runtime, "SET LOCAL session_replication_role = replica");
    await denial(runtime, "SELECT id FROM public.audit_events FOR SHARE");
  } finally { await runtime.query("ROLLBACK"); }
  return { actualLogin: role, noObjectOwnership: true, noContainerOwnership: true,
    deniedOperations: true,
    triggerFunctionNoExecute: true };
}

async function insertFixture(admin) {
  const id = Object.fromEntries(
    ["organization", "location", "user", "member", "vehicle", "session", "task",
      "incident", "audit"].map((name) => [name, randomUUID()]));
  await admin.query(
    `INSERT INTO organizations(id,name,timezone,updated_at)
     VALUES ($1,'W6 disposal proof','Asia/Amman',now())`, [id.organization]);
  await admin.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
     VALUES ($1,$2,'W6','W6','Proof only','Asia/Amman','JOD','ACTIVE',now())`,
    [id.location, id.organization]);
  await admin.query(
    "INSERT INTO users(id,email,password_hash,updated_at) VALUES ($1,$2,'w6-fixture',now())",
    [id.user, `${id.user}@w6.invalid`]);
  await admin.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,updated_at)
     VALUES ($1,$2,$3,'VALET_EMPLOYEE',now())`,
    [id.member, id.organization, id.user]);
  await admin.query(
    "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES ($1,$2,'W6 fixture',now())",
    [id.vehicle, id.organization]);
  await admin.query(
    `INSERT INTO valet_sessions(id,customer_access_token_hash,customer_access_expires_at,
      organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,updated_at)
     VALUES ($1,$2,now()+interval '1 day',$3,$4,$5,'CHECKING_IN',$6,now())`,
    [id.session, `w6:${id.session}`, id.organization, id.location, id.vehicle, id.member]);
  await admin.query(
    `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,task_type,status,updated_at)
     VALUES ($1,$2,$3,$4,'PARKING','QUEUED',now())`,
    [id.task, id.organization, id.location, id.session]);
  await admin.query(
    `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
      status,severity,type,description,reported_by_membership_id)
     VALUES ($1,$2,$3,$4,'OPEN','LOW','W6_PROOF','local fixture',$5)`,
    [id.incident, id.organization, id.location, id.session, id.member]);
  await admin.query(
    `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,
      actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
     VALUES ($1,$2,$3,$4,'SYSTEM','W6_PROOF','ValetSession',$4,'{}'::jsonb,now())`,
    [id.audit, id.organization, id.location, id.session]);
  return id;
}

async function fixtureProof(admin, role) {
  // All fixture mutations are in the migration session's one ROLLBACK transaction.
  // SET LOCAL ROLE exercises the exact grant set independently of role-login checks.
  await admin.query("BEGIN");
  try {
    const id = await insertFixture(admin);
    assert(/^[a-z_][a-z0-9_]{0,62}$/.test(role), "Unsafe runtime role identifier");
    await admin.query(`SET LOCAL ROLE "${role}"`);
    assert((await admin.query("SELECT current_user AS name")).rows[0].name === role,
      "SET LOCAL ROLE failed to model the provisioned runtime identity");
    const immutable = [
      ["tasks", "organization_id = $2", [id.task, randomUUID()]],
      ["tasks", "task_type = 'RETRIEVAL'", [id.task]],
      ["incidents", "created_at = created_at + interval '1 second'", [id.incident]],
      ["valet_sessions", "vehicle_id = $2", [id.session, randomUUID()]],
      ["valet_sessions", "checked_in_by_membership_id = NULL", [id.session]],
      ["audit_events", "metadata_json = '{\"forged\":true}'::jsonb", [id.audit]],
      ["audit_events", "controlled_operator_ref = 'forged'", [id.audit]],
    ];
    for (const [table, change, values] of immutable) {
      const key = table === "valet_sessions" ? id.session :
        table === "incidents" ? id.incident : table === "audit_events" ? id.audit : id.task;
      await denial(admin, `UPDATE public.${table} SET ${change} WHERE id=$1`,
        [key, ...values.slice(1)], table === "audit_events" || table === "incidents" ?
          ["42501"] : ["23514"]);
    }
    await admin.query("UPDATE tasks SET version=version+1 WHERE id=$1", [id.task]);
    await admin.query("UPDATE valet_sessions SET version=version+1 WHERE id=$1", [id.session]);
    const before = (await admin.query(
      "SELECT pagination_birth_xid::text AS born FROM tasks WHERE id=$1", [id.task]
    )).rows[0].born;
    await admin.query(
      "UPDATE tasks SET pagination_birth_xid='1'::xid8 WHERE id=$1", [id.task]);
    assert((await admin.query(
      "SELECT pagination_birth_xid::text AS born FROM tasks WHERE id=$1", [id.task]
    )).rows[0].born === before, "Runtime update rewrote an immutable Task XID");
    const born = await admin.query(
      `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,task_type,status,
        pagination_birth_xid,updated_at)
       VALUES ($1,$2,$3,$4,'RETRIEVAL','QUEUED','1'::xid8,now())
       RETURNING pagination_birth_xid::text AS actual`,
      [randomUUID(), id.organization, id.location, id.session]);
    const xid = (await admin.query("SELECT pg_current_xact_id()::text AS xid")).rows[0].xid;
    assert(born.rows[0].actual === xid, "Runtime-supplied Task marker was not replaced");
    const incident = await admin.query(
      `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
         status,severity,type,description,reported_by_membership_id,pagination_birth_xid)
       VALUES ($1,$2,$3,$4,'OPEN','LOW','W6_NULL','fixture',$5,NULL)
       RETURNING pagination_birth_xid::text AS born`,
      [randomUUID(), id.organization, id.location, id.session, id.member]);
    assert(incident.rows[0].born === xid,
      "Runtime explicit-NULL Incident birth marker escaped INSERT trigger");
    const permittedAudit = await admin.query(
      `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,
        actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
       VALUES ($1,$2,$3,$4,'SYSTEM','W6_RUNTIME_PROOF','ValetSession',$4,'{}',now())
       RETURNING pagination_birth_xid::text AS born`,
      [randomUUID(), id.organization, id.location, id.session]);
    assert(permittedAudit.rows[0].born === xid,
      "Allowed Audit INSERT did not receive the database-owned marker");
    await denial(admin, `INSERT INTO audit_events(id,organization_id,event_type,entity_type,
      entity_id,metadata_json,occurred_at,pagination_birth_xid)
      VALUES ($1,$2,'W6_SPOOF','Organization',$2,'{}',now(),'1'::xid8)`,
    [randomUUID(), id.organization]);
    return { taskAndSessionOperationalUpdates: true, spoofedTaskBirthOverwritten: true,
      immutableUpdateBirthPreserved: true, nullIncidentBirthOverwritten: true,
      permittedAuditAppend: true,
      immutableRelationshipDenials: immutable.length, fixtureRolledBack: true };
  } finally { await admin.query("ROLLBACK").catch(() => {}); }
}

async function execute() {
  const target = getAttestedTarget();
  const reports = [];
  const admin = pgClient(target.migrationUrl);
  await admin.connect();
  try {
    const status = await admin.query(
      "SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL");
    assert(status.rows[0].n === 96, "All 96 migrations must finish before provisioning");
    const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [target.runtimeRole]);
    assert(role.rowCount === 0, "Reserved role exists before provision; refuse credential rotation");
  } finally { await admin.end(); }
  await provision(target);
  const owner = pgClient(target.migrationUrl);
  const runtime = pgClient(target.runtimeUrl);
  await owner.connect();
  await runtime.connect();
  try {
    const realRole = await checkRole(owner, runtime, target);
    const fixture = await fixtureProof(owner, target.runtimeRole);
    reports.push({ database: target.database, ...realRole, ...fixture });
  } finally { await Promise.all([owner.end(), runtime.end()]); }
  console.log(JSON.stringify({ verdict: "PARTIAL", candidateSha: target.candidateSha, reports,
    gaps: ["Actual HTTP authorization", "legacy real maintenance role",
      "migration interruption and concurrent runner cutover"] }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateSource();
  if (process.argv[2] === "--execute") {
    execute().catch((error) => {
      console.error(`W6 BLOCKED: ${error.message}`);
      process.exitCode = 1;
    });
  } else {
    assert(!process.argv[2] || process.argv[2] === "--check", "Unsupported W6 mode");
    console.log("W6 ROLE STATIC PASS; actual login/grants and immutable-identity proof GAP pending lease");
  }
}
