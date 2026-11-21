import assert from "node:assert/strict";
import { test } from "node:test";

import {
  runtimeFunctions,
  verifyS04RuntimePrivileges,
} from "./s04-runtime-privileges.mjs";

function client(ownerBySignature = {}, overrides = {}) {
  return {
    async query(sql, values = []) {
      if (sql.includes("NOT has_any_column_privilege")) {
        return {
          rowCount: 1,
          rows: [
            {
              insert_denied: true,
              update_denied: true,
              delete_denied: true,
              truncate_denied: true,
              trigger_denied: true,
              private_schema_denied: true,
            },
          ],
        };
      }
      assert.match(sql, /owner\.rolname AS owner/);
      return {
        rowCount: 1,
        rows: [
          {
            allowed: true,
            definer: true,
            owner: ownerBySignature[values[1]] ?? "migration_owner",
            owner_can_login: true,
            owner_inherit: false,
            owner_superuser: false,
            owner_create_db: true,
            owner_create_role: true,
            owner_replication: false,
            owner_bypass_rls: false,
            owner_database_create: true,
            owner_public_create: true,
            safe_search_path: true,
            safe_legacy_cleanup: true,
            public_denied: true,
            ...overrides,
          },
        ],
      };
    },
  };
}

test("S04 runtime SECURITY DEFINER functions must belong to the exact migration owner", async () => {
  await verifyS04RuntimePrivileges(
    client(),
    "ordinary_runtime",
    "migration_owner",
    {
      requireTrustedOwnerAttributes: true,
    },
  );
  assert.equal(runtimeFunctions.length, 6);
  await assert.rejects(
    verifyS04RuntimePrivileges(
      client({ [runtimeFunctions[2]]: "untrusted_definer_owner" }),
      "ordinary_runtime",
      "migration_owner",
      { requireTrustedOwnerAttributes: true },
    ),
    /missing or unsafe/,
  );
  await assert.rejects(
    verifyS04RuntimePrivileges(
      client({}, { owner_superuser: true }),
      "ordinary_runtime",
      "migration_owner",
      { requireTrustedOwnerAttributes: true },
    ),
    /missing or unsafe/,
  );
});
