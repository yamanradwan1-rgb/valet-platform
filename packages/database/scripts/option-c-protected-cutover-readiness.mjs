import { optionCFunctionContract } from "./option-c-protected-cutover-acl.mjs";
import { verifyOptionCRoleIsolation } from "./option-c-protected-cutover-roles.mjs";
import { optionCRoles } from "./option-c-protected-cutover-state.mjs";
import { assertOptionCRevocationIsMonotonic } from "./option-c-protected-cutover-revocation.mjs";
import { verifyManagementWriterPrivileges } from "./management-writer-privileges.mjs";
import { verifyOptionCManagementBodies } from "./option-c-protected-cutover-management-bodies.mjs";

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

async function assertFunctionReady(client, signature, role, expectedPath) {
  const result = await client.query(
    `SELECT function.prosecdef,owner.rolname AS owner,function.proconfig,
            pg_catalog.has_function_privilege($2,function.oid,'EXECUTE') AS allowed,
            NOT EXISTS (
              SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
            ) AS public_denied,
            NOT EXISTS (
              SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner
                AND acl.is_grantable
            ) AS grant_option_denied
       FROM pg_catalog.pg_proc function
       JOIN pg_catalog.pg_roles owner ON owner.oid=function.proowner
       WHERE function.oid=pg_catalog.to_regprocedure($1)`,
    [signature, role],
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    row?.prosecdef !== true ||
    row.allowed !== true ||
    row.public_denied !== true ||
    row.grant_option_denied !== true ||
    row.owner === role ||
    !Array.isArray(row.proconfig) ||
    !row.proconfig.includes(expectedPath)
  ) {
    throw new Error(`Option C protected function ${signature} is not ready.`);
  }
}

async function assertRetiredTargetsExist(client) {
  for (const signature of optionCFunctionContract.retiredManagement) {
    const result = await client.query(
      `SELECT function.prosecdef,function.proconfig
         FROM pg_catalog.pg_proc function
         WHERE function.oid=pg_catalog.to_regprocedure($1)`,
      [signature],
    );
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      row?.prosecdef !== true ||
      !Array.isArray(row.proconfig) ||
      !row.proconfig.includes("search_path=pg_catalog, public")
    ) {
      throw new Error(
        `Option C retirement target ${signature} is missing or unsafe.`,
      );
    }
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
) {
  await verifyOptionCManagementBodies(client);
  await assertOptionCRevocationIsMonotonic(client, runtimeRole);
  await verifyOptionCRoleIsolation(client, runtimeRole, migrationRole);
  await verifyManagementWriterPrivileges(
    client,
    optionCRoles.managementWriter,
    runtimeRole,
  );
  for (const [role, tables] of Object.entries(writerColumns)) {
    for (const [table, privileges] of Object.entries(tables)) {
      for (const [privilege, columns] of Object.entries(privileges)) {
        await assertColumns(client, role, table, privilege, columns);
      }
    }
  }

  await assertFunctionReady(
    client,
    optionCFunctionContract.staffAuth[0],
    optionCRoles.staffAuthWriter,
    "search_path=pg_catalog, public",
  );
  await assertFunctionReady(
    client,
    optionCFunctionContract.staffAuth[1],
    optionCRoles.staffAuthWriter,
    "search_path=pg_catalog",
  );
  await assertFunctionReady(
    client,
    optionCFunctionContract.staffAuth[2],
    optionCRoles.staffAuthWriter,
    "search_path=pg_catalog",
  );
  await assertFunctionReady(
    client,
    optionCFunctionContract.mfa[0],
    optionCRoles.mfaWriter,
    "search_path=pg_catalog",
  );
  for (const signature of optionCFunctionContract.management) {
    await assertFunctionReady(
      client,
      signature,
      optionCRoles.managementWriter,
      "search_path=pg_catalog, public",
    );
  }
  await assertFunctionReady(
    client,
    optionCFunctionContract.mfaActivity,
    runtimeRole,
    "search_path=pg_catalog",
  );
  await assertRetiredTargetsExist(client);
  await assertPrivateKeysReady(client);
}
