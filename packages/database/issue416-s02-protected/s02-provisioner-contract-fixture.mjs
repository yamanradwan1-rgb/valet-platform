export const runtime = "s02_runtime";
export const writer = {
  role: "s02_writer",
  password: "synthetic-test-secret-writer-123456",
};

export const protectedReadColumns = {
  users: ["id", "status"],
  organizations: ["id", "status"],
  organization_memberships: [
    "id",
    "organization_id",
    "user_id",
    "role",
    "status",
  ],
  staff_auth_sessions: [
    "id",
    "user_id",
    "absolute_expires_at",
    "mfa_authenticated_at",
    "mfa_factor_id",
    "last_admin_activity_at",
    "current_access_token_hash",
    "revoked_at",
    "access_expires_at",
  ],
  user_mfa_totp_factors: [
    "id",
    "user_id",
    "state",
    "protected_secret",
    "pending_enrollment_session_id",
    "last_accepted_step",
    "recovery_set_generation",
    "created_at",
    "activated_at",
    "retired_at",
  ],
  mfa_recovery_codes: [
    "id",
    "verifier",
    "factor_id",
    "set_generation",
    "selector",
    "consumed_at",
  ],
};

const columns = {
  users: [
    "id",
    "email",
    "password_hash",
    "status",
    "last_login_at",
    "runtime_lock_version",
  ],
  organizations: ["id", "name", "status"],
  organization_memberships: [
    "id",
    "organization_id",
    "user_id",
    "role",
    "status",
  ],
  staff_auth_sessions: [
    "id",
    "user_id",
    "current_access_token_hash",
    "access_expires_at",
    "absolute_expires_at",
    "mfa_authenticated_at",
    "mfa_factor_id",
    "last_admin_activity_at",
    "revoked_at",
    "runtime_lock_version",
  ],
  user_mfa_totp_factors: [
    "id",
    "user_id",
    "state",
    "protected_secret",
    "pending_enrollment_session_id",
    "last_accepted_step",
    "recovery_set_generation",
    "created_at",
    "activated_at",
    "retired_at",
  ],
  mfa_recovery_codes: [
    "id",
    "factor_id",
    "set_generation",
    "slot",
    "selector",
    "verifier",
    "consumed_at",
    "created_at",
  ],
  anti_abuse_events: ["id", "scope", "key_hash", "state"],
};

function columnRows(sql, params) {
  if (sql.includes("SELECT table_name,column_name")) {
    const rows =
      params[0] === "public"
        ? Object.entries(columns).flatMap(([table_name, names]) =>
            names.map((column_name) => ({ table_name, column_name })),
          )
        : [];
    return { rowCount: rows.length, rows };
  }
  const rows = (columns[params[1]] ?? []).map((column_name) => ({
    column_name,
  }));
  return { rowCount: rows.length, rows };
}

export function capture(options = {}) {
  const commands = [];
  const client = {
    query: async (sql, params = []) => {
      commands.push({ sql, params });
      if (sql.includes("information_schema.columns")) {
        return columnRows(sql, params);
      }
      if (sql.includes("SELECT nspname FROM pg_catalog.pg_namespace")) {
        return {
          rowCount: 4,
          rows: [
            "public",
            "mfa_activity_private",
            "s04_quota_guard",
            "auth_proof_private",
          ].map((nspname) => ({ nspname })),
        };
      }
      if (sql.includes("has_function_privilege")) {
        return {
          rowCount: 1,
          rows: [
            {
              writer: true,
              ordinary_denied: true,
              public_allowed: false,
            },
          ],
        };
      }
      if (sql.includes("FROM pg_catalog.pg_roles")) {
        if (!options.existingWriter) return { rowCount: 0, rows: [] };
        return {
          rowCount: 1,
          rows: [
            {
              rolcanlogin: true,
              rolinherit: false,
              rolsuper: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolbypassrls: false,
            },
          ],
        };
      }
      if (sql.includes("FROM pg_catalog.pg_auth_members")) {
        const values = sql.includes("SELECT parent.rolname")
          ? (options.inheritedRoles ?? [])
          : sql.includes("SELECT member.rolname")
            ? (options.delegatedRoles ?? [])
            : [];
        return {
          rowCount: values.length,
          rows: values.map((rolname) => ({ rolname })),
        };
      }
      if (sql.includes("current_database()")) {
        return { rowCount: 1, rows: [{ db: "s02_test_db" }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const formatted = async (_client, sql, params) => {
    commands.push({ sql, params });
  };
  return { commands, client, formatted };
}

export function has(commands, text, column) {
  return commands.some(
    ({ sql, params }) =>
      sql.includes(text) && (column === undefined || params?.[0] === column),
  );
}
