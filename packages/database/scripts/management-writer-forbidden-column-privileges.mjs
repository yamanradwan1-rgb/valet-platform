export async function verifyManagementWriterForbiddenColumnPrivileges(
  client,
  role,
) {
  for (const [table, column, action] of [
    ["staff_auth_sessions", "current_access_token_hash", "SELECT"],
    ["staff_auth_sessions", "last_admin_activity_at", "SELECT"],
    ["staff_auth_sessions", "last_admin_activity_at", "UPDATE"],
    ["users", "password_hash", "SELECT"],
    ["user_mfa_totp_factors", "protected_secret", "SELECT"],
    ["staff_auth_sessions", "mfa_authenticated_at", "UPDATE"],
    ["staff_auth_sessions", "mfa_factor_id", "UPDATE"],
    ["staff_auth_sessions", "current_access_token_hash", "UPDATE"],
    ["organization_memberships", "role", "UPDATE"],
    ["organization_memberships", "status", "UPDATE"],
    ["organization_memberships", "updated_at", "UPDATE"],
    ["locations", "updated_at", "UPDATE"],
    ["users", "status", "UPDATE"],
    ["users", "updated_at", "UPDATE"],
  ]) {
    const result = await client.query(
      "SELECT has_column_privilege($1,$2,$3,$4) AS allowed",
      [role, "public." + table, column, action],
    );
    if (result.rows[0]?.allowed !== false) {
      throw new Error(
        "Management writer can access forbidden protected column.",
      );
    }
  }
  const sessionReads = await client.query(
    `SELECT attribute.attname
       FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace
         ON namespace.oid=relation.relnamespace
       JOIN pg_catalog.pg_attribute attribute
         ON attribute.attrelid=relation.oid AND attribute.attnum>0
        AND NOT attribute.attisdropped
       WHERE namespace.nspname='public'
         AND relation.relname='staff_auth_sessions'
         AND pg_catalog.has_column_privilege(
           $1,relation.oid,attribute.attnum,'SELECT') IS TRUE
       LIMIT 1`,
    [role],
  );
  if (sessionReads.rowCount !== 0) {
    throw new Error("Management writer can read staff auth session columns.");
  }
}
