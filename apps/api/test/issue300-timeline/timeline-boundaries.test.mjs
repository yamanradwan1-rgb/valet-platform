import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const folder = path.resolve(
  __dirname,
  "../../src/modules/management/audit-investigation/timeline",
);
const uid = (n) => "aaaaaaaa-aaaa-4aaa-8aaa-" + String(n).padStart(12, "0");
const scope = {
  organizationId: uid(1),
  locationId: uid(2),
  membershipId: uid(3),
  role: "LOCATION_MANAGER",
};
const context = { userId: uid(4), staffAuthSessionId: uid(5) };
const sessionId = uid(6);
const logged = [];
let sourceRows = [];
let authorized = true;
let failSources = false;
let directDenied = false;
let indirectAuthorized = true;
class SourceDenied extends Error {}
const fakeSession = { sessionId, currentState: "PARKED" };
const source = (n, src = "AUDIT", when = "2026-10-23T14:30:00.000Z") => ({
  id: uid(n),
  source: src,
  occurredAt: new Date(when),
  recordedAt: new Date(when),
  kind: "VALET_SESSION_PARKED",
});
const querySchemas = {
  auditInvestigationTimelineQuerySchema: { parse: (v) => v },
  auditInvestigationTimelineResponseSchema: { parse: (v) => v },
  auditInvestigationDetailParamsSchema: { parse: (v) => v },
  auditInvestigationEventDetailSchema: { parse: (v) => v },
};
function load(file, dependencies) {
  const input = fs.readFileSync(path.join(folder, file), "utf8");
  const compiled = ts.transpileModule(input, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  const context = {
    exports: {},
    require(specifier) {
      if (!(specifier in dependencies)) {
        throw new Error("Unmocked: " + specifier);
      }
      return dependencies[specifier];
    },
    Date,
    Error,
    Set,
  };
  vm.runInNewContext(compiled.outputText, context, { filename: file });
  return context.exports;
}

const readService = load("timeline-read-service.ts", {
  "@valet/contracts": querySchemas,
  "@nestjs/common": {
    ServiceUnavailableException: class extends Error {
      constructor(response) {
        super(response.message);
        this.response = response;
        this.status = 503;
      }
    },
  },
  "../../../auth/mfa/mfa-assurance-policy": {
    recordAdminActivityInTransaction: async () => {
      logged.push("activity");
    },
  },
  "../../management-pagination-snapshot": {
    captureManagementPaginationSnapshot: async () => {
      logged.push("snapshot");
      return { now: new Date("2026-10-23T15:00:00.000Z"), snapshot: "100:101:" };
    },
  },
  "../audit-investigation-cursor": {
    bindInvestigationCursor: () => ({ purpose: "SESSION_TIMELINE" }),
    decodeInvestigationCursor: () => null,
    encodeInvestigationCursor: () => "opaque",
  },
  "../audit-investigation-u05-gate": { isU05LocalProofEnabled: () => false },
  "../audit-investigation-u05-indirect-guard": { requireU05StableIndirectCohort: async () => {} },
  "../audit-investigation-u05-policy": { readU05IncidentPolicy: async () => "ACTIVE" },
  "../../management-authorization": {
    ManagementAccessDeniedError: SourceDenied,
  },
  "../security/audit-investigation-authorization": {
    authorizeAuditInvestigationLocation: async () => {
      logged.push("authorize");
      if (!authorized) throw new Error("DENIED");
      return scope;
    },
  },
  "../security/audit-investigation-source-boundary": {
    requireAuditInvestigationDetailSource: async () => {
      logged.push("source-boundary");
      if (directDenied) throw new SourceDenied();
    },
  },
  "./timeline-indirect-audit": {
    hasAnchoredTimelineAuditAnomaly: async () => (logged.push("audit-anomaly"), false),
    requireIndirectAuditSessionContainment: async () => {
      logged.push("indirect-guard");
      if (!indirectAuthorized) throw new SourceDenied();
    },
  },
  "./timeline-safe-projection": {
    projectTimelineRow: (row) => ({ source: row.source, id: row.id }),
    projectTimelineDetail: (row) => ({ source: row.source, id: row.id }),
  },
  "./timeline-session-query": {
    readTimelineSession: async () => {
      logged.push("session");
      return fakeSession;
    },
  },
  "./timeline-source-query": {
    readTimelineSources: async () => {
      logged.push("four-source-sql");
      if (failSources) throw new Error("source outage");
      return sourceRows;
    },
  },
});

const tx = {
  async query(sql) {
    if (/SELECT status FROM locations/.test(sql)) {
      logged.push("location");
      return { rows: [{ status: incidentLocationStatus }] };
    }
    assert.match(sql, /clock_timestamp/);
    logged.push("clock");
    return { rows: [{ now: new Date("2026-10-23T15:00:00.000Z") }] };
  },
};
let incidentLocationStatus = "ACTIVE";
const timeline = (query) =>
  readService.readAuditInvestigationTimeline(tx, scope, sessionId, query);
const authorizedTimeline = (query) =>
  readService.readAuthorizedAuditInvestigationTimeline(
    tx,
    context,
    scope.organizationId,
    scope.locationId,
    sessionId,
    query,
  );
const detail = (sourceName, eventId) =>
  readService.readAuditInvestigationEventDetail(
    tx,
    scope,
    sessionId,
    sourceName,
    eventId,
  );

function reset() {
  logged.length = 0;
  incidentLocationStatus = "ACTIVE";
  sourceRows = [];
  authorized = true;
  failSources = false;
  directDenied = false;
  indirectAuthorized = true;
}

test("reauthorization precedes session and all source SQL", async () => {
  reset();
  authorized = false;
  await assert.rejects(authorizedTimeline({ limit: 50 }), /DENIED/);
  assert.deepEqual(logged, ["authorize"]);
});

test("bounded multi-source one-page never claims cross-request snapshot", async () => {
  reset();
  sourceRows = [
    source(10, "AUDIT"),
    source(11, "KEY_CUSTODY"),
    source(12, "DISPATCH"),
    source(13, "INCIDENT"),
  ];
  const result = await authorizedTimeline({ limit: 50 });
  assert.deepEqual(logged, ["authorize", "snapshot", "session", "location",
    "four-source-sql", "audit-anomaly"]);
  assert.equal(result.items.length, 4);
  assert.equal(result.nextCursor, null);
  assert.equal(result.order, "ASC");
});

test("unproven cursor or limit overflow fails closed", async () => {
  reset();
  await assert.rejects(
    timeline({ limit: 1, cursor: "opaque" }),
    (error) =>
      error.status === 503 &&
      error.code === "AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE",
  );
  assert.deepEqual(logged, []);
  sourceRows = [source(10), source(11)];
  await assert.rejects(
    timeline({ limit: 1 }),
    (error) =>
      error.status === 503 &&
      error.code === "AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE",
  );
  assert.deepEqual(logged, ["snapshot", "session", "location", "four-source-sql"]);
});

test("inactive Location keeps non-Incident history but denies Incident coverage", async () => {
  reset();
  incidentLocationStatus = "INACTIVE";
  sourceRows = [source(10, "AUDIT")];
  const result = await timeline({ limit: 50 });
  assert.equal(result.coverage.INCIDENT.status, "NOT_AUTHORIZED");
  assert.equal(result.coverage.INCIDENT.reason, "DETAIL_RESTRICTED");
  assert.equal(result.items.length, 1);
});

test("equal-time source rank, UUID order and duplicate source keys enforced", async () => {
  reset();
  sourceRows = [source(11, "DISPATCH"), source(10, "KEY_CUSTODY")];
  await assert.rejects(timeline({ limit: 100 }), /order is inconsistent/);
  sourceRows = [source(10, "AUDIT"), source(10, "AUDIT")];
  await assert.rejects(timeline({ limit: 100 }), /Duplicate persisted/);
});

test("source outage aborts page, not three-source partial success", async () => {
  reset();
  failSources = true;
  await assert.rejects(timeline({ limit: 50 }), /source outage/);
});

test("detail requires Session containment then W4 source proof then source row", async () => {
  reset();
  sourceRows = [source(20, "AUDIT")];
  const result = await readService.readAuthorizedAuditInvestigationEventDetail(
    tx,
    context,
    scope.organizationId,
    scope.locationId,
    sessionId,
    "AUDIT",
    uid(20),
  );
  assert.equal(result.id, uid(20));
  assert.deepEqual(logged, [
    "authorize",
    "session",
    "source-boundary",
    "four-source-sql",
  ]);
  reset();
  sourceRows = [source(20, "DISPATCH")];
  await assert.rejects(
    detail("AUDIT", uid(20)),
    (error) => error instanceof Error,
  );
});

test("indirect Audit detail requires failed direct proof and independent scoped containment", async () => {
  reset();
  directDenied = true;
  sourceRows = [source(20, "AUDIT")];
  const proof = await detail("AUDIT", uid(20));
  assert.equal(proof.id, uid(20));
  assert.deepEqual(logged, [
    "session",
    "source-boundary",
    "indirect-guard",
    "four-source-sql",
  ]);
  reset();
  directDenied = true;
  indirectAuthorized = false;
  await assert.rejects(detail("AUDIT", uid(20)), SourceDenied);
  assert.deepEqual(logged, ["session", "source-boundary", "indirect-guard"]);
  reset();
  directDenied = true;
  await assert.rejects(detail("DISPATCH", uid(20)), SourceDenied);
  assert.deepEqual(logged, ["session", "source-boundary"]);
});
