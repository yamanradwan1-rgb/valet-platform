import pg from "pg";

const expected = {
  api: ["wa310_api", "DATABASE_URL"],
  sender: ["wa310_sender", "OUTBOUND_MESSAGING_WORKER_DATABASE_URL"],
  webhook: ["wa310_webhook", "OUTBOUND_MESSAGING_WEBHOOK_DATABASE_URL"],
  migration: ["wa310_migrate", "MIGRATION_DATABASE_URL"],
};
if (process.env.NODE_ENV !== "test" ||
    process.env.OUTBOUND_MESSAGING_SEND_ENABLED !== "false" ||
    process.env.GUEST_ACCESS_AUTO_ISSUE_ENABLED !== "false") {
  throw new Error("Issue310 DB attestation requires all sending controls OFF.");
}
async function inspectRole(role, name) {
  const url = process.env[name];
  const parsed = url ? new URL(url) : null;
  if (parsed?.hostname !== "127.0.0.1" || parsed.port !== "56310" ||
      parsed.pathname !== "/vaylet_wa310" ||
      decodeURIComponent(parsed.username) !== role) {
    throw new Error(`Issue310 ${role} connection did not match the isolated DB.`);
  }
  const connection = new pg.Client({ connectionString: url });
  await connection.connect();
  try {
    const result = await connection.query(`
      SELECT current_database() AS database, current_user AS principal,
        r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls,
        has_database_privilege(current_user,current_database(),'CREATE') AS can_create_db,
        has_schema_privilege(current_user,'public','CREATE') AS can_create_schema
      FROM pg_roles r WHERE r.rolname=current_user`);
    const row = result.rows[0];
    if (!row || row.database !== "vaylet_wa310" || row.principal !== role) {
      throw new Error(`Issue310 ${role} principal mismatch.`);
    }
    if (role !== "wa310_migrate" && (row.rolsuper || row.rolcreatedb ||
        row.rolcreaterole || row.rolbypassrls || row.can_create_db || row.can_create_schema)) {
      throw new Error(`Issue310 ${role} holds elevated runtime rights.`);
    }
    return connection;
  } catch (error) {
    await connection.end();
    throw error;
  }
}
const clients = new Map();
try {
  for (const [label, [role, env]] of Object.entries(expected)) {
    clients.set(label, await inspectRole(role, env));
  }
  const sender = clients.get("sender");
  const senderFunction = await sender.query(`SELECT
    has_function_privilege(current_user,'public.outbound_confirm_dispatch(uuid,uuid,uuid,text,text)','EXECUTE') AS allowed,
    has_table_privilege(current_user,'public.outbound_message_intents','SELECT') AS broad`);
  if (!senderFunction.rows[0]?.allowed || senderFunction.rows[0]?.broad) {
    throw new Error("Sender SQL permissions did not preserve narrow function authority.");
  }
  const migrations = await clients.get("migration").query(`SELECT
    count(*)::int AS total,
    count(*) FILTER(WHERE finished_at IS NOT NULL)::int AS finished,
    count(*) FILTER(WHERE rolled_back_at IS NOT NULL OR (finished_at IS NULL AND rolled_back_at IS NULL))::int AS incomplete
    FROM _prisma_migrations`);
  const row = migrations.rows[0];
  if (!row || row.total !== 102 || row.finished !== 102 || row.incomplete !== 0) {
    throw new Error("Issue310 migration inventory is not fully applied.");
  }
  const control = await clients.get("migration").query(`SELECT environment,issue_enabled,send_enabled
    FROM outbound_messaging_control ORDER BY environment`);
  if (control.rows.length !== 2 || control.rows.some((item) =>
    item.issue_enabled || item.send_enabled)) {
    throw new Error("Issue310 durable outbound issue/send controls must remain OFF.");
  }
  const ownership = await clients.get("migration").query(`
    SELECT (SELECT count(*)::int FROM organizations) AS organizations,
      (SELECT count(*)::int FROM locations) AS locations,
      (SELECT count(*)::int FROM outbound_provider_bindings) AS bindings,
      (SELECT count(*)::int FROM outbound_messaging_permissions) AS permissions`);
  const scope = ownership.rows[0];
  if (scope.organizations !== 1 || scope.locations !== 1 ||
      scope.bindings !== 0 || scope.permissions !== 0) {
    throw new Error("Unexpected Issue310 tenant scope or external authorization state.");
  }
  console.log("PASS: isolated DB/4 distinct principals, sender function-only permission, 102/102 migrations.");
  console.log("PASS: 1 Organization, 1 Location; binding and consent absent; test/production controls OFF/OFF.");
} finally {
  for (const connection of clients.values()) await connection.end();
}
