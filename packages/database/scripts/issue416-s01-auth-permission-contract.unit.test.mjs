import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { test } from "node:test";

import {
  mfaFactorInsertColumns,
  mfaFactorUpdateColumns,
  mfaRecoveryInsertColumns,
  mfaRefreshUpdateColumns,
  mfaSessionInsertColumns,
  mfaSessionUpdateColumns,
  provisionMfaPrivileges,
} from "./mfa-runtime-privileges.mjs";
import { verifyMfaPrivileges } from "./mfa-runtime-privilege-verification.mjs";
import { assertLegacyRuntimeProvisioningAllowed } from "./vap1-security-privileges.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sessionColumns = [
  "id",
  "user_id",
  "current_access_token_hash",
  "access_expires_at",
  "absolute_expires_at",
  "created_at",
  "last_rotated_at",
  "revoked_at",
  "mfa_authenticated_at",
  "mfa_factor_id",
  "last_admin_activity_at",
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

function permissionClient({
  publicDenied = {},
  columnOverrides = {},
  tableOverrides = {},
} = {}) {
  return {
    async query(sql, params = []) {
      if (sql.includes("has_table_privilege")) {
        const table = String(params[1]).replace(/^public\./, "");
        const expected = {
          staff_auth_sessions: { can_select: true, can_insert: false },
          staff_refresh_credentials: { can_select: true, can_insert: true },
          user_mfa_totp_factors: { can_select: true, can_insert: false },
          mfa_recovery_codes: { can_select: true, can_insert: false },
        }[table];
        if (!expected) throw new Error(`Unexpected table ACL target: ${table}`);
        return {
          rows: [
            {
              ...expected,
              can_update: false,
              can_delete: false,
              can_truncate: false,
              can_reference: false,
              can_trigger: false,
              ...tableOverrides[table],
            },
          ],
        };
      }
      if (sql.includes("AS denied")) {
        const table = String(params[0]);
        return { rows: [{ denied: publicDenied[table] !== false }] };
      }
      if (sql.includes("has_column_privilege")) {
        const table = params[1];
        const privilege = params[2];
        const all = {
          staff_auth_sessions: sessionColumns,
          staff_refresh_credentials: refreshColumns,
          user_mfa_totp_factors: factorColumns,
          mfa_recovery_codes: recoveryColumns,
        }[table];
        if (!all) throw new Error(`Unexpected column ACL target: ${table}`);
        const allowed =
          {
            "staff_auth_sessions:INSERT": mfaSessionInsertColumns,
            "staff_auth_sessions:UPDATE": mfaSessionUpdateColumns,
            "staff_refresh_credentials:UPDATE": mfaRefreshUpdateColumns,
            "user_mfa_totp_factors:INSERT": mfaFactorInsertColumns,
            "user_mfa_totp_factors:UPDATE": mfaFactorUpdateColumns,
            "mfa_recovery_codes:INSERT": mfaRecoveryInsertColumns,
            "mfa_recovery_codes:UPDATE": ["consumed_at"],
          }[`${table}:${privilege}`] ?? [];
        return {
          rows: all.map((column_name) => ({
            column_name,
            allowed:
              columnOverrides[`${table}:${privilege}:${column_name}`] ??
              allowed.includes(column_name),
          })),
        };
      }
      if (sql.includes("has_function_privilege")) {
        return { rows: [{ runtime_allowed: false, public_denied: true }] };
      }
      throw new Error(`Unexpected permission verification SQL: ${sql}`);
    },
  };
}

test("PUBLIC session and refresh table access is revoked without changing runtime grants", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push({ kind: "query", sql });
    },
  };
  const executeFormatted = async (_client, format, values) => {
    statements.push({ kind: "formatted", format, values });
  };
  await provisionMfaPrivileges(client, executeFormatted, "vaylet_runtime");
  const publicRevokeIndex = statements.findIndex(({ sql }) =>
    /REVOKE ALL ON TABLE staff_auth_sessions,\s*staff_refresh_credentials\s+FROM PUBLIC/.test(
      sql ?? "",
    ),
  );
  const refreshRuntimeGrantIndex = statements.findIndex(
    ({ format }) =>
      format ===
      "GRANT SELECT, INSERT ON TABLE staff_refresh_credentials TO %I",
  );
  assert.ok(publicRevokeIndex >= 0);
  assert.ok(refreshRuntimeGrantIndex > publicRevokeIndex);
  assert.ok(
    statements.some(({ sql }) =>
      /REVOKE ALL ON TABLE staff_auth_sessions,\s*staff_refresh_credentials\s+FROM PUBLIC/.test(
        sql ?? "",
      ),
    ),
  );
  assert.ok(
    statements.some(
      ({ format }) =>
        format === "GRANT SELECT ON TABLE staff_auth_sessions TO %I",
    ),
  );
  assert.ok(
    statements.some(
      ({ format }) =>
        format ===
        "GRANT SELECT, INSERT ON TABLE staff_refresh_credentials TO %I",
    ),
  );
  assert.ok(
    statements.some(
      ({ format }) =>
        format ===
        "GRANT UPDATE (consumed_at, replaced_by_credential_id) ON TABLE staff_refresh_credentials TO %I",
    ),
  );
  assert.deepEqual(mfaSessionInsertColumns, [
    "id",
    "user_id",
    "current_access_token_hash",
    "access_expires_at",
    "absolute_expires_at",
    "created_at",
    "last_rotated_at",
  ]);
});

test("effective permission verifier rejects PUBLIC session/refresh access and privilege drift", async () => {
  await assert.doesNotReject(
    verifyMfaPrivileges(permissionClient(), "vaylet_runtime"),
  );
  for (const table of ["staff_auth_sessions", "staff_refresh_credentials"]) {
    await assert.rejects(
      verifyMfaPrivileges(
        permissionClient({ publicDenied: { [table]: false } }),
        "vaylet_runtime",
      ),
      new RegExp(`PUBLIC ${table} privileges are unsafe`),
    );
  }
  await assert.rejects(
    verifyMfaPrivileges(
      permissionClient({
        columnOverrides: { "staff_auth_sessions:INSERT:revoked_at": true },
      }),
      "vaylet_runtime",
    ),
    /staff_auth_sessions INSERT column privileges are unsafe/,
  );
  await assert.rejects(
    verifyMfaPrivileges(
      permissionClient({
        tableOverrides: { staff_auth_sessions: { can_insert: true } },
      }),
      "vaylet_runtime",
    ),
    /staff_auth_sessions table privileges are unsafe/,
  );
});

test("legacy provisioner stays fenced and does not invoke broad VAP1 retirement", async () => {
  const compatibleClient = {
    async query(sql) {
      if (sql.includes("pg_catalog.pg_namespace"))
        return { rowCount: 1, rows: [{}] };
      if (sql.includes("security_boundary WHERE singleton FOR SHARE")) {
        return { rowCount: 1, rows: [{ phase: "LEGACY_COMPAT" }] };
      }
      throw new Error("Unexpected compatible legacy guard query.");
    },
  };
  await assert.doesNotReject(
    assertLegacyRuntimeProvisioningAllowed(compatibleClient),
  );
  for (const phase of ["DRAINED", "PROTECTED"]) {
    const client = {
      async query(sql) {
        if (sql.includes("pg_catalog.pg_namespace"))
          return { rowCount: 1, rows: [{}] };
        if (sql.includes("security_boundary WHERE singleton FOR SHARE")) {
          return { rowCount: 1, rows: [{ phase }] };
        }
        throw new Error("Unexpected legacy provisioner guard query.");
      },
    };
    await assert.rejects(
      assertLegacyRuntimeProvisioningAllowed(client),
      /VAP1/,
    );
  }
  const source = read("./provision-runtime-role.mjs");
  assert.ok(
    source.indexOf("await assertLegacyRuntimeProvisioningAllowed(client)") <
      source.indexOf("await provisionMfaPrivileges(client"),
  );
  assert.match(source, /assertLegacyRuntimeProvisioningAllowed/);
  assert.doesNotMatch(source, /retireLegacyVap1Grants/);
  assert.match(
    read("./mfa-runtime-privilege-verification.mjs"),
    /pg_default_acl[\s\S]*defaclnamespace[\s\S]*has_schema_privilege/,
  );
});
