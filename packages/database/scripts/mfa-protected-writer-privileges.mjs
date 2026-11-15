import {
  mfaFactorInsertColumns,
  mfaFactorUpdateColumns,
  mfaRecoveryInsertColumns,
  provisionMfaPrivileges,
} from "./mfa-runtime-privileges.mjs";

const rolePattern = /^[a-z_][a-z0-9_]{0,62}$/;

export function mfaProtectedWriterConfig(environment = process.env) {
  const enabled = environment.MFA_PROTECTED_WRITER_ENABLED;
  if (enabled !== undefined && enabled !== "true" && enabled !== "false") {
    throw new Error("MFA_PROTECTED_WRITER_ENABLED must be true or false.");
  }
  if (environment.NODE_ENV === "production" && enabled !== "true") {
    throw new Error("Production MFA writer cannot fall back to runtime SQL.");
  }
  if (
    environment.NODE_ENV === "production" &&
    !environment.STAFF_AUTH_WRITER_DATABASE_URL
  ) {
    throw new Error("Production MFA requires protected Staff Auth origin.");
  }
  if (enabled !== "true") return null;
  if (!environment.MFA_WRITER_DATABASE_URL || !environment.DATABASE_URL) {
    throw new Error("Protected MFA requires a dedicated writer database URL.");
  }
  let writer;
  let runtime;
  try {
    writer = new URL(environment.MFA_WRITER_DATABASE_URL);
    runtime = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error("Protected MFA database URL is invalid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(writer.protocol) ||
    writer.search !== "" || writer.hash !== "" ||
    !rolePattern.test(writer.username) || !writer.password ||
    writer.username === runtime.username ||
    writer.password === runtime.password ||
    writer.host !== runtime.host || writer.pathname !== runtime.pathname
    || (environment.NODE_ENV === "production"
      && writer.username !== "vaylet_mfa_writer")
  ) {
    throw new Error("Protected MFA writer must be an isolated same-DB role.");
  }
  return {
    role: decodeURIComponent(writer.username),
    password: decodeURIComponent(writer.password),
  };
}

export function canonicalMfaActivityRoot(environment = process.env) {
  const raw = environment.MFA_ACTIVITY_PROOF_SECRET_B64URL;
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) {
    throw new Error("MFA activity proof root must be 32 canonical bytes.");
  }
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== raw) {
    throw new Error("MFA activity proof root is invalid.");
  }
  return key;
}

export async function provisionMfaActivityRoot(
  client, formatted, runtimeRole, root,
) {
  const exists = await client.query(
    "SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='mfa_activity_private'",
  );
  if (exists.rowCount !== 1) {
    throw new Error("Protected MFA activity SQL migration missing.");
  }
  await client.query(
    `INSERT INTO mfa_activity_private.key_root(singleton,secret)
      VALUES (true,$1) ON CONFLICT (singleton) DO NOTHING`, [root],
  );
  const actual = await client.query(
    "SELECT secret=$1 AS matches FROM mfa_activity_private.key_root WHERE singleton",
    [root],
  );
  if (actual.rowCount !== 1 || actual.rows[0]?.matches !== true) {
    throw new Error("MFA activity proof root mismatches protected database.");
  }
  await formatted(client,
    "GRANT USAGE ON SCHEMA mfa_activity_private TO %I",
    [runtimeRole]);
  await formatted(client,
    "GRANT EXECUTE ON FUNCTION mfa_activity_private.touch_admin_activity(uuid,uuid,text,uuid,integer,text,bigint,bytea) TO %I",
    [runtimeRole]);
}

async function grantColumns(client, formatted, role, privilege, table, columns) {
  for (const column of columns) {
    await formatted(client, `GRANT ${privilege} (%I) ON TABLE %I TO %I`, [
      column, table, role,
    ]);
  }
}

export async function provisionMfaProtectedWriter(
  client, formatted, writer, runtimeRole, migrationRole,
) {
  if (
    writer.role === runtimeRole || writer.role === migrationRole ||
    !rolePattern.test(writer.role) || !writer.password
  ) throw new Error("MFA protected writer identity is unsafe.");
  const role = await client.query(
    `SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
            rolreplication,rolbypassrls
     FROM pg_catalog.pg_roles WHERE rolname=$1`,
    [writer.role],
  );
  if (role.rowCount === 0) {
    await formatted(client,
      "CREATE ROLE %I WITH LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      [writer.role, writer.password]);
  } else {
    const flags = role.rows[0];
    if (
      !flags || flags.rolsuper || flags.rolcreatedb || flags.rolcreaterole ||
      flags.rolreplication || flags.rolbypassrls
    ) throw new Error("Existing MFA writer role has unsafe attributes.");
    await formatted(client, "ALTER ROLE %I WITH LOGIN PASSWORD %L NOINHERIT", [
      writer.role, writer.password,
    ]);
  }
  const inherited = await client.query(
    `SELECT parent.rolname FROM pg_catalog.pg_auth_members membership
     JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
     JOIN pg_catalog.pg_roles child ON child.oid=membership.member
     WHERE child.rolname=$1`,
    [writer.role],
  );
  for (const { rolname } of inherited.rows) {
    await formatted(client, "REVOKE %I FROM %I", [rolname, writer.role]);
  }
  // Revoke BOTH directions: runtime could otherwise SET ROLE to a privileged
  // MFA writer through an old outbound grant even when the writer NOINHERIT.
  const delegated = await client.query(
    `SELECT member.rolname FROM pg_catalog.pg_auth_members membership
     JOIN pg_catalog.pg_roles writer ON writer.oid=membership.roleid
     JOIN pg_catalog.pg_roles member ON member.oid=membership.member
     WHERE writer.rolname=$1`,
    [writer.role],
  );
  for (const { rolname } of delegated.rows) {
    await formatted(client, "REVOKE %I FROM %I", [writer.role, rolname]);
  }
  const database = (await client.query("SELECT current_database() AS db")).rows[0].db;
  await formatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [
    database, writer.role,
  ]);
  await formatted(client, "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I", [
    database, writer.role,
  ]);
  await formatted(client, "REVOKE ALL ON SCHEMA public FROM %I", [writer.role]);
  await formatted(client, "GRANT USAGE ON SCHEMA public TO %I", [writer.role]);
  await formatted(client,
    "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I",
    [writer.role]);
  for (const table of [
    "users", "organizations", "organization_memberships",
    "staff_auth_sessions", "user_mfa_totp_factors", "mfa_recovery_codes",
    "anti_abuse_events",
  ]) {
    await formatted(client, "GRANT SELECT ON TABLE %I TO %I", [
      table, writer.role,
    ]);
  }
  await grantColumns(client, formatted, writer.role, "UPDATE",
    "staff_auth_sessions",
    ["mfa_authenticated_at", "mfa_factor_id", "last_admin_activity_at"]);
  // The existing session verifier locks User FOR UPDATE to fence disable
  // concurrently with verified MFA. A narrowly scoped telemetry column gives
  // the protected writer row-lock authority without password/status writes.
  await formatted(client, "GRANT UPDATE (last_login_at) ON TABLE users TO %I", [
    writer.role,
  ]);
  await grantColumns(client, formatted, writer.role, "INSERT",
    "user_mfa_totp_factors", mfaFactorInsertColumns);
  await grantColumns(client, formatted, writer.role, "UPDATE",
    "user_mfa_totp_factors", mfaFactorUpdateColumns);
  await grantColumns(client, formatted, writer.role, "INSERT",
    "mfa_recovery_codes", mfaRecoveryInsertColumns);
  await formatted(client,
    "GRANT UPDATE (consumed_at) ON TABLE mfa_recovery_codes TO %I",
    [writer.role]);
  await formatted(client,
    "GRANT EXECUTE ON FUNCTION public.s04_mfa_success(uuid,text,text) TO %I",
    [writer.role]);
  await formatted(client,
    "GRANT EXECUTE ON FUNCTION append_runtime_account_security_audit_event(uuid,text,uuid,account_security_actor_type,uuid,timestamptz) TO %I",
    [writer.role]);
}

export async function provisionOptionCMfaBoundary(
  client, formatted, runtimeRole, migrationRole,
) {
  const writer = mfaProtectedWriterConfig();
  await provisionMfaPrivileges(
    client, formatted, runtimeRole, writer !== null,
    Boolean(process.env.STAFF_AUTH_WRITER_DATABASE_URL),
  );
  if (writer) {
    await provisionMfaProtectedWriter(
      client, formatted, writer, runtimeRole, migrationRole,
    );
    await provisionMfaActivityRoot(
      client, formatted, runtimeRole, canonicalMfaActivityRoot(),
    );
  }
}
