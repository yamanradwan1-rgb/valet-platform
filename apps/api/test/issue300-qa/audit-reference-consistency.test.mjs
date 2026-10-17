import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

// Static acceptance tests only. Never contact a PostgreSQL instance.
const root = resolve(import.meta.dirname, "../../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const witness = read(
  "apps/api/src/modules/management/audit-investigation/search/search-witness-sql.ts",
);
const timeline = read(
  "apps/api/src/modules/management/audit-investigation/timeline/timeline-source-query.ts",
);
const sourceBoundary = read(
  "apps/api/src/modules/management/audit-investigation/security/audit-investigation-source-boundary.ts",
);
const auditArm = witness.split("UNION ALL")[0];

test("T15: a direct Session pointer must not excuse missing/wrong Task entity", () => {
  assert.match(timeline, /audit\.entity_type IN \('Task', 'TASK'\) AND linked_task\.id IS NOT NULL/);
  assert.match(auditArm, /a\.valet_session_id IS NULL OR a\.valet_session_id = resolved\.id/);
  const unsafe = auditArm.match(/task_ref\.id IS NULL OR task_ref\.valet_session_id = resolved\.id/)?.[0];
  assert.equal(
    unsafe, undefined,
    "FAIL: a same-scope direct Audit with entity_type=Task and missing/foreign Task qualifies search but not timeline",
  );
  assert.match(
    auditArm,
    /a\.entity_type NOT IN \('Task', 'TASK'\)[\s\S]*?task_ref\.id IS NOT NULL/,
    "Require canonical positive Task existence/Session containment, not a nullable LEFT JOIN",
  );
});

test("T15/T21: a direct Session pointer must not excuse missing/wrong Incident entity", () => {
  assert.match(timeline, /audit\.entity_type IN \('Incident', 'INCIDENT'\) AND linked_incident\.id IS NOT NULL/);
  const unsafe = auditArm.match(/incident_ref\.id IS NULL OR incident_ref\.valet_session_id = resolved\.id/)?.[0];
  assert.equal(
    unsafe, undefined,
    "FAIL: missing/foreign Incident reference is counted by Search but omitted by Timeline",
  );
  assert.match(
    auditArm,
    /a\.entity_type NOT IN \('Incident', 'INCIDENT'\)[\s\S]*?incident_ref\.id IS NOT NULL/,
    "Require canonical positive Incident existence/Session containment",
  );
});

test("T25: conflicting vehicle Audit reference does not qualify a witness", () => {
  assert.match(auditArm, /a\.entity_type NOT IN \('Vehicle', 'VEHICLE'\)/);
  assert.match(auditArm, /a\.entity_id = resolved\.vehicle_id/);
});

test("T48/T53: direct point source bounds exact Location and Session before detail", () => {
  assert.match(sourceBoundary, /evidence\.organization_id = session\.organization_id/);
  assert.match(sourceBoundary, /evidence\.location_id = session\.location_id/);
  assert.match(sourceBoundary, /evidence\.valet_session_id = session\.id/);
  assert.match(sourceBoundary, /evidence\.id = \$4/);
});

test("T52: Incident point source cannot bypass inactive-Location boundary", () => {
  assert.match(sourceBoundary, /reference\.source === "INCIDENT"/);
  assert.match(sourceBoundary, /location\.status = 'ACTIVE'/);
  assert.match(timeline, /incident_location\.status = 'ACTIVE'/);
});

test("T39/T67: four-source tuple order and bounded fail-closed first page", () => {
  assert.match(timeline, /ORDER BY occurred_at ASC, rank ASC, id ASC/);
  assert.match(timeline, /LIMIT \$4::integer/);
  const service = read(
    "apps/api/src/modules/management/audit-investigation/timeline/timeline-read-service.ts",
  );
  assert.match(service, /rows\.length > query\.limit\) throw new TimelinePaginationNotProvenError/);
  assert.match(service, /if \(query\.cursor\) throw new TimelinePaginationNotProvenError/);
});
