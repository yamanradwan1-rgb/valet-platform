// Pinned from forward-only migration 20261115020100, including its exact
// PL/pgSQL body. LF and CRLF are the only permitted source line endings.
const approvedBodySha256 = new Set([
  "7f4daa120f802ae0be236acafc8cc869735ac88f5742871dd92056c6fe253bba",
  "4f998a3ceacb2ba3b1c7569ad60527e53e283a8d95b85f45410a151eeda6aaf2",
]);

export async function assertOptionCRevocationIsMonotonic(client, runtimeRole) {
  const result = await client.query(
    `SELECT trigger.tgenabled,trigger.tgtype,trigger.tgisinternal,
            trigger.tgnargs,trigger.tgqual IS NULL AS unconditional,
            trigger.tgconstraint=0 AS not_constraint,
            function.prosecdef,function.proconfig,
            function.prorettype='pg_catalog.trigger'::regtype AS trigger_return,
            language.lanname AS language,owner.rolname AS owner,
            pg_catalog.encode(pg_catalog.sha256(
              pg_catalog.convert_to(function.prosrc,'UTF8')),'hex') AS body_sha256
       FROM pg_catalog.pg_trigger AS trigger
       JOIN pg_catalog.pg_proc AS function ON function.oid=trigger.tgfoid
       JOIN pg_catalog.pg_language AS language ON language.oid=function.prolang
       JOIN pg_catalog.pg_roles AS owner ON owner.oid=function.proowner
       WHERE trigger.tgrelid='public.staff_auth_sessions'::regclass
         AND trigger.tgname='staff_auth_session_revocation_monotonic_trigger'
         AND function.oid=pg_catalog.to_regprocedure(
           'public.staff_auth_session_revocation_monotonic()')`,
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    row?.tgenabled !== "O" ||
    row.tgtype !== 19 ||
    row.tgisinternal !== false ||
    row.tgnargs !== 0 ||
    row.unconditional !== true ||
    row.not_constraint !== true ||
    row.prosecdef !== false ||
    row.trigger_return !== true ||
    row.language !== "plpgsql" ||
    row.owner === runtimeRole ||
    !Array.isArray(row.proconfig) ||
    row.proconfig.length !== 1 ||
    row.proconfig[0] !== "search_path=pg_catalog, public" ||
    !approvedBodySha256.has(row.body_sha256)
  ) {
    throw new Error(
      "Option C staff session revocation trigger is missing, disabled or changed.",
    );
  }
  // Ordinary triggers are bypassed by session_replication_role=replica.
  // PostgreSQL parameter SET privileges must remain denied to runtime.
  const bypass = await client.query(
    "SELECT pg_catalog.has_parameter_privilege($1,'session_replication_role','SET') AS allowed",
    [runtimeRole],
  );
  if (bypass.rowCount !== 1 || bypass.rows[0]?.allowed !== false) {
    throw new Error(
      "Option C runtime may bypass the immutable revocation trigger.",
    );
  }
}
