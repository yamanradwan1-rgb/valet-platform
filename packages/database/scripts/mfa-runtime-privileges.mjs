export const mfaSessionInsertColumns = [
  "id",
  "user_id",
  "current_access_token_hash",
  "access_expires_at",
  "absolute_expires_at",
  "created_at",
  "last_rotated_at",
];

export const mfaSessionUpdateColumns = [
  "current_access_token_hash",
  "access_expires_at",
  "revoked_at",
  "last_rotated_at",
  "mfa_authenticated_at",
  "mfa_factor_id",
  "last_admin_activity_at",
];

export const mfaFactorInsertColumns = [
  "id",
  "user_id",
  "state",
  "protected_secret",
  "pending_enrollment_session_id",
];
export const mfaFactorUpdateColumns = [
  "state",
  "last_accepted_step",
  "recovery_set_generation",
  "activated_at",
  "retired_at",
];
export const mfaRecoveryInsertColumns = [
  "id",
  "factor_id",
  "set_generation",
  "slot",
  "selector",
  "verifier",
];
export const mfaRefreshUpdateColumns = [
  "consumed_at",
  "replaced_by_credential_id",
];

const sessionColumns = [
  ...new Set([...mfaSessionInsertColumns, ...mfaSessionUpdateColumns]),
];
const refreshColumns = [
  "id",
  "session_id",
  "token_hash",
  "generation",
  "created_at",
  "expires_at",
  "consumed_at",
  "replaced_by_credential_id",
];
const factorColumns = [
  ...new Set([
    ...mfaFactorInsertColumns,
    ...mfaFactorUpdateColumns,
    "created_at",
  ]),
];
const recoveryColumns = [
  ...new Set([...mfaRecoveryInsertColumns, "created_at", "consumed_at"]),
];

async function grantColumns(
  client,
  executeFormatted,
  role,
  privilege,
  table,
  columns,
) {
  for (const column of columns) {
    await executeFormatted(
      client,
      `GRANT ${privilege} (%I) ON TABLE %I TO %I`,
      [column, table, role],
    );
  }
}

async function revokeColumnPrivileges(
  client,
  executeFormatted,
  runtimeRole,
  table,
  columns,
) {
  const list = columns.map((column) => `"${column}"`).join(", ");
  const privileges = `SELECT (${list}), INSERT (${list}), UPDATE (${list}), REFERENCES (${list})`;
  await client.query(`REVOKE ${privileges} ON TABLE "${table}" FROM PUBLIC`);
  await executeFormatted(client, `REVOKE ${privileges} ON TABLE %I FROM %I`, [
    table,
    runtimeRole,
  ]);
}

export async function provisionMfaPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE
       staff_auth_sessions, staff_refresh_credentials FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON TABLE staff_auth_sessions, user_mfa_totp_factors, mfa_recovery_codes FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE staff_refresh_credentials FROM %I",
    [runtimeRole],
  );
  await client.query(
    `REVOKE ALL ON TABLE user_mfa_totp_factors, mfa_recovery_codes FROM PUBLIC`,
  );
  for (const [table, columns] of [
    ["staff_auth_sessions", sessionColumns],
    ["staff_refresh_credentials", refreshColumns],
    ["user_mfa_totp_factors", factorColumns],
    ["mfa_recovery_codes", recoveryColumns],
  ]) {
    await revokeColumnPrivileges(
      client,
      executeFormatted,
      runtimeRole,
      table,
      columns,
    );
  }

  await executeFormatted(
    client,
    "GRANT SELECT ON TABLE staff_auth_sessions TO %I",
    [runtimeRole],
  );
  await grantColumns(
    client,
    executeFormatted,
    runtimeRole,
    "INSERT",
    "staff_auth_sessions",
    mfaSessionInsertColumns,
  );
  await grantColumns(
    client,
    executeFormatted,
    runtimeRole,
    "UPDATE",
    "staff_auth_sessions",
    mfaSessionUpdateColumns,
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE staff_refresh_credentials TO %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT UPDATE (consumed_at, replaced_by_credential_id) ON TABLE staff_refresh_credentials TO %I",
    [runtimeRole],
  );

  for (const table of ["user_mfa_totp_factors", "mfa_recovery_codes"]) {
    await executeFormatted(client, "GRANT SELECT ON TABLE %I TO %I", [
      table,
      runtimeRole,
    ]);
  }
  await grantColumns(
    client,
    executeFormatted,
    runtimeRole,
    "INSERT",
    "user_mfa_totp_factors",
    mfaFactorInsertColumns,
  );
  await grantColumns(
    client,
    executeFormatted,
    runtimeRole,
    "UPDATE",
    "user_mfa_totp_factors",
    mfaFactorUpdateColumns,
  );
  await grantColumns(
    client,
    executeFormatted,
    runtimeRole,
    "INSERT",
    "mfa_recovery_codes",
    mfaRecoveryInsertColumns,
  );
  await executeFormatted(
    client,
    "GRANT UPDATE (consumed_at) ON TABLE mfa_recovery_codes TO %I",
    [runtimeRole],
  );
  for (const fn of [
    "mfa_totp_factor_guard()",
    "mfa_recovery_code_guard()",
    "mfa_pending_session_owner_guard()",
  ]) {
    await client.query(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      fn,
      runtimeRole,
    ]);
  }
}
