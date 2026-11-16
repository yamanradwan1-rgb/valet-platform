import assert from "node:assert/strict";
import { test } from "node:test";

import { assertOptionCFunctionReady } from "./option-c-protected-function-readiness.mjs";

const signature =
  "public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)";

function client(
  owner,
  overrides = {},
  role = "vaylet_staff_auth_writer",
  membershipRows = 0,
) {
  return {
    async query(sql, values) {
      if (sql.includes("pg_catalog.pg_auth_members")) {
        return { rowCount: membershipRows, rows: membershipRows ? [{}] : [] };
      }
      assert.match(sql, /owner\.rolname AS owner/);
      assert.deepEqual(values, [signature, role]);
      return {
        rowCount: 1,
        rows: [
          {
            prosecdef: true,
            owner,
            owner_can_login: true,
            owner_inherit: false,
            owner_superuser: false,
            owner_create_db: false,
            owner_create_role: false,
            owner_replication: false,
            owner_bypass_rls: false,
            owner_database_create: false,
            owner_public_create: false,
            proconfig: ["search_path=pg_catalog"],
            allowed: true,
            public_denied: true,
            grant_option_denied: true,
            ...overrides,
          },
        ],
      };
    },
  };
}

test("Option C function readiness requires the exact trusted migration owner", async () => {
  await assertOptionCFunctionReady(
    client("migration_owner"),
    signature,
    "vaylet_staff_auth_writer",
    "search_path=pg_catalog",
    "migration_owner",
  );
  await assert.rejects(
    assertOptionCFunctionReady(
      client("untrusted_owner"),
      signature,
      "vaylet_staff_auth_writer",
      "search_path=pg_catalog",
      "migration_owner",
    ),
    /not ready/,
  );
  await assert.rejects(
    assertOptionCFunctionReady(
      client("migration_owner", { owner_create_role: true }),
      signature,
      "vaylet_staff_auth_writer",
      "search_path=pg_catalog",
      "migration_owner",
    ),
    /not ready/,
  );
});

test("the owner contract supports a designated NOLOGIN SECURITY DEFINER owner", async () => {
  const attributes = {
    owner_can_login: false,
    owner_inherit: false,
    owner_superuser: false,
    owner_create_db: false,
    owner_create_role: false,
    owner_replication: false,
    owner_bypass_rls: false,
  };
  await assertOptionCFunctionReady(
    client(
      "vaylet_session_lock_owner",
      {
        ...attributes,
        owner_database_create: false,
        owner_public_create: false,
      },
      "vaylet_runtime",
    ),
    signature,
    "vaylet_runtime",
    "search_path=pg_catalog",
    "vaylet_session_lock_owner",
    attributes,
  );
  await assert.rejects(
    assertOptionCFunctionReady(
      client(
        "vaylet_session_lock_owner",
        {
          ...attributes,
          owner_can_login: true,
          owner_database_create: false,
          owner_public_create: false,
        },
        "vaylet_runtime",
      ),
      signature,
      "vaylet_runtime",
      "search_path=pg_catalog",
      "vaylet_session_lock_owner",
      attributes,
    ),
    /not ready/,
  );
  await assert.rejects(
    assertOptionCFunctionReady(
      client(
        "vaylet_session_lock_owner",
        {
          ...attributes,
          owner_database_create: false,
          owner_public_create: false,
        },
        "vaylet_runtime",
        1,
      ),
      signature,
      "vaylet_runtime",
      "search_path=pg_catalog",
      "vaylet_session_lock_owner",
      attributes,
    ),
    /role memberships/,
  );
});
