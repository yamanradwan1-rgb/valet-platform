const protectedPrivateSchemas = new Set([
  "auth_proof_private",
  "mfa_activity_private",
  "s04_quota_guard",
]);

export function inspectOptionCPrivilegeRows(matrix, roles, inventory) {
  const {
    staffSessionLockOwnerColumns,
    protectedTables,
    protectedFunctions,
    writers,
    runtimeLockColumnSet,
  } = inventory;
  const failures = [];
  for (const row of matrix) {
    const privateRelation =
      protectedPrivateSchemas.has(row.schema) &&
      ["table", "column", "sequence"].includes(row.kind);
    if (
      privateRelation &&
      ((row.effective && row.role !== roles.migrationRole) ||
        row.grants?.some((grant) => grant.grantee === "PUBLIC"))
    ) {
      failures.push(
        `Private ${row.kind} ${row.object} ${row.privilege} for ${row.role}`,
      );
    }
    if (
      row.kind === "table" &&
      [
        "staff_auth_sessions",
        "staff_refresh_credentials",
        "user_mfa_totp_factors",
        "mfa_recovery_codes",
        "anti_abuse_events",
        "organization_memberships",
        "locations",
        "staff_onboarding_invitations",
      ].includes(row.object) &&
      row.role === roles.runtime &&
      ["INSERT", "UPDATE", "DELETE", "TRUNCATE"].includes(row.privilege) &&
      row.effective
    )
      failures.push(`Runtime table-level ${row.object} ${row.privilege}`);
    if (
      row.kind === "column" &&
      row.role === roles.runtime &&
      [
        "staff_auth_sessions",
        "staff_refresh_credentials",
        "user_mfa_totp_factors",
        "mfa_recovery_codes",
        "anti_abuse_events",
        "organization_memberships",
        "locations",
        "staff_onboarding_invitations",
      ].includes(row.object) &&
      ["INSERT", "UPDATE", "REFERENCES"].includes(row.privilege) &&
      row.effective &&
      !(
        row.privilege === "UPDATE" &&
        runtimeLockColumnSet.has(`${row.object}.${row.column}`)
      )
    )
      failures.push(
        `Runtime protected column ${row.object}.${row.column} ${row.privilege}`,
      );
    if (row.kind === "column" && row.role === roles.sessionLockOwner) {
      const expected =
        staffSessionLockOwnerColumns[row.object]?.[row.privilege] || [];
      if (row.effective !== expected.includes(row.column)) {
        failures.push(
          `Lock owner ${row.object}.${row.column} ${row.privilege} mismatch`,
        );
      }
    }
    if (
      row.role === roles.sessionLockOwner &&
      ["table", "sequence"].includes(row.kind) &&
      row.effective
    ) {
      failures.push(`Lock owner ${row.kind} ${row.object} ${row.privilege}`);
    }
    if (
      ["table", "column", "sequence", "function", "schema"].includes(
        row.kind,
      ) &&
      row.role !== roles.migrationRole &&
      row.grant_option &&
      !(
        row.kind === "function" &&
        row.role === roles.sessionLockOwner &&
        row.owner === roles.sessionLockOwner
      )
    ) {
      failures.push(`${row.role}: grant option on ${row.kind} ${row.object}`);
    }
    if (["table", "column", "sequence", "function"].includes(row.kind)) {
      const protectedObject =
        (row.kind === "function" &&
          (row.security_definer || protectedFunctions.has(row.object))) ||
        (row.kind === "sequence" &&
          /staff_|mfa_|user_|audit_|membership_|location_/.test(row.object)) ||
        protectedTables.has(row.object);
      if (
        protectedObject &&
        row.grants?.some(
          (g) =>
            g.grantee === "PUBLIC" &&
            (row.kind === "function" ||
              row.privilege !== "SELECT" ||
              (row.kind === "table" &&
                ["staff_auth_sessions", "users"].includes(row.object)) ||
              (row.kind === "column" &&
                ["current_access_token_hash", "password_hash"].includes(
                  row.column,
                ))),
        )
      ) {
        failures.push(`PUBLIC ${row.kind} ${row.object} ${row.privilege}`);
      }
    }
    const safeRuntimeSequenceDefault =
      row.kind === "default" &&
      row.role === roles.migrationRole &&
      row.object === "public" &&
      row.object_type === "S" &&
      row.grantee === roles.runtime &&
      row.grantor === roles.migrationRole &&
      ["SELECT", "USAGE"].includes(row.privilege) &&
      row.grant_option === false;
    if (
      row.kind === "default" &&
      !safeRuntimeSequenceDefault &&
      (row.grantee === "PUBLIC" ||
        row.grant_option ||
        [
          ...writers.map((k) => roles[k]),
          roles.runtime,
          roles.sessionLockOwner,
        ].includes(row.grantee))
    ) {
      failures.push(
        `Unsafe default ACL ${row.role} ${row.object} ${row.privilege} ${row.grantee}`,
      );
    }
    if (
      row.kind === "function" &&
      row.security_definer &&
      (!Array.isArray(row.proconfig) ||
        row.proconfig.filter((value) => value.startsWith("search_path="))
          .length !== 1 ||
        !["pg_catalog", "pg_catalog, public"].includes(row.search_path) ||
        row.proconfig.some(
          (value) =>
            !value.startsWith("search_path=") &&
            !["lock_timeout=200ms", "statement_timeout=500ms"].includes(value),
        ))
    ) {
      failures.push(
        `SECURITY DEFINER ${row.object} unsafe proconfig/search_path`,
      );
    }
  }
  for (const [signature, contract] of protectedFunctions) {
    const rows = matrix.filter(
      (row) => row.kind === "function" && row.object === signature,
    );
    const permitted = roles[contract.role];
    const allowed = rows.find((row) => row.role === permitted);
    const expectedOwner = roles[contract.owner] || roles.migrationRole;
    if (
      !allowed ||
      !allowed.security_definer ||
      allowed.owner !== expectedOwner ||
      allowed.search_path !== contract.path ||
      !Array.isArray(allowed.proconfig) ||
      allowed.proconfig.length !== 1 ||
      allowed.proconfig[0] !== `search_path=${contract.path}` ||
      allowed.effective !== true
    ) {
      failures.push(
        `Protected function ${signature} owner/configuration/EXECUTE mismatch`,
      );
    }
    for (const row of rows) {
      if (
        row.role !== permitted &&
        row.role !== roles.migrationRole &&
        row.role !== expectedOwner &&
        row.effective
      ) {
        failures.push(
          `${row.role} can EXECUTE protected function ${signature}`,
        );
      }
      if (
        row.grants?.some(
          (grant) =>
            grant.grantee !== permitted &&
            grant.grantee !== row.owner &&
            grant.grantee !== roles.migrationRole,
        )
      ) {
        failures.push(`Unexpected EXECUTE grantee on ${signature}`);
      }
    }
  }
  return failures;
}
