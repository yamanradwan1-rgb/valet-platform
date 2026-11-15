import {
  assertDatabaseCredentialSeparation,
  decodedDatabaseIdentity,
  parseRuntimeDatabaseUrlForProvisioning,
} from "./database-connection-policy.mjs";
import {
  managementWriterFunctions,
  privateStaffManagementFunctions,
  runtimeStaffManagementFunctions,
} from "./staff-management-runtime-privileges.mjs";
import { protectedStaffOnboardingFunctions } from "./staff-onboarding-runtime-privileges.mjs";

const safeRole = /^[a-z_][a-z0-9_]{0,62}$/;
export const managementWriterRole = "vaylet_management_writer";
const readableTables = [
  "locations",
  "membership_location_access",
  "organization_memberships",
  "organization_subscriptions",
  "organizations",
];
const restrictedReads = {
  users: ["id", "status", "email"],
  audit_events: [
    "id", "organization_id", "location_id", "valet_session_id",
    "actor_membership_id", "actor_type", "controlled_operator_ref",
    "event_type", "entity_type", "entity_id", "metadata_json",
    "idempotency_key", "occurred_at",
  ],
  staff_onboarding_invitations: ["organization_id", "operation_id"],
  staff_auth_sessions: [
    "id", "user_id", "current_access_token_hash", "revoked_at",
    "access_expires_at", "absolute_expires_at", "mfa_authenticated_at",
    "mfa_factor_id", "last_admin_activity_at", "created_at",
  ],
  user_mfa_totp_factors: ["id", "user_id", "state"],
};

export function requireManagementWriterIdentity(writerUrl, migration, runtime) {
  const writer = parseRuntimeDatabaseUrlForProvisioning(
    writerUrl, "MANAGEMENT_WRITER_DATABASE_URL",
  );
  assertDatabaseCredentialSeparation(migration, writer, process.env.NODE_ENV);
  const identity = decodedDatabaseIdentity(writer);
  const regular = decodedDatabaseIdentity(runtime);
  const owner = decodedDatabaseIdentity(migration);
  if (
    !safeRole.test(identity.role) ||
    identity.role !== managementWriterRole ||
    identity.role === regular.role ||
    identity.role === owner.role ||
    identity.password === regular.password ||
    identity.password === owner.password ||
    identity.host !== regular.host ||
    identity.port !== regular.port ||
    identity.database !== regular.database
  ) {
    throw new Error("Management writer database credentials must be isolated.");
  }
  return identity;
}

export async function provisionManagementWriterPrivileges(
  client, formatted, identity, runtimeRole,
) {
  const role = identity.role;
  const metadata = await client.query(
    `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication,
            rolbypassrls, rolinherit FROM pg_roles WHERE rolname=$1`, [role],
  );
  if (metadata.rowCount === 0) {
    await formatted(client,
      "CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
      [role, identity.password]);
  } else {
    const info = metadata.rows[0];
    if (
      info.rolsuper || info.rolcreatedb || info.rolcreaterole ||
      info.rolreplication || info.rolbypassrls
    ) throw new Error("Management writer role attributes are unsafe.");
    await formatted(client, "ALTER ROLE %I WITH LOGIN PASSWORD %L NOINHERIT", [
      role, identity.password,
    ]);
  }
  const grants = await client.query(
    `SELECT 1 FROM pg_auth_members AS membership
     JOIN pg_roles AS grantee ON grantee.oid=membership.member
     WHERE grantee.rolname=$1`, [role],
  );
  if (grants.rowCount !== 0) {
    throw new Error("Management writer role cannot inherit or assume another role.");
  }
  await formatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [
    identity.database, role,
  ]);
  await formatted(client, "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I", [
    identity.database, role,
  ]);
  await formatted(client, "REVOKE ALL ON SCHEMA public FROM %I", [role]);
  await formatted(client, "GRANT USAGE ON SCHEMA public TO %I", [role]);
  await formatted(client, "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I", [role]);
  await formatted(client, "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I", [role]);
  for (const table of [...readableTables, ...Object.keys(restrictedReads)]) {
    const attributes = await client.query(
      `SELECT pg_catalog.quote_ident(attname) AS column_sql
       FROM pg_catalog.pg_attribute
       WHERE attrelid=$1::pg_catalog.regclass AND attnum>0 AND NOT attisdropped`,
      ["public." + table],
    );
    if (attributes.rowCount === 0) throw new Error("Management writer table missing.");
    const columns = attributes.rows.map(({column_sql}) => column_sql).join(",");
    await formatted(
      client,
      "REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE public.%I FROM %I",
      [columns, columns, columns, columns, table, role],
    );
  }
  for (const table of readableTables) {
    await formatted(client, "GRANT SELECT ON TABLE public.%I TO %I", [table, role]);
  }
  for (const [table, columns] of Object.entries(restrictedReads)) {
    for (const column of columns) {
      await formatted(client, "GRANT SELECT (%I) ON TABLE public.%I TO %I", [
        column, table, role,
      ]);
    }
  }
  await formatted(client, "GRANT INSERT ON TABLE public.audit_events TO %I", [role]);
  // PostgreSQL row-locking SELECT ... FOR UPDATE/SHARE in the existing
  // transaction-scoped preflight needs UPDATE on one harmless column.
  // Do not grant authority-bearing status/role/MFA/session credential writes.
  for (const [table, column] of [
    ["users", "updated_at"],
    ["organization_memberships", "updated_at"],
    ["locations", "updated_at"],
    ["staff_auth_sessions", "last_admin_activity_at"],
  ]) {
    await formatted(client, "GRANT UPDATE (%I) ON TABLE public.%I TO %I", [
      column, table, role,
    ]);
  }

  for (const name of [
    ...runtimeStaffManagementFunctions,
    ...protectedStaffOnboardingFunctions,
    ...privateStaffManagementFunctions,
  ]) {
    await formatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [name, role]);
  }
  for (const name of managementWriterFunctions) {
    await formatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [name, runtimeRole]);
    await formatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [name, role]);
    await formatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [name, role]);
  }
}

export async function verifyManagementWriterPrivileges(client, role, runtimeRole) {
  const closure = await client.query(
    `SELECT p.oid::regprocedure::text AS signature
     FROM pg_proc AS p
     WHERE p.pronamespace='public'::regnamespace
       AND p.prosecdef
       AND p.proname SIMILAR TO '(staff_management|staff_onboarding|staff_auth|mfa)_%'
       AND has_function_privilege($1,p.oid,'EXECUTE')`,
    [role],
  );
  const expected = new Set(managementWriterFunctions);
  const actual = new Set(closure.rows.map(({ signature }) =>
    signature.startsWith("public.") ? signature : "public." + signature,
  ));
  if (
    actual.size !== expected.size ||
    [...actual].some((signature) => !expected.has(signature))
  ) {
    throw new Error("Management writer inherited an unexpected protected function.");
  }
  for (const name of [
    ...managementWriterFunctions,
    ...runtimeStaffManagementFunctions,
    ...protectedStaffOnboardingFunctions,
    ...privateStaffManagementFunctions,
  ]) {
    const allowed = managementWriterFunctions.includes(name);
    const result = await client.query(
      `SELECT has_function_privilege($1,$3,'EXECUTE') AS writer_allowed,
              has_function_privilege($2,$3,'EXECUTE') AS runtime_allowed,
              function.prosecdef AS definer,
              function.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS safe_path,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(
                  COALESCE(function.proacl,acldefault('f',function.proowner))) AS acl
                WHERE acl.privilege_type='EXECUTE' AND
                      (acl.grantee=0 OR acl.is_grantable)
              ) AS acl_safe
       FROM pg_proc AS function WHERE function.oid=to_regprocedure($3)`,
      [role, runtimeRole, name],
    );
    const value = result.rows[0];
    if (
      value?.writer_allowed !== allowed ||
      value.runtime_allowed !== false ||
      value.definer !== true || value.safe_path !== true ||
      value.acl_safe !== true
    ) throw new Error("Management writer function ACL check failed.");
  }
  for (const [table, privilege, allowed] of [
    ...readableTables.map((table) => [table, "SELECT", true]),
    ["audit_events", "INSERT", true],
    ["organization_memberships", "UPDATE", false],
    ["membership_location_access", "INSERT", false],
    ["membership_location_access", "DELETE", false],
    ["staff_auth_sessions", "UPDATE", false],
    ["staff_auth_sessions", "INSERT", false],
    ["staff_auth_sessions", "SELECT", false],
    ["user_mfa_totp_factors", "SELECT", false],
    ["staff_refresh_credentials", "INSERT", false],
    ["staff_refresh_credentials", "UPDATE", false],
    ["user_mfa_totp_factors", "UPDATE", false],
    ["users", "UPDATE", false],
  ]) {
    const result = await client.query(
      "SELECT has_table_privilege($1,$2,$3) AS allowed",
      [role, "public." + table, privilege],
    );
    if (result.rows[0]?.allowed !== allowed) {
      throw new Error("Management writer table ACL check failed.");
    }
  }
  for (const [table, columns] of Object.entries(restrictedReads)) {
    for (const column of columns) {
      const result = await client.query(
        "SELECT has_column_privilege($1,$2,$3,'SELECT') AS allowed",
        [role, "public." + table, column],
      );
      if (result.rows[0]?.allowed !== true) {
        throw new Error("Management writer sensitive-column read permission missing.");
      }
    }
  }
  for (const [table, column, action] of [
    ["users", "password_hash", "SELECT"],
    ["user_mfa_totp_factors", "protected_secret", "SELECT"],
    ["staff_auth_sessions", "mfa_authenticated_at", "UPDATE"],
    ["staff_auth_sessions", "mfa_factor_id", "UPDATE"],
    ["staff_auth_sessions", "current_access_token_hash", "UPDATE"],
    ["organization_memberships", "role", "UPDATE"],
    ["organization_memberships", "status", "UPDATE"],
    ["users", "status", "UPDATE"],
  ]) {
    const result = await client.query(
      "SELECT has_column_privilege($1,$2,$3,$4) AS allowed",
      [role, "public." + table, column, action],
    );
    if (result.rows[0]?.allowed !== false) {
      throw new Error("Management writer can access forbidden protected column.");
    }
  }
  for (const [table, column] of [
    ["users", "updated_at"],
    ["organization_memberships", "updated_at"],
    ["locations", "updated_at"],
    ["staff_auth_sessions", "last_admin_activity_at"],
  ]) {
    const result = await client.query(
      "SELECT has_column_privilege($1,$2,$3,'UPDATE') AS allowed",
      [role, "public." + table, column],
    );
    if (result.rows[0]?.allowed !== true) {
      throw new Error("Management writer cannot lock preflight authority rows.");
    }
  }
}
