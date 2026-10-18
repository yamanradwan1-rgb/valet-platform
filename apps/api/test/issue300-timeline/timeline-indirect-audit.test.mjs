import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/management/audit-investigation/timeline",
);
const input = fs.readFileSync(
  path.join(root, "timeline-indirect-audit.ts"),
  "utf8",
);
const compiled = ts.transpileModule(input, {
  fileName: "timeline-indirect-audit.ts",
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
});
class SourceDenied extends Error {}
const context = {
  exports: {},
  require(name) {
    if (name !== "../../management-authorization") throw new Error(name);
    return { ManagementAccessDeniedError: SourceDenied };
  },
  Error,
};
vm.runInNewContext(compiled.outputText, context);
const { indirectAuditContainmentSql, requireIndirectAuditSessionContainment } =
  context.exports;
const uuid = (last) =>
  "aaaaaaaa-aaaa-4aaa-8aaa-" + String(last).padStart(12, "0");
const scope = {
  organizationId: uuid(1),
  locationId: uuid(2),
  membershipId: uuid(3),
  role: "LOCATION_MANAGER",
};

test("indirect authority requires the Audit row's own Session entity and excludes unproven parent-only linkage", () => {
  const sql = indirectAuditContainmentSql;
  assert.match(sql, /audit\.valet_session_id IS NULL/);
  assert.match(sql, /session\.organization_id = \$1::uuid/);
  assert.match(sql, /session\.location_id = \$2::uuid/);
  assert.match(sql, /session\.id = \$3::uuid/);
  assert.match(sql, /audit\.id = \$4::uuid/);
  assert.match(sql, /audit\.entity_type IN \('ValetSession', 'VALET_SESSION'\)/);
  assert.match(sql, /audit\.entity_id = session\.id/);
  assert.doesNotMatch(sql, /OR \(audit\.entity_type IN \('Task', 'TASK'\)/);
  assert.doesNotMatch(sql, /OR \(audit\.entity_type IN \('Incident', 'INCIDENT'\)/);
  assert.match(sql, /parked_task\.valet_session_id = session\.id/);
  assert.doesNotMatch(sql, /audit\.entity_type = 'Vehicle'/);
  assert.doesNotMatch(
    sql,
    /incident\.description|dispatch\.reason|resolution_notes/i,
  );
  assert.match(sql, /FOR SHARE OF session\s*$/);
});

test("indirect scope denies missing proof and binds four UUID parameters exactly", async () => {
  const log = [];
  const tx = {
    async query(sql, params) {
      log.push({ sql, params });
      return { rowCount: 0, rows: [] };
    },
  };
  await assert.rejects(
    requireIndirectAuditSessionContainment(tx, scope, uuid(4), uuid(5)),
    SourceDenied,
  );
  assert.equal(log.length, 1);
  assert.deepEqual(Array.from(log[0].params), [
    scope.organizationId,
    scope.locationId,
    uuid(4),
    uuid(5),
  ]);
  const proven = {
    async query(sql, params) {
      assert.equal(sql, indirectAuditContainmentSql);
      assert.equal(params[2], uuid(4));
      return { rowCount: 1, rows: [{ "?column?": 1 }] };
    },
  };
  await requireIndirectAuditSessionContainment(proven, scope, uuid(4), uuid(5));
});
