import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyManagementWriterForbiddenColumnPrivileges } from "./management-writer-forbidden-column-privileges.mjs";

test("verifier rejects direct session verifier reads and activity writes", async () => {
  const observed = [];
  let sessionReadQuery = "";
  await verifyManagementWriterForbiddenColumnPrivileges(
    {
      async query(sql, values) {
        if (sql.includes("pg_catalog.pg_attribute")) {
          sessionReadQuery = sql;
          return { rowCount: 0, rows: [] };
        }
        observed.push(values);
        return { rows: [{ allowed: false }] };
      },
    },
    "vaylet_management_writer",
  );
  assert.deepEqual(
    observed.slice(0, 3).map((values) => values.slice(1)),
    [
      ["public.staff_auth_sessions", "current_access_token_hash", "SELECT"],
      ["public.staff_auth_sessions", "last_admin_activity_at", "SELECT"],
      ["public.staff_auth_sessions", "last_admin_activity_at", "UPDATE"],
    ],
  );
  assert.match(sessionReadQuery, /relation\.relname='staff_auth_sessions'/);
  assert.match(sessionReadQuery, /has_column_privilege/);
  assert.deepEqual(
    observed
      .filter((values) => values[2] === "updated_at")
      .map((values) => values.slice(1)),
    [
      ["public.organization_memberships", "updated_at", "UPDATE"],
      ["public.locations", "updated_at", "UPDATE"],
      ["public.users", "updated_at", "UPDATE"],
    ],
  );
  await assert.rejects(
    verifyManagementWriterForbiddenColumnPrivileges(
      {
        async query(_sql, values) {
          return {
            rows: [
              {
                allowed:
                  values[2] === "last_admin_activity_at" &&
                  values[3] === "UPDATE",
              },
            ],
          };
        },
      },
      "vaylet_management_writer",
    ),
    /forbidden protected column/,
  );
});
