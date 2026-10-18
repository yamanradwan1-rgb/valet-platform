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
    Array.isArray(lane.negativeScopePaths) &&
      lane.negativeScopePaths.length >= 2,
    "Negative cross-tenant and other-Location paths must be specified",
  );
  assert(
    lane.negativeScopePaths.every(
      (path) =>
        typeof path === "string" &&
        path.startsWith("/v1/staff/management/") &&
        !path.includes(
          `/organizations/${lane.org}/locations/${lane.location}/`,
        ),
    ),
    "Negative paths must target another tenant or Location",
  );
  for (const state of ["s0", "s1"]) {
    const expected = lane.expected?.[state];
    assert(
      Array.isArray(expected?.timeline) && Array.isArray(expected?.search),
    );
    assert(expected.counts && typeof expected.counts === "object");
    assert(expected.coverage && typeof expected.coverage === "object");
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
