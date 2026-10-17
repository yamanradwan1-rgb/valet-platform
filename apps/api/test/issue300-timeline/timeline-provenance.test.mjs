import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sourceRoot = path.resolve(
  __dirname,
  "../../src/modules/management/audit-investigation/timeline",
);
const id = (suffix) => "aaaaaaaa-aaaa-4aaa-8aaa-" + suffix.padStart(12, "0");
const sessionId = id("1");
const scope = {
  organizationId: id("2"),
  locationId: id("3"),
  membershipId: id("4"),
  role: "LOCATION_MANAGER",
};

function load(moduleName, stubs = {}) {
  const input = fs.readFileSync(path.join(sourceRoot, moduleName), "utf8");
  const output = ts.transpileModule(input, {
    fileName: moduleName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  assert.deepEqual(
    output.diagnostics.filter(
      (issue) => issue.category === ts.DiagnosticCategory.Error,
    ),
    [],
  );
  const context = {
    exports: {},
    require(name) {
      if (!(name in stubs)) throw new Error("Unmocked module: " + name);
      return stubs[name];
    },
    Date,
    Set,
    Error,
  };
  vm.runInNewContext(output.outputText, context, { filename: moduleName });
  return context.exports;
}

const catalogue = {
  managementAuditKnownEventTypes: [
    "VALET_SESSION_PARKED",
    "VALET_SESSION_COMPLETED",
    "INCIDENT_OPENED",
  ],
};
const projection = load("timeline-safe-projection.ts", {
  "../../management-audit-event-catalog": catalogue,
  "@valet/contracts": {
    incidentTypeSchema: {
      safeParse: (x) => ({ success: ["KEY_MISSING"].includes(x) }),
    },
    incidentSeveritySchema: {
      safeParse: (x) => ({ success: ["HIGH"].includes(x) }),
    },
  },
});

function row(source, type, suffix, overrides = {}) {
  return {
    source,
    id: id(suffix),
    kind: type,
    occurredAt: new Date("2026-10-23T14:56:00.123Z"),
    recordedAt: new Date("2026-10-23T14:57:00.123Z"),
    actorId: null,
    actorName: null,
    previousId: null,
    previousName: null,
    nextId: null,
    nextName: null,
    reporterId: null,
    reporterName: null,
    keySlotId: null,
    taskId: null,
    incidentType: null,
    incidentSeverity: null,
    incidentStatus: null,
    ...overrides,
  };
}

test("custody is historical slot and actor only; current holder never inferred", () => {
  const event = projection.projectTimelineRow(
    row("KEY_CUSTODY", "RETURNED_TO_SLOT", "10", {
      actorId: id("5"),
      actorName: "Samir Khalil",
      keySlotId: id("6"),
    }),
    sessionId,
  );
  assert.equal(event.actor.membershipId, id("5"));
  assert.equal(event.references[1].id, id("6"));
  assert.equal(event.participants.length, 0);
  assert.equal(event.quality, "RECORDED");
  assert.equal(event.kind, "RETURNED_TO_SLOT");
});

test("actual RELEASED event permits null slot while CHECKED_OUT does not", () => {
  const released = row("KEY_CUSTODY", "RELEASED", "111");
  const projected = projection.projectTimelineDetail(released, sessionId);
  assert.equal(projected.keySlotId, null);
  assert.equal(projected.references.length, 1);
  assert.throws(
    () =>
      projection.projectTimelineDetail(
        row("KEY_CUSTODY", "CHECKED_OUT", "112"),
        sessionId,
      ),
    /Custody detail/,
  );
});

test("unrecognized historical Incident type is partial and never echoed", () => {
  const unusual = row("INCIDENT", "INCIDENT_REPORTED", "113", {
    reporterId: id("14"),
    reporterName: "Salma Faris",
    incidentType: "LEGACY_PRIVATE_UNKNOWN",
    incidentSeverity: "HIGH",
    incidentStatus: "OPEN",
  });
  const summary = projection.projectTimelineRow(unusual, sessionId);
  assert.equal(summary.quality, "PARTIAL");
  assert.doesNotMatch(JSON.stringify(summary), /LEGACY_PRIVATE_UNKNOWN/);
  assert.throws(
    () => projection.projectTimelineDetail(unusual, sessionId),
    /safely recognized/,
  );
});

test("dispatch actor, former/new assignees stay separate; no reason or current Task", () => {
  const source = row("DISPATCH", "REASSIGNED", "11", {
    actorId: id("7"),
    actorName: "Karim Zaid",
    previousId: id("8"),
    previousName: "Rana Darwish",
    nextId: id("9"),
    nextName: "Hadi Mansour",
    taskId: id("12"),
    reason: "private reassignment text",
  });
  const event = projection.projectTimelineRow(source, sessionId);
  assert.equal(event.actor.membershipId, id("7"));
  assert.deepEqual(
    Array.from(event.participants, (x) => x.role),
    ["PREVIOUS_ASSIGNEE", "NEW_ASSIGNEE"],
  );
  assert.equal(event.participants[0].membership.membershipId, id("8"));
  assert.equal(event.participants[1].membership.membershipId, id("9"));
  const detail = projection.projectTimelineDetail(source, sessionId);
  assert.equal(detail.taskId, id("12"));
  assert.doesNotMatch(JSON.stringify(detail), /private reassignment text/);
});

test("Incident reporter only; current status is not invented transition", () => {
  const source = row("INCIDENT", "INCIDENT_REPORTED", "13", {
    reporterId: id("14"),
    reporterName: "Salma Faris",
    incidentType: "KEY_MISSING",
    incidentSeverity: "HIGH",
    incidentStatus: "RESOLVED",
    description: "private photo and incident details",
  });
  const event = projection.projectTimelineRow(source, sessionId);
  assert.equal(event.actor, null);
  assert.equal(event.participants[0].role, "REPORTER");
  const detail = projection.projectTimelineDetail(source, sessionId);
  assert.equal(detail.incident.status, "RESOLVED");
  assert.equal(detail.incident.statusBasis, "CURRENT");
  assert.equal(detail.incident.resolutionAvailable, false);
  assert.equal(detail.kind, "INCIDENT_REPORTED");
  assert.doesNotMatch(JSON.stringify(detail), /private photo/);
});

test("unknown Audit type never exposes raw kind or enriches actor", () => {
  const event = projection.projectTimelineRow(
    row("AUDIT", "UNKNOWN_CUSTOM_METADATA", "15", {
      actorId: id("5"),
      actorName: "Private Name",
      privateMetadata: "raw",
    }),
    sessionId,
  );
  assert.equal(event.kind, "UNKNOWN");
  assert.equal(event.quality, "UNVERIFIABLE");
  assert.equal(event.actor, null);
  assert.equal(event.references.length, 1);
  assert.equal(event.participants.length, 0);
  assert.doesNotMatch(JSON.stringify(event), /UNKNOWN_CUSTOM|Private Name|raw/);
});

test("four-source SQL uses exact scope and no sensitive source columns", async () => {
  const queryModule = load("timeline-source-query.ts");
  const sql = queryModule.timelineSourceSql;
  for (const table of [
    "audit_events",
    "key_custody_events",
    "dispatch_events",
    "incidents",
  ]) {
    assert.match(sql, new RegExp("JOIN " + table));
  }
  assert.match(sql, /organization_id = \$1::uuid/);
  assert.match(sql, /location_id = \$2::uuid/);
  assert.match(sql, /session.id = \$3::uuid/);
  assert.match(sql, /ORDER BY occurred_at ASC, rank ASC, id ASC/);
  assert.match(sql, /linked_task.valet_session_id = session.id/);
  assert.match(sql, /linked_incident.valet_session_id = session.id/);
  assert.doesNotMatch(
    sql,
    /\b(dispatch.reason|incident.description|resolution_notes)\b/i,
  );
  const calls = [];
  const tx = {
    async query(query, params) {
      calls.push({ query, params });
      return { rows: [] };
    },
  };
  await queryModule.readTimelineSources(tx, scope, sessionId, 101);
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0].params), [
    scope.organizationId,
    scope.locationId,
    sessionId,
    101,
    null,
    null,
  ]);
});

test("safe point-detail SQL filters explicit source AND event ID", async () => {
  const queryModule = load("timeline-source-query.ts");
  let parameters;
  const tx = {
    async query(_, params) {
      parameters = params;
      return { rows: [] };
    },
  };
  await queryModule.readTimelineSources(tx, scope, sessionId, 1, {
    source: "KEY_CUSTODY",
    id: id("99"),
  });
  assert.deepEqual(Array.from(parameters).slice(-2), ["KEY_CUSTODY", id("99")]);
});
