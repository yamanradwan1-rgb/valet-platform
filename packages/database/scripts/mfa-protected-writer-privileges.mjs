import {
  mfaFactorInsertColumns,
  mfaFactorUpdateColumns,
  mfaRecoveryInsertColumns,
  provisionMfaPrivileges,
} from "./mfa-runtime-privileges.mjs";
import {
  mfaProtectedWriterFunctions,
  mfaProtectedWriterSessionUpdateColumns,
  mfaProtectedWriterSelectColumns,
  mfaProtectedWriterTables,
  mfaProtectedWriterUserLockColumn,
} from "./mfa-protected-writer-contract.mjs";
import { grantS04ProtectedWriterFunction } from "./s04-protected-writer-privileges.mjs";
import { verifyMfaProtectedWriterPrivileges } from "./mfa-protected-writer-verification.mjs";
import {
  grantMfaColumns,
  revokeAllTableColumnPrivileges,
  revokeUnexpectedMfaExecutors,
} from "./mfa-protected-writer-acl-provisioning.mjs";
import {
  mfaProtectedWriterRolePattern,
  prepareMfaProtectedWriterRole,
} from "./mfa-protected-writer-role-provisioning.mjs";

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
    writer.search !== "" ||
    writer.hash !== "" ||
    !mfaProtectedWriterRolePattern.test(writer.username) ||
    !writer.password ||
    writer.username === runtime.username ||
    writer.password === runtime.password ||
    writer.host !== runtime.host ||
    writer.pathname !== runtime.pathname ||
    (environment.NODE_ENV === "production" &&
      writer.username !== "vaylet_mfa_writer")
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
  client,
  formatted,
  runtimeRole,
  root,
) {
  const exists = await client.query(
    "SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='mfa_activity_private'",
  );
  if (exists.rowCount !== 1) {
    throw new Error("Protected MFA activity SQL migration missing.");
  }
  await client.query(
    `INSERT INTO mfa_activity_private.key_root(singleton,secret)
      VALUES (true,$1) ON CONFLICT (singleton) DO NOTHING`,
    [root],
  );
  const actual = await client.query(
    "SELECT secret=$1 AS matches FROM mfa_activity_private.key_root WHERE singleton",
    [root],
  );
  if (actual.rowCount !== 1 || actual.rows[0]?.matches !== true) {
    throw new Error("MFA activity proof root mismatches protected database.");
  }
  await formatted(client, "GRANT USAGE ON SCHEMA mfa_activity_private TO %I", [
    runtimeRole,
  ]);
  await formatted(
    client,
    "GRANT EXECUTE ON FUNCTION mfa_activity_private.touch_admin_activity(uuid,uuid,text,uuid,integer,text,bigint,bytea) TO %I",
    [runtimeRole],
  );
}

export async function provisionMfaProtectedWriter(
  client,
  formatted,
  writer,
  runtimeRole,
  migrationRole,
) {
  await prepareMfaProtectedWriterRole(
    client,
    formatted,
    writer,
    runtimeRole,
    migrationRole,
  );
  for (const table of mfaProtectedWriterTables) {
    await formatted(
      client,
      "REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC",
      [table],
    );
    await revokeAllTableColumnPrivileges(
      client,
      formatted,
      "PUBLIC",
      "public",
      table,
    );
  }
  for (const [table, columns] of Object.entries(
    mfaProtectedWriterSelectColumns,
  )) {
    await grantMfaColumns(
      client,
      formatted,
      writer.role,
      "SELECT",
      table,
      columns,
    );
  }
  await grantMfaColumns(
    client,
    formatted,
    writer.role,
    "UPDATE",
    "staff_auth_sessions",
    mfaProtectedWriterSessionUpdateColumns,
  );
  // PostgreSQL requires UPDATE on at least one User column for
  // SELECT ... FOR UPDATE OF staff_user. This inert lock-version column is the
  // only User mutation authority held by the protected MFA writer.
  await formatted(
    client,
    `GRANT UPDATE (${mfaProtectedWriterUserLockColumn}) ON TABLE public.users TO %I`,
    [writer.role],
  );
  await grantMfaColumns(
    client,
    formatted,
    writer.role,
    "INSERT",
    "user_mfa_totp_factors",
    mfaFactorInsertColumns,
  );
  await grantMfaColumns(
    client,
    formatted,
    writer.role,
    "UPDATE",
    "user_mfa_totp_factors",
    mfaFactorUpdateColumns,
  );
  await grantMfaColumns(
    client,
    formatted,
    writer.role,
    "INSERT",
    "mfa_recovery_codes",
    mfaRecoveryInsertColumns,
  );
  await formatted(
    client,
    "GRANT UPDATE (consumed_at) ON TABLE public.mfa_recovery_codes TO %I",
    [writer.role],
  );
  await grantS04ProtectedWriterFunction(
    client,
    formatted,
    "mfa",
    writer.role,
    runtimeRole,
  );
  await formatted(
    client,
    `REVOKE ALL ON FUNCTION ${mfaProtectedWriterFunctions.accountSecurityAudit} FROM PUBLIC`,
  );
  await formatted(
    client,
    `GRANT EXECUTE ON FUNCTION ${mfaProtectedWriterFunctions.accountSecurityAudit} TO %I`,
    [writer.role],
  );
  await revokeUnexpectedMfaExecutors(
    client,
    formatted,
    mfaProtectedWriterFunctions.quotaSuccess,
    [writer.role],
  );
  await revokeUnexpectedMfaExecutors(
    client,
    formatted,
    mfaProtectedWriterFunctions.accountSecurityAudit,
    [writer.role, runtimeRole],
  );
}

export async function provisionOptionCMfaBoundary(
  client,
  formatted,
  runtimeRole,
  migrationRole,
) {
  const writer = mfaProtectedWriterConfig();
  await provisionMfaPrivileges(
    client,
    formatted,
    runtimeRole,
    writer !== null,
    Boolean(process.env.STAFF_AUTH_WRITER_DATABASE_URL),
  );
  if (writer) {
    await provisionMfaProtectedWriter(
      client,
      formatted,
      writer,
      runtimeRole,
      migrationRole,
    );
    await provisionMfaActivityRoot(
      client,
      formatted,
      runtimeRole,
      canonicalMfaActivityRoot(),
    );
    await verifyMfaProtectedWriterPrivileges(
      client,
      runtimeRole,
      migrationRole,
      writer.role,
    );
  }
}
