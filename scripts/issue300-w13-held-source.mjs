import assert from "node:assert/strict";
import { URL } from "node:url";

// Adversarial held SQL is deliberately a disposable fixture, not an actual
// domain writer. The manifest references independently attested existing rows.
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sourceNames = new Set([
  "AUDIT",
  "KEY_CUSTODY",
  "DISPATCH",
  "INCIDENT",
  "TASK_PARENT",
  "INCIDENT_PARENT",
]);

export function validateLane(lane, allowedScopes) {
  assert(sourceNames.has(lane.kind), "Unsupported fixture kind");
  assert(["commit", "rollback"].includes(lane.outcome));
  for (const key of ["id", "org", "location", "session", "actor"])
    assert.match(lane[key] ?? "", uuid, `Missing ${key} fixture UUID`);
  assert(
    allowedScopes.some(
      (scope) =>
        scope.organizationId === lane.org && scope.locationId === lane.location,
    ),
    "Lane scope absent from separately attested API allowlist",
  );
  if (lane.kind === "DISPATCH" || lane.kind === "TASK_PARENT")
    assert.match(lane.task ?? "", uuid);
  if (lane.kind === "KEY_CUSTODY") assert.match(lane.slot ?? "", uuid);
  if (lane.kind === "INCIDENT_PARENT") assert.match(lane.incident ?? "", uuid);
  assert(Number.isFinite(Date.parse(lane.occurredAt)));
  assert(lane.timelinePath?.startsWith("/v1/staff/management/"));
  assert(lane.searchPath?.startsWith("/v1/staff/management/"));
  const anchor = `/organizations/${lane.org}/locations/${lane.location}/audit-investigations/`;
  assert(lane.timelinePath.includes(anchor));
  assert(lane.searchPath.includes(anchor));
  assert(lane.timelinePath.includes(`/sessions/${lane.session}/timeline?`));
  assert(lane.searchPath.includes("/sessions?"));
  for (const path of [lane.searchPath, lane.timelinePath]) {
    const query = new URL(path, "http://127.0.0.1").searchParams;
    assert.equal(
      query.get("limit"),
      "100",
      "Use limit=100 to prove >100 rows with a bounded two-page cohort",
    );
    assert.equal(
      query.get("cursor"),
      null,
      "S0 capture must begin without a replayed cursor",
    );
  }
  assert(
    Array.isArray(lane.negativeScopes) && lane.negativeScopes.length === 2,
    "Require independently identified foreign Org and different Location",
  );
  assert.deepEqual(lane.negativeScopes.map((scope) => scope.kind).sort(), [
    "FOREIGN_ORG",
    "OTHER_LOCATION",
  ]);
  for (const scope of lane.negativeScopes) {
    assert.match(scope.organizationId ?? "", uuid);
    assert.match(scope.locationId ?? "", uuid);
    assert.equal(
      scope.kind === "OTHER_LOCATION",
      scope.organizationId === lane.org,
    );
    assert.notEqual(scope.locationId, lane.location);
    const path = new URL(scope.path, "http://127.0.0.1");
    assert.equal(
      path.pathname.startsWith(`/v1/staff/management/organizations/`),
      true,
    );
    assert(
      path.pathname.includes(
        `/organizations/${scope.organizationId}/locations/${scope.locationId}/audit-investigations/sessions`,
      ),
    );
  }
  for (const state of ["s0", "s1"]) {
    const expected = lane.expected?.[state];
    assert(
      Array.isArray(expected?.timeline) && Array.isArray(expected?.search),
    );
    assert(expected.counts && typeof expected.counts === "object");
    assert(expected.coverage && typeof expected.coverage === "object");
    assert(
      expected.qualityByKey && typeof expected.qualityByKey === "object",
      "Source/indirect quality oracle must be independently signed",
    );
    assert(
      expected.timeline.every((key) =>
        ["RECORDED", "PARTIAL", "UNVERIFIABLE"].includes(
          expected.qualityByKey[key],
        ),
      ),
      "Every Timeline source key requires an explicit quality oracle",
    );
    assert.equal(new Set(expected.timeline).size, expected.timeline.length);
    assert.equal(new Set(expected.search).size, expected.search.length);
    assert(
      expected.search.length >= 101,
      "Proof requires >100 Search Session matches with signed continuation",
    );
    assert(
      expected.timeline.length >= 101,
      "Proof requires >100 Timeline records with signed continuation",
    );
  }
  assert(
    lane.expected.s1.timeline.length >= 101,
    "Proof requires >100 actual ordered Timeline keys",
  );
  for (const src of ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"])
    assert(
      lane.expected.s0.timeline.some((key) => key.startsWith(src + ":")),
      `Missing committed four-source ${src} cohort`,
    );
  const directSource =
    sourceNames.has(lane.kind) && !lane.kind.endsWith("_PARENT");
  if (directSource) {
    const key = `${lane.kind}:${lane.id}`;
    assert(
      !lane.expected.s0.timeline.includes(key),
      "A held source must be absent from independent old S0 oracle",
    );
    assert.equal(
      lane.expected.s1.timeline.includes(key),
      lane.outcome === "commit",
      "New direct source must enter only fresh S1 after COMMIT",
    );
  }
  if (lane.kind === "INCIDENT_PARENT") {
    const key = `INCIDENT:${lane.incident}`;
    assert(!lane.expected.s0.timeline.includes(key));
    assert.equal(
      lane.expected.s1.timeline.includes(key),
      lane.outcome === "commit",
    );
  }
  if (lane.kind === "TASK_PARENT" && lane.outcome === "commit") {
    assert(
      lane.preexistingIndirectAuditIds?.length > 0,
      "Late Task parent needs independently known pre-existing Audit row",
    );
    assert(
      lane.expected.s1.timeline.some(
        (key) =>
          lane.preexistingIndirectAuditIds.includes(
            key.replace(/^AUDIT:/, ""),
          ) && !lane.expected.s0.timeline.includes(key),
      ),
      "Late Task association must change actual authenticated S1 membership",
    );
    assert(
      lane.expected.s1.search.includes(lane.session),
      "Late Task association must resolve only the independently proven Session",
    );
    assert.notDeepEqual(
      lane.expected.s1,
      lane.expected.s0,
      "Committed Task parent cannot silently pass unchanged snapshots",
    );
  }
  if (lane.outcome === "rollback") {
    assert.deepEqual(
      lane.expected.s1,
      lane.expected.s0,
      "Rolled-back held sources must not change the independent source oracle",
    );
  }
}

export async function verifyDatabaseIdentity(client, database, expectedRole) {
  const result = (
    await client.query(
      "SELECT current_database() AS db, current_user AS role, " +
        "current_setting('server_version_num')::integer AS version, " +
        "pg_backend_pid() AS pid, inet_server_addr()::text AS address",
    )
  ).rows[0];
  assert.equal(result.db, database);
  assert.equal(result.role, expectedRole);
  assert.equal(result.version, 170010);
  assert(result.pid > 0);
  return result;
}

export async function stageHeldSource(client, lane) {
  const common = [lane.id, lane.org, lane.location, lane.session];
  switch (lane.kind) {
    case "AUDIT":
      return client.query(
        `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,
          actor_membership_id,actor_type,event_type,entity_type,entity_id,
          metadata_json,occurred_at,created_at)
         VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
          'ValetSession',$4,'{}'::jsonb,$6,$6)`,
        [...common, lane.actor, lane.occurredAt],
      );
    case "KEY_CUSTODY":
      return client.query(
        `INSERT INTO key_custody_events(id,organization_id,location_id,
          valet_session_id,key_slot_id,actor_membership_id,event_type,
          occurred_at,created_at)
         VALUES($1,$2,$3,$4,$5,$6,'CHECKED_OUT',$7,$7)`,
        [...common, lane.slot, lane.actor, lane.occurredAt],
      );
    case "DISPATCH":
      return client.query(
        `INSERT INTO dispatch_events(id,organization_id,location_id,
          valet_session_id,task_id,event_type,actor_membership_id,
          new_assignee_membership_id,occurred_at,created_at)
         VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,$6,$7,$7)`,
        [...common, lane.task, lane.actor, lane.occurredAt],
      );
    case "INCIDENT":
      return client.query(
        `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
          status,severity,type,description,reported_by_membership_id,created_at)
         VALUES($1,$2,$3,$4,'OPEN','LOW','KEY_MISSING',
           'Issue300 V2 disposable held SQL proof',$5,$6)`,
        [...common, lane.actor, lane.occurredAt],
      );
    case "TASK_PARENT":
      return client.query(
        `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,
          task_type,status,updated_at)
         VALUES($1,$2,$3,$4,'PARKING','QUEUED',$5)`,
        [lane.task, lane.org, lane.location, lane.session, lane.occurredAt],
      );
    case "INCIDENT_PARENT":
      return client.query(
        `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
          status,severity,type,description,reported_by_membership_id,created_at)
         VALUES($1,$2,$3,$4,'OPEN','LOW','KEY_MISSING',
          'Issue300 V2 disposable indirect parent',$5,$6)`,
        [
          lane.incident,
          lane.org,
          lane.location,
          lane.session,
          lane.actor,
          lane.occurredAt,
        ],
      );
    default:
      throw Error("Unsupported held writer kind");
  }
}
