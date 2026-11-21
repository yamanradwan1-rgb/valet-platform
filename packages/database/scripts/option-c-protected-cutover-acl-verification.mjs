import { verifyS04RuntimePrivileges } from "./s04-runtime-privileges.mjs";
import { assertOptionCRevocationIsMonotonic } from "./option-c-protected-cutover-revocation.mjs";
import { verifyManagementWriterPrivileges } from "./management-writer-privileges.mjs";
import { verifyOptionCManagementBodies } from "./option-c-protected-cutover-management-bodies.mjs";
import { verifyOptionCRoleIsolation } from "./option-c-protected-cutover-roles.mjs";
import { optionCRoles } from "./option-c-protected-cutover-state.mjs";
import { verifyStaffSessionLockAcl } from "./option-c-staff-session-lock-acl.mjs";
import {
  optionCFunctionContract,
  tableMutationContract,
} from "./option-c-protected-cutover-acl-contract.mjs";
import {
  assertExactMutationColumns,
  assertNoDestructiveTablePrivileges,
  assertProtectedFunction,
  assertPublicMutationDenied,
} from "./option-c-protected-cutover-acl-assertions.mjs";

export async function verifyOptionCProtectedAcl(
  client,
  runtimeRole,
  migrationRole,
) {
  await verifyOptionCManagementBodies(client);
  await assertOptionCRevocationIsMonotonic(client, runtimeRole);
  const roles = await verifyOptionCRoleIsolation(
    client,
    runtimeRole,
    migrationRole,
  );
  await verifyStaffSessionLockAcl(client, runtimeRole, migrationRole, roles);
  await verifyManagementWriterPrivileges(
    client,
    optionCRoles.managementWriter,
    runtimeRole,
  );
  await assertPublicMutationDenied(client);
  await assertNoDestructiveTablePrivileges(client, roles);
  for (const [table, expected] of Object.entries(tableMutationContract)) {
    await assertExactMutationColumns(client, runtimeRole, table, expected);
  }

  await assertExactMutationColumns(
    client,
    optionCRoles.staffAuthWriter,
    "staff_auth_sessions",
    {
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
  );
  await assertExactMutationColumns(
    client,
    optionCRoles.staffAuthWriter,
    "staff_refresh_credentials",
    {
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
  );
  await assertExactMutationColumns(
    client,
    optionCRoles.mfaWriter,
    "staff_auth_sessions",
    {
      INSERT: [],
      UPDATE: [
        "mfa_authenticated_at",
        "mfa_factor_id",
        "last_admin_activity_at",
      ],
    },
  );
  await assertExactMutationColumns(
    client,
    optionCRoles.mfaWriter,
    "user_mfa_totp_factors",
    {
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
  );
  await assertExactMutationColumns(
    client,
    optionCRoles.mfaWriter,
    "mfa_recovery_codes",
    {
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
  );

  const denied = roles.filter((role) => role !== optionCRoles.staffAuthWriter);
  await assertProtectedFunction(
    client,
    optionCFunctionContract.staffAuth[0],
    optionCRoles.staffAuthWriter,
    denied,
    "search_path=pg_catalog, public",
  );
  await assertProtectedFunction(
    client,
    optionCFunctionContract.staffAuth[1],
    optionCRoles.staffAuthWriter,
    denied,
    "search_path=pg_catalog",
  );
  await assertProtectedFunction(
    client,
    optionCFunctionContract.staffAuth[2],
    optionCRoles.staffAuthWriter,
    denied,
    "search_path=pg_catalog",
  );
  await assertProtectedFunction(
    client,
    optionCFunctionContract.mfa[0],
    optionCRoles.mfaWriter,
    roles.filter((role) => role !== optionCRoles.mfaWriter),
    "search_path=pg_catalog",
  );
  for (const signature of optionCFunctionContract.management) {
    await assertProtectedFunction(
      client,
      signature,
      optionCRoles.managementWriter,
      roles.filter((role) => role !== optionCRoles.managementWriter),
      "search_path=pg_catalog, public",
    );
  }
  for (const signature of optionCFunctionContract.retiredManagement) {
    await assertProtectedFunction(
      client,
      signature,
      null,
      roles,
      "search_path=pg_catalog, public",
    );
  }
  await assertProtectedFunction(
    client,
    optionCFunctionContract.mfaActivity,
    runtimeRole,
    roles.filter((role) => role !== runtimeRole),
    "search_path=pg_catalog",
  );
  for (const table of [
    "mfa_activity_private.key_root",
    "mfa_activity_private.consumed_nonce",
  ]) {
    for (const privilege of [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ]) {
      const result = await client.query(
        "SELECT has_table_privilege($1,$2,$3) AS allowed",
        [runtimeRole, table, privilege],
      );
      if (result.rows[0]?.allowed !== false) {
        throw new Error(
          "Ordinary runtime can access MFA activity private tables.",
        );
      }
    }
  }
  await verifyS04RuntimePrivileges(client, runtimeRole);
}
