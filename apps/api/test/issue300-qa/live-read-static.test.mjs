import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

// Non-DB, non-browser regression checks. Browser/HTTP authority remains GAP.
const root = resolve(import.meta.dirname, "../../../..");
const file = (name) => readFileSync(resolve(root, name), "utf8");
const audit = file("apps/dashboard/src/features/audit/audit-page.tsx");
const coordinator = file("apps/dashboard/src/features/audit/investigation-live.tsx");
const liveController = file("apps/dashboard/src/features/audit/investigation/live/investigation-live-controller.ts");
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
  assert.match(liveController, /epoch\.current \+= 1/);
  assert.match(liveController, /searchAbort\.current\?\.abort\(\)/);
  assert.match(liveController, /detailAbort\.current\?\.abort\(\)/);
  assert.match(liveController, /timelineAbort\.current\?\.abort\(\)/);
  assert.match(liveController, /readInvestigationTimeline\([\s\S]*?controller\.signal, revoke\)/);
  assert.match(liveController, /readInvestigationEventDetail\([\s\S]*?controller\.signal, revoke\)/);
  assert.match(api, /onAuthReconciled\?: \(\) => void/);
});

test("T56/T59: LIVE source/time/current facts are not fixture-derived", () => {
  assert.match(audit, /LIVE DATA · AUTHORIZED READ ONLY/);
  assert.doesNotMatch(audit, /DEMO DATA · UX PROTOTYPE/);
  assert.doesNotMatch(liveController, /import.*investigation-demo-fixtures/);
  assert.match(projection, /investigationKey\(reason\.source, reason\.eventId\)/);
  assert.match(projection, /occurredAt: row\.occurredAt/);
  assert.match(projection, /recordedAt: row\.recordedAt/);
  assert.match(projection, /timeZone: timezone/);
  assert.match(projection, /incidentStatus: incident \? incident\.status \+ " · CURRENT" : null/);
});

test("T45/T62/T63: normal signed pagination retains specific unsafe-cohort veto", () => {
  assert.doesNotMatch(search, /parsed\.data\.cursor !== undefined && !isU05LocalProofEnabled\(\)/);
  assert.match(search, /hasMore && \(!binding \|\| mutableVehicleFilter\)/);
  assert.match(search, /await requireU05StableIndirectCohort\(tx, scope, snapshot/);
  const gate = file("apps/api/src/modules/management/audit-investigation/audit-investigation-u05-gate.ts");
  assert.match(gate, /process\.env\.NODE_ENV !== "test"/);
  assert.match(gate, /ISSUE300_U05_G2_PROOF_ENABLE !== "1"/);
  assert.match(gate, /target\.pathname === "\/issue300_g2"/);
  assert.match(liveController, /nextInvestigationPageState\(initialInvestigationPage, response, rows\.length\)/);
  assert.match(projection, /if \(page\.nextCursor && \(!page\.events\.length/);
  assert.match(projection, /timelineNextCursor: page\.nextCursor/);
  assert.match(liveController, /attachInvestigationLiveTimeline\(/);
});

test("P1: >200 Member directory must not prevent time-only Investigation search", () => {
  assert.match(selectorSupport, /members\.status === "complete" \? members\.options : \[\]/);
  assert.match(selectorSupport, /memberOptionsComplete: members\.status === "complete"/);
  assert.match(liveController, /if \(draft\.employee && !selectors\.memberOptions\.some\(/);
  assert.doesNotMatch(selectorSupport, /if \(members\.status !== "complete"\) \{\s*throw/);
  assert.match(memberOptions, /options: \[\],\s*reason: "limit-exceeded"/);
});

test("P1: stale point details are aborted and generation-fenced on selection/scope change", () => {
  const invalidate = liveController.split("const abortReads = useCallback")[1]
    ?.split("const updateMatches = useCallback")[0];
  assert.match(invalidate, /epoch\.current \+= 1/);
  assert.match(invalidate, /detailAbort\.current\?\.abort\(\)/);
  assert.match(liveController, /const generation = abortReads\(\)/);
  assert.match(liveController, /controller\.signal\.aborted \|\| generation !== epoch\.current/);
});
