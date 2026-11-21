import assert from "node:assert/strict";
import { test } from "node:test";
import {
  staffAuthWriterDefinerFunctions,
  verifyStaffAuthWriterFunctionOwners,
} from "./verify-staff-auth-writer-function-owners.mjs";

test("Staff Auth protected functions must all have the exact trusted migration owner", async () => {
  const client = {
    async query(_sql, values) {
      assert.deepEqual(values, staffAuthWriterDefinerFunctions);
      return {
        rowCount: 3,
        rows: staffAuthWriterDefinerFunctions.map((signature, index) => ({
          signature,
          owner: "migration_owner",
          prosecdef: true,
          proconfig: [
            index === 0
              ? "search_path=pg_catalog, public"
              : "search_path=pg_catalog",
          ],
        })),
      };
    },
  };
  await verifyStaffAuthWriterFunctionOwners(client, "migration_owner");
  await assert.rejects(
    verifyStaffAuthWriterFunctionOwners(
      {
        query: async (_sql, values) => ({
          rowCount: 3,
          rows: values.map((signature, index) => ({
            signature,
            owner: index === 1 ? "untrusted_owner" : "migration_owner",
            prosecdef: true,
            proconfig: [
              index === 0
                ? "search_path=pg_catalog, public"
                : "search_path=pg_catalog",
            ],
          })),
        }),
      },
      "migration_owner",
    ),
    /trusted migration role/,
  );
});

test("Staff Auth protected functions reject non-SECDEF and unsafe search_path", async () => {
  for (const override of [
    { prosecdef: false },
    { proconfig: ["search_path=public"] },
    { proconfig: ["search_path=pg_catalog", "work_mem=8MB"] },
  ]) {
    await assert.rejects(
      verifyStaffAuthWriterFunctionOwners(
        {
          query: async () => ({
            rowCount: 3,
            rows: staffAuthWriterDefinerFunctions.map((signature, index) => ({
              signature,
              owner: "migration_owner",
              prosecdef: true,
              proconfig: [
                index === 0
                  ? "search_path=pg_catalog, public"
                  : "search_path=pg_catalog",
              ],
              ...(index === 1 ? override : {}),
            })),
          }),
        },
        "migration_owner",
      ),
      /trusted migration role/,
    );
  }
});
