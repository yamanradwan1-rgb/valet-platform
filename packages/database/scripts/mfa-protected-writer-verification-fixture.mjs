import {
  mfaProtectedWriterFunctions,
  mfaProtectedWriterSessionUpdateColumns,
  mfaProtectedWriterSelectColumns,
  mfaProtectedWriterUserLockColumn,
} from "./mfa-protected-writer-contract.mjs";
import {
  mfaFactorInsertColumns,
  mfaFactorUpdateColumns,
  mfaRecoveryInsertColumns,
} from "./mfa-runtime-privileges.mjs";

export const writerRole = "vaylet_mfa_writer";
export const runtimeRole = "vaylet_runtime";
export const migrationRole = "vaylet_migration";

const tableColumns = {
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
    "created_at",
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
    "refresh_token_hash",
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
    "secret_version",
  ],
  mfa_recovery_codes: [
    "id",
    "verifier",
    "factor_id",
    "set_generation",
    "selector",
    "consumed_at",
    "slot",
    "created_at",
  ],
  anti_abuse_events: ["id", "scope", "key_hash", "state", "created_at"],
};

function expectedColumns(table) {
  return {
    SELECT: mfaProtectedWriterSelectColumns[table] ?? [],
    INSERT:
      table === "user_mfa_totp_factors"
        ? mfaFactorInsertColumns
        : table === "mfa_recovery_codes"
          ? mfaRecoveryInsertColumns
          : [],
    UPDATE:
      table === "users"
        ? [mfaProtectedWriterUserLockColumn]
        : table === "staff_auth_sessions"
          ? mfaProtectedWriterSessionUpdateColumns
          : table === "user_mfa_totp_factors"
            ? mfaFactorUpdateColumns
            : table === "mfa_recovery_codes"
              ? ["consumed_at"]
              : [],
    REFERENCES: [],
  };
}

export function mockVerifierClient(overrides = {}) {
  return {
    query: async (sql, params = []) => {
      if (sql.includes("SELECT role.rolcanlogin")) {
        return {
          rowCount: 1,
          rows: [
            {
              rolcanlogin: true,
              rolinherit: Boolean(overrides.roleInherit),
              rolsuper: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolbypassrls: false,
              has_membership: Boolean(overrides.roleMembership),
            },
          ],
        };
      }
      if (sql.includes("has_database_privilege")) {
        return {
          rowCount: 1,
          rows: [
            {
              connect: true,
              create: Boolean(overrides.databaseCreate),
              temporary: Boolean(overrides.databaseTemporary),
            },
          ],
        };
      }
      if (
        sql.includes("FROM pg_catalog.pg_namespace namespace") &&
        sql.includes("has_schema_privilege")
      ) {
        return {
          rowCount: 4,
          rows: [
            { nspname: "auth_proof_private", usage: false, create: false },
            { nspname: "mfa_activity_private", usage: false, create: false },
            {
              nspname: "public",
              usage: !overrides.publicUsageDenied,
              create: false,
            },
            {
              nspname: "s04_quota_guard",
              usage: Boolean(overrides.privateSchemaUsage),
              create: false,
            },
          ],
        };
      }
      if (sql.includes("WHERE role.rolname=$1 AND (")) {
        return { rowCount: overrides.ownedObject ? 1 : 0, rows: [] };
      }
      if (sql.includes("pg_default_acl")) {
        return {
          rowCount: 1,
          rows: [
            {
              writer_defaults: Boolean(overrides.defaults),
              migration_public_functions_closed:
                !overrides.publicFunctionDefaults,
            },
          ],
        };
      }
      if (sql.includes("has_column_privilege($1,'public.users'")) {
        return {
          rowCount: 1,
          rows: [{ allowed: Boolean(overrides.passwordHash) }],
        };
      }
      if (sql.includes("FROM unnest($3::text[]) AS privilege")) {
        return {
          rowCount: 7,
          rows: [
            "SELECT",
            "INSERT",
            "UPDATE",
            "DELETE",
            "TRUNCATE",
            "REFERENCES",
            "TRIGGER",
          ].map((privilege) => ({
            privilege,
            allowed: Boolean(overrides.tableSelect && privilege === "SELECT"),
          })),
        };
      }
      if (sql.includes("FROM information_schema.columns")) {
        const table = params[1];
        const expected = expectedColumns(table);
        const rows = tableColumns[table].flatMap((column_name) =>
          Object.keys(expected).map((privilege) => ({
            column_name,
            privilege,
            allowed:
              (expected[privilege] ?? []).includes(column_name) ||
              Boolean(
                overrides.passwordHash &&
                table === "users" &&
                column_name === "password_hash" &&
                privilege === "SELECT",
              ),
          })),
        );
        return { rowCount: rows.length, rows };
      }
      if (sql.includes("LEFT JOIN LATERAL pg_catalog.aclexplode")) {
        return {
          rowCount: overrides.publicAcl && params[0] === "users" ? 1 : 0,
          rows: [],
        };
      }
      if (sql.includes("relation.relkind IN")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("attribute.attnum>0")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("sequence.relkind='S'")) {
        return {
          rowCount: overrides.sequencePrivilege ? 1 : 0,
          rows: [],
        };
      }
      if (sql.includes("JOIN pg_catalog.pg_roles owner")) {
        const allowed = params[5];
        const signature = params[0];
        return {
          rowCount: 1,
          rows: [
            {
              prosecdef: true,
              owner: overrides.functionOwner ?? migrationRole,
              proconfig: [
                signature === mfaProtectedWriterFunctions.quotaSuccess
                  ? (overrides.functionPath ?? "search_path=pg_catalog")
                  : (overrides.functionPath ??
                    "search_path=pg_catalog, public"),
              ],
              writer: allowed.includes(writerRole),
              runtime: allowed.includes(runtimeRole),
              staff: false,
              management: false,
              public_denied: true,
              grant_option_denied: true,
              other_roles_denied: true,
            },
          ],
        };
      }
      if (sql.includes("function.prosecdef")) {
        return { rowCount: overrides.exposedDefiner ? 1 : 0, rows: [] };
      }
      if (sql.includes("function.oid NOT IN")) {
        return { rowCount: overrides.directFunction ? 1 : 0, rows: [] };
      }
      if (sql.includes("has_schema_privilege")) {
        return {
          rowCount: 1,
          rows: [{ activity: false, quota: false, proof: false, touch: false }],
        };
      }
      if (sql.includes("WHERE function.oid=pg_catalog.to_regprocedure($2)")) {
        return {
          rowCount: 1,
          rows: [{ allowed: false, public_denied: true }],
        };
      }
      throw new Error(`Unexpected verifier query: ${sql}`);
    },
  };
}
