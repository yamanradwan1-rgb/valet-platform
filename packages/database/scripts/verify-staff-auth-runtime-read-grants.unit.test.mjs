import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimeStaffSessionReadColumns } from "./staff-auth-writer-grants.mjs";
import { verifyStaffAuthRuntimeReadGrants } from "./verify-staff-auth-runtime-read-grants.mjs";

function mockRuntimeReadGrants(options = {}) {
  return {
    async query(sql, values) {
      const table = String(values?.[1] ?? values?.[0]).replace(/^public\./, "");
      if (sql.includes("has_table_privilege")) {
        return { rows: [{ allowed: options.tableSelect === table }] };
      }
      if (sql.includes("pg_catalog.pg_attribute")) {
        return {
          rows: [
            ...runtimeStaffSessionReadColumns[table],
            ...(table === "staff_auth_sessions"
              ? ["current_access_token_hash"]
              : ["token_hash"]),
          ].map((column_name) => ({ column_name })),
        };
      }
      if (sql.includes("has_column_privilege")) {
        const column = values[2];
        const normal = runtimeStaffSessionReadColumns[table].includes(column);
        return {
          rows: [{ allowed: options.exposedHash === column ? true : normal }],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

test("Runtime session grants omit both bearer hashes and any table SELECT", async () => {
  await verifyStaffAuthRuntimeReadGrants(
    mockRuntimeReadGrants(),
    "runtime_role",
  );
  for (const tableSelect of Object.keys(runtimeStaffSessionReadColumns)) {
    await assert.rejects(
      verifyStaffAuthRuntimeReadGrants(
        mockRuntimeReadGrants({ tableSelect }),
        "runtime_role",
      ),
      /table-level SELECT/,
    );
  }
  for (const exposedHash of ["current_access_token_hash", "token_hash"]) {
    await assert.rejects(
      verifyStaffAuthRuntimeReadGrants(
        mockRuntimeReadGrants({ exposedHash }),
        "runtime_role",
      ),
      /SELECT contract violated/,
    );
  }
});
