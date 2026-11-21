import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { ids, loadCatalog } from "./catalog.mjs";
import { inspectLegacySignatures } from "./legacy-signatures.mjs";
import {
  familyPublicRelations,
  observeFamilyPublicSqlAuthority,
} from "./sql-family-authority.mjs";

const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const catalog = loadCatalog(repo);
const legacy = inspectLegacySignatures(repo);

test("all 35 current families have a grounded public object footprint, not a closure declaration", () => {
  assert.deepEqual(Object.keys(familyPublicRelations).sort(), [...ids].sort());
  for (const [id, tables] of Object.entries(familyPublicRelations)) {
    assert.match(id, /^[AMPRX]\d{2}$/);
    assert.ok(tables.length >= 1);
    assert.equal(new Set(tables).size, tables.length);
    assert.ok(tables.every((name) => /^[a-z][a-z0-9_]*$/.test(name)));
  }
});

test("SQL authority observer binds actual DB boolean privileges to all 35 without issuing proof", async () => {
  const observed = [];
  const client = {
    async query(sql, values) {
      assert.ok(sql.startsWith("SELECT "));
      assert.equal(values[0], "synthetic_role");
      assert.ok(values[1].startsWith("public."));
      observed.push(values[1]);
      const granted = values[1] === "public.anti_abuse_events";
      return {
        rowCount: 1,
        rows: [
          {
            present: true,
            read: true,
            ins: granted,
            upd: granted,
            del: false,
          },
        ],
      };
    },
  };
  const report = await observeFamilyPublicSqlAuthority(
    client,
    "synthetic_role",
    catalog,
    legacy,
  );
  assert.equal(report.observedFamilies, 35);
  assert.equal(report.neitherPurposeBoundNorClosed, true);
  assert.equal(report.sourceFootprintOnly, true);
  assert.deepEqual(
    report.rows.map(({ family }) => family),
    ids,
  );
  assert.ok(report.rows.every((row) => row.sourceFootprintNotCompleteProof));
  assert.equal(
    report.rows.find((row) => row.family === "M08")
      .inventoriedLegacyFunctionSignatures,
    7,
  );
  assert.equal(
    report.rows.find((row) => row.family === "M09")
      .inventoriedLegacyFunctionSignatures,
    12,
  );
  assert.equal(
    report.rows.find((row) => row.family === "X01")
      .inventoriedLegacyFunctionSignatures,
    1,
  );
  assert.equal(
    report.rows.find((row) => row.family === "R01")
      .inventoriedLegacyFunctionSignatures,
    0,
  );
  assert.equal(new Set(observed).size, observed.length);
  assert.equal(
    report.rows
      .find((row) => row.family === "R03")
      .sharedPublicRelationAuthority.find(
        (r) => r.relation === "anti_abuse_events",
      ).upd,
    true,
  );
});

test("missing/duplicate family inventory or SQL evidence cannot be certified", async () => {
  const broken = {
    ...catalog,
    rows: catalog.rows.filter((row) => row.id !== "X01"),
  };
  await assert.rejects(
    observeFamilyPublicSqlAuthority(
      { query: async () => ({}) },
      "synthetic_role",
      broken,
      legacy,
    ),
    /INCOMPLETE/,
  );
  await assert.rejects(
    observeFamilyPublicSqlAuthority(
      {
        query: async () => ({ rowCount: 0, rows: [] }),
      },
      "synthetic_role",
      catalog,
      legacy,
    ),
    /SQL_ACL_UNKNOWN/,
  );
});
