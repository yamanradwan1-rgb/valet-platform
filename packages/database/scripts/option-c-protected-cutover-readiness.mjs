import { optionCFunctionContract } from "./option-c-protected-cutover-acl.mjs";
import { verifyOptionCRoleIsolation } from "./option-c-protected-cutover-roles.mjs";
import { optionCRoles } from "./option-c-protected-cutover-state.mjs";
import { assertOptionCRevocationIsMonotonic } from "./option-c-protected-cutover-revocation.mjs";
import { verifyManagementWriterPrivileges } from "./management-writer-privileges.mjs";
import { verifyManagementWriterFunctionInventory } from "./management-writer-function-inventory.mjs";
import { verifyStaffAuthWriterGrants } from "./verify-staff-auth-writer-grants.mjs";
import { verifyOptionCManagementBodies } from "./option-c-protected-cutover-management-bodies.mjs";
import { verifyS04RuntimePrivileges } from "./s04-runtime-privileges.mjs";
import { assertOptionCFunctionReady } from "./option-c-protected-function-readiness.mjs";

const writerColumns = Object.freeze({
  [optionCRoles.staffAuthWriter]: {
    staff_auth_sessions: {
      INSERT: [
        "id",
        "user_id",
        "current_access_token_hash",
        "access_expires_at",
        "absolute_expires_at",
        "created_at",
        "last_rotated_at",
      ],
      UPDATE: [
        "current_access_token_hash",
        "access_expires_at",
        "last_rotated_at",
        "revoked_at",
      ],
    },
    staff_refresh_credentials: {
      INSERT: [
        "id",
        "session_id",
        "token_hash",
        "generation",
        "created_at",
        "expires_at",
      ],
      UPDATE: ["consumed_at", "replaced_by_credential_id"],
    },
  },
  [optionCRoles.mfaWriter]: {
    staff_auth_sessions: {
      UPDATE: [
        "mfa_authenticated_at",
        "mfa_factor_id",
        "last_admin_activity_at",
      ],
    },
    user_mfa_totp_factors: {
      INSERT: [
        "id",
        "user_id",
        "state",
        "protected_secret",
        "pending_enrollment_session_id",
      ],
      UPDATE: [
        "state",
        "last_accepted_step",
        "recovery_set_generation",
        "activated_at",
        "retired_at",
      ],
    },
    mfa_recovery_codes: {
      INSERT: [
        "id",
        "factor_id",
        "set_generation",
        "slot",
        "selector",
        "verifier",
      ],
      UPDATE: ["consumed_at"],
    },
  },
});

async function assertColumns(client, role, table, privilege, columns) {
  for (const column of columns) {
    const result = await client.query(
      "SELECT has_column_privilege($1,$2,$3,$4) AS allowed",
      [role, `public.${table}`, column, privilege],
    );
    if (result.rows[0]?.allowed !== true) {
      throw new Error(
        `Option C ${role} lacks ${table}.${column} ${privilege}.`,
      );
    }
  }
}

async function assertRetiredTargetsExist(client, expectedOwner) {
  for (const signature of optionCFunctionContract.retiredManagement) {
    const result = await client.query(
      `SELECT function.prosecdef,function.proconfig,owner.rolname AS owner,
              owner.rolcanlogin AS owner_can_login,
              owner.rolinherit AS owner_inherit,
              owner.rolsuper AS owner_superuser,
              owner.rolcreatedb AS owner_create_db,
              owner.rolcreaterole AS owner_create_role,
              owner.rolreplication AS owner_replication,
              owner.rolbypassrls AS owner_bypass_rls,
              pg_catalog.has_database_privilege(owner.oid,pg_catalog.current_database(),'CREATE') AS owner_database_create,
              pg_catalog.has_schema_privilege(owner.oid,'public','CREATE') AS owner_public_create
         FROM pg_catalog.pg_proc function
         JOIN pg_catalog.pg_roles owner ON owner.oid=function.proowner
         WHERE function.oid=pg_catalog.to_regprocedure($1)`,
      [signature],
    );
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      row?.prosecdef !== true ||
      row.owner !== expectedOwner ||
      row.owner_can_login !== true ||
      row.owner_inherit !== false ||
      row.owner_superuser !== false ||
      row.owner_replication !== false ||
      row.owner_bypass_rls !== false ||
      !Array.isArray(row.proconfig) ||
      !row.proconfig.includes("search_path=pg_catalog, public")
    ) {
      throw new Error(
        `Option C retirement target ${signature} is missing or unsafe.`,
      );
    }
  }
  const unsignedS04 = await client.query(
    "SELECT pg_catalog.to_regprocedure($1) IS NULL AS absent",
    ["public.s04_staff_activation_success(uuid,text,text,text)"],
  );
  if (unsignedS04.rowCount !== 1 || unsignedS04.rows[0]?.absent !== true) {
    throw new Error(
      "Option C unsigned S04 activation overload remains installed.",
    );
  }
}

async function assertPrivateKeysReady(client) {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::integer FROM s04_quota_guard.proof_key)=1 AS s04_key,
       (SELECT count(*)::integer FROM mfa_activity_private.key_root)=1 AS mfa_key`,
  );
  if (
    result.rowCount !== 1 ||
    result.rows[0]?.s04_key !== true ||
    result.rows[0]?.mfa_key !== true
  ) {
    throw new Error("Option C protected writer proof material is not ready.");
  }
}

export async function verifyOptionCProtectedReadiness(
  client,
  runtimeRole,
  migrationRole,
  { phase } = {},
) {
  if (phase !== "LEGACY" && phase !== "PROTECTED") {
    throw new Error("Option C readiness requires the locked boundary phase.");
  }
  await verifyOptionCManagementBodies(client);
  await assertOptionCRevocationIsMonotonic(client, runtimeRole);
  await verifyOptionCRoleIsolation(client, runtimeRole, migrationRole);
  await verifyS04RuntimePrivileges(client, runtimeRole, migrationRole, {
    requireTrustedOwnerAttributes: true,
  });
  await verifyManagementWriterPrivileges(
    client,
    optionCRoles.managementWriter,
    runtimeRole,
    migrationRole,
  );
  await verifyManagementWriterFunctionInventory(
    client,
    optionCRoles.managementWriter,
    migrationRole,
  );
  await verifyStaffAuthWriterGrants(
    client,
    optionCRoles.staffAuthWriter,
    runtimeRole,
    migrationRole,
  );
  // These independently owned verification modules become available when the
  // W73 session-lock and W74 MFA SQL/ACL branches are integrated. Missing
  // modules fail the cutover closed until that integration is complete.
  const { verifyMfaProtectedWriterPrivileges } =
    await import("./mfa-protected-writer-verification.mjs");
  await verifyMfaProtectedWriterPrivileges(
    client,
    runtimeRole,
    migrationRole,
    optionCRoles.mfaWriter,
  );
  const { verifyStaffSessionLockAcl } =
    await import("./option-c-staff-session-lock-acl.mjs");
  await verifyStaffSessionLockAcl(
    client,
    runtimeRole,
    migrationRole,
    [
      runtimeRole,
      optionCRoles.staffAuthWriter,
      optionCRoles.mfaWriter,
      optionCRoles.managementWriter,
    ],
    { requireRuntimeExecute: phase === "PROTECTED" },
  );
  for (const [role, tables] of Object.entries(writerColumns)) {
    for (const [table, privileges] of Object.entries(tables)) {
      for (const [privilege, columns] of Object.entries(privileges)) {
        await assertColumns(client, role, table, privilege, columns);
      }
    }
  }

  await assertOptionCFunctionReady(
    client,
    optionCFunctionContract.staffAuth[0],
    optionCRoles.staffAuthWriter,
    "search_path=pg_catalog, public",
    migrationRole,
  );
  await assertOptionCFunctionReady(
    client,
    optionCFunctionContract.staffAuth[1],
    optionCRoles.staffAuthWriter,
    "search_path=pg_catalog",
    migrationRole,
  );
  await assertOptionCFunctionReady(
    client,
    optionCFunctionContract.staffAuth[2],
    optionCRoles.staffAuthWriter,
    "search_path=pg_catalog",
    migrationRole,
  );
  await assertOptionCFunctionReady(
    client,
    optionCFunctionContract.mfa[0],
    optionCRoles.mfaWriter,
    "search_path=pg_catalog",
    migrationRole,
  );
  for (const signature of optionCFunctionContract.management) {
    await assertOptionCFunctionReady(
      client,
      signature,
      optionCRoles.managementWriter,
      "search_path=pg_catalog, public",
      migrationRole,
    );
  }
  await assertOptionCFunctionReady(
    client,
    optionCFunctionContract.mfaActivity,
    runtimeRole,
    "search_path=pg_catalog",
    migrationRole,
  );
  await assertRetiredTargetsExist(client, migrationRole);
  await assertPrivateKeysReady(client);
}
