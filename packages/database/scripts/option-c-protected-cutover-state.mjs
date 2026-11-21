import {
  assertDatabaseCredentialSeparation,
  decodedDatabaseIdentity,
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
} from "./database-connection-policy.mjs";

export const optionCRoles = Object.freeze({
  proofOwner: "vap1_proof_owner",
  staffAuthWriter: "vaylet_staff_auth_writer",
  mfaWriter: "vaylet_mfa_writer",
  managementWriter: "vaylet_management_writer",
});

const writerEnvironment = [
  ["STAFF_AUTH_WRITER_DATABASE_URL", optionCRoles.staffAuthWriter],
  ["MFA_WRITER_DATABASE_URL", optionCRoles.mfaWriter],
  ["MANAGEMENT_WRITER_DATABASE_URL", optionCRoles.managementWriter],
];

function sameTarget(left, right) {
  return (
    left.host === right.host &&
    left.port === right.port &&
    left.database === right.database
  );
}

export function readOptionCCutoverConfiguration(env = process.env) {
  if (env.OPTION_C_PROTECTED_CUTOVER !== "1") {
    throw new Error(
      "Option C protected cutover requires explicit operator opt-in.",
    );
  }
  if (env.OPTION_C_LEGACY_WORKERS_DRAINED !== "1") {
    throw new Error(
      "Option C protected cutover requires an independently verified legacy worker drain.",
    );
  }
  const migration = parseMigrationDatabaseUrl(
    env.MIGRATION_DATABASE_URL,
    env.NODE_ENV,
  );
  const runtime = parseRuntimeDatabaseUrlForProvisioning(env.DATABASE_URL);
  assertDatabaseCredentialSeparation(migration, runtime, env.NODE_ENV);
  const migrationIdentity = decodedDatabaseIdentity(migration);
  const runtimeIdentity = decodedDatabaseIdentity(runtime);
  const writers = {};
  for (const [name, expectedRole] of writerEnvironment) {
    const parsed = parseRuntimeDatabaseUrlForProvisioning(env[name], name);
    const identity = decodedDatabaseIdentity(parsed);
    if (
      identity.role !== expectedRole ||
      !sameTarget(identity, runtimeIdentity)
    ) {
      throw new Error(
        `${name} must use the fixed protected role on the runtime database.`,
      );
    }
    writers[expectedRole] = identity;
  }
  if (!sameTarget(migrationIdentity, runtimeIdentity)) {
    throw new Error("Option C cutover database targets do not match.");
  }
  const identities = [
    migrationIdentity,
    runtimeIdentity,
    ...Object.values(writers),
  ];
  if (
    new Set(identities.map(({ role }) => role)).size !== identities.length ||
    new Set(identities.map(({ password }) => password)).size !==
      identities.length
  ) {
    throw new Error(
      "Option C cutover credentials must use distinct roles and passwords.",
    );
  }
  return { migration, migrationIdentity, runtimeIdentity, writers };
}

function exactProofOwnerMembership(rows, migrationRole, databaseOwner) {
  if (!Array.isArray(rows) || rows.length !== 2) {
    return false;
  }
  const setOnly = rows.filter(
    (row) =>
      row?.granted_role === optionCRoles.proofOwner &&
      row.member_role === migrationRole &&
      row.grantor_role === migrationRole &&
      row.inherit_option === false &&
      row.set_option === true &&
      row.admin_option === false,
  );
  const creatorAdmin = rows.filter(
    (row) =>
      row?.granted_role === optionCRoles.proofOwner &&
      row.member_role === migrationRole &&
      row.inherit_option === false &&
      row.set_option === false &&
      row.admin_option === true &&
      (row.grantor_role === databaseOwner || row.grantor_superuser === true),
  );
  return (
    setOnly.length === 1 &&
    creatorAdmin.length === 1 &&
    setOnly[0] !== creatorAdmin[0]
  );
}

export async function assertProofOwnerAccess(client, migrationRole) {
  const owner = await client.query(
    `SELECT database_owner.rolname AS database_owner
       FROM pg_catalog.pg_database database
       JOIN pg_catalog.pg_roles database_owner ON database_owner.oid=database.datdba
       WHERE database.datname=pg_catalog.current_database()`,
  );
  const role = await client.query(
    `SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
            rolreplication,rolbypassrls
       FROM pg_catalog.pg_roles WHERE rolname=$1`,
    [optionCRoles.proofOwner],
  );
  const current = role.rows[0];
  if (
    role.rowCount !== 1 ||
    !current ||
    current.rolcanlogin ||
    current.rolinherit ||
    current.rolsuper ||
    current.rolcreatedb ||
    current.rolcreaterole ||
    current.rolreplication ||
    current.rolbypassrls
  ) {
    throw new Error("Option C proof owner role attributes are unsafe.");
  }
  const memberships = await client.query(
    `SELECT granted.rolname AS granted_role,member.rolname AS member_role,
            grantor.rolname AS grantor_role,grantor.rolsuper AS grantor_superuser,
            membership.inherit_option,
            membership.set_option,membership.admin_option
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles granted ON granted.oid=membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid=membership.member
       JOIN pg_catalog.pg_roles grantor ON grantor.oid=membership.grantor
       WHERE granted.rolname=$1 OR member.rolname=$1`,
    [optionCRoles.proofOwner],
  );
  if (
    !exactProofOwnerMembership(
      memberships.rows,
      migrationRole,
      owner.rows[0]?.database_owner,
    )
  ) {
    throw new Error("Option C proof owner SET-only membership is unsafe.");
  }
}

async function resetRolePreservingPrimary(client, primaryError) {
  try {
    await client.query("RESET ROLE");
  } catch (resetError) {
    if (!primaryError) throw resetError;
  }
  if (primaryError) throw primaryError;
}

export async function lockOptionCBoundary(client, migrationRole) {
  await client.query(`SET LOCAL ROLE ${optionCRoles.proofOwner}`);
  let result;
  let primaryError;
  try {
    result = await client.query(
      `SELECT phase,pg_catalog.pg_backend_pid() AS backend_pid,
              pg_catalog.pg_current_xact_id()::text AS full_xid
         FROM auth_proof_private.option_c_launch_boundary
         WHERE singleton FOR UPDATE`,
    );
  } catch (error) {
    primaryError = error;
  }
  await resetRolePreservingPrimary(client, primaryError);
  if (
    result?.rowCount !== 1 ||
    !["LEGACY", "PROTECTED"].includes(result.rows[0]?.phase)
  ) {
    throw new Error("Option C launch boundary cannot be locked.");
  }
  const state = result.rows[0];
  // The owner row lock is already held while the migrator identity and its
  // exact SET-only proof-owner relationship are attested.
  await assertProofOwnerAccess(client, migrationRole);
  await assertSameCutoverTransaction(client, migrationRole, state);
  return state;
}

export async function assertSameCutoverTransaction(
  client,
  migrationRole,
  state,
) {
  const identity = await client.query(
    `SELECT current_user,session_user,pg_catalog.pg_backend_pid() AS backend_pid,
            pg_catalog.pg_current_xact_id()::text AS full_xid`,
  );
  const row = identity.rows[0];
  if (
    identity.rowCount !== 1 ||
    row?.current_user !== migrationRole ||
    row.session_user !== migrationRole ||
    row.backend_pid !== state.backend_pid ||
    row.full_xid !== state.full_xid
  ) {
    throw new Error("Option C cutover left its original migrator transaction.");
  }
}

export async function promoteOptionCBoundary(client, migrationRole, state) {
  await assertSameCutoverTransaction(client, migrationRole, state);
  if (state.phase === "PROTECTED") return false;
  await client.query(`SET LOCAL ROLE ${optionCRoles.proofOwner}`);
  let result;
  let primaryError;
  try {
    result = await client.query(
      `UPDATE auth_proof_private.option_c_launch_boundary
          SET phase='PROTECTED',promoted_at=pg_catalog.clock_timestamp()
        WHERE singleton AND phase='LEGACY'
        RETURNING phase`,
    );
  } catch (error) {
    primaryError = error;
  }
  await resetRolePreservingPrimary(client, primaryError);
  if (result?.rowCount !== 1 || result.rows[0]?.phase !== "PROTECTED") {
    throw new Error("Option C launch boundary promotion was not atomic.");
  }
  await assertSameCutoverTransaction(client, migrationRole, state);
  return true;
}
