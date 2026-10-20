import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

// Non-DB, non-browser regression checks. Browser/HTTP authority remains GAP.
const root = resolve(import.meta.dirname, "../../../..");
const file = (name) => readFileSync(resolve(root, name), "utf8");
const audit = file("apps/dashboard/src/features/audit/audit-page.tsx");
const coordinator = file("apps/dashboard/src/features/audit/investigation-live.tsx");
const projection = file(
  "apps/dashboard/src/features/audit/investigation/timeline/investigation-live-projection.ts",
);
const api = file("apps/dashboard/src/features/audit/investigation/timeline/timeline-api.ts");
const search = file(
  "apps/api/src/modules/management/audit-investigation/search/audit-investigation-search.service.ts",
);
const selectorSupport = file("apps/dashboard/src/features/audit/investigation-live-support.ts");
const memberOptions = file("apps/dashboard/src/features/audit/investigation/search/investigation-member-options.ts");

test("T60: Investigation cannot mount native Audit Events hook in the same view", () => {
  const parent = audit.split("function AuditEventsContent()")[0];
  assert.doesNotMatch(parent, /useAuditPage\(/);
  assert.match(parent, /showInvestigation && liveScope/);
  assert.match(parent, /<InvestigationLive/);
  assert.match(audit, /function AuditEventsContent\(\)/);
  assert.match(audit, /const audit = useAuditPage\(\)/);
});

test("T56/T70: scope-generation fencing plus cancel on transitions and refresh", () => {
  assert.match(audit, /<AuditContent key=\{scopeKey\}/);
  for (const token of ["identityGeneration", "sessionGeneration", "selectionRevision"]) {
    assert.ok(coordinator.includes(token), token);
  }
  assert.match(coordinator, /workId\.current \+= 1/);
  assert.match(coordinator, /workSignal\.current\?\.abort\(\)/);
  assert.match(coordinator, /detailsSignal\.current\?\.abort\(\)/);
  assert.match(coordinator, /selectorSignal\.current\?\.abort\(\)/);
  assert.match(coordinator, /readInvestigationTimeline\([\s\S]*?signal, revoke\)/);
  assert.match(coordinator, /readInvestigationEventDetail\([\s\S]*?signal, revoke\)/);
  assert.match(api, /onAuthReconciled\?: \(\) => void/);
});

test("T56/T59: LIVE source/time/current facts are not fixture-derived", () => {
  assert.match(audit, /LIVE DATA · AUTHORIZED READ ONLY/);
  assert.doesNotMatch(audit, /DEMO DATA · UX PROTOTYPE/);
  assert.doesNotMatch(coordinator, /import.*investigation-demo-fixtures/);
  assert.match(projection, /investigationKey\(reason\.source, reason\.eventId\)/);
  assert.match(projection, /occurredAt: row\.occurredAt/);
  assert.match(projection, /recordedAt: row\.recordedAt/);
  assert.match(projection, /timeZone: timezone/);
  assert.match(projection, /incidentStatus: incident \? incident\.status \+ " · CURRENT" : null/);
});

test("T45/T62/T63: local-only U05 proof gate preserves production 503 for cursors/over-limit", () => {
  assert.match(search, /parsed\.data\.cursor !== undefined && !isU05LocalProofEnabled\(\)/);
  assert.match(search, /!isU05LocalProofEnabled\(\) \|\| !binding \|\| mutableVehicleFilter/);
  const gate = file("apps/api/src/modules/management/audit-investigation/audit-investigation-u05-gate.ts");
  assert.match(gate, /process\.env\.NODE_ENV !== "test"/);
  assert.match(gate, /ISSUE300_U05_G2_PROOF_ENABLE !== "1"/);
  assert.match(gate, /target\.pathname === "\/issue300_g2"/);
  assert.match(coordinator, /data\.nextCursor !== null\) throw new Error\("SEARCH_PAGINATION_INCOMPLETE"\)/);
  assert.match(projection, /page\.nextCursor !== null/);
  assert.match(coordinator, /attachInvestigationLiveTimeline\(withScope, timeline\)/);
});

test("P1: >200 Member directory must not prevent time-only Investigation search", () => {
  assert.match(selectorSupport, /members\.status === "complete" \? members\.options : \[\]/);
  assert.match(selectorSupport, /memberOptionsComplete: members\.status === "complete"/);
  assert.match(coordinator, /if \(draft\.employee && latestOptions\?\.memberOptionsComplete === false\)/);
  assert.doesNotMatch(selectorSupport, /if \(members\.status !== "complete"\) \{\s*throw/);
  assert.match(memberOptions, /options: \[\],\s*reason: "limit-exceeded"/);
});

test("P1: stale point details are aborted and generation-fenced on selection/scope change", () => {
  const invalidate = coordinator.split("const invalidate = useCallback")[1]
    ?.split("const revoke = useCallback")[0];
  assert.match(invalidate, /workId\.current \+= 1/);
  assert.match(invalidate, /detailsSignal\.current\?\.abort\(\)/);
  assert.match(coordinator, /const readGeneration = workId\.current/);
  assert.match(coordinator, /controller\.signal\.aborted \|\| readGeneration !== workId\.current/);
});
