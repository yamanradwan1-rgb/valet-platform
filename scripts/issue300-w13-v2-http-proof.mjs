import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadOwnedPlan, target } from "./issue300-w13-owned-target.mjs";
import {
  validateLane,
  verifyDatabaseIdentity,
  stageHeldSource,
} from "./issue300-w13-held-source.mjs";
import {
  createHttpClient,
  loginActualMfa,
  firstPage,
  cursorSecurity,
} from "./issue300-w13-signed-http.mjs";
import {
  createW13Verifier,
  assertLateTaskAssociation,
} from "./issue300-w13-verifier.mjs";
import { verifyStaffAuthority } from "./issue300-w13-staff-authority.mjs";

// This runner only executes against Prime-certified disposable W7 V2 resources.
// Its deliberately held SQL adversarial fixtures never count as domain writers.
const plan = loadOwnedPlan(); // Fail before opening any DB connection or HTTP.
const client = createHttpClient(plan.enabledApi, plan.origin);
const ordinary = createHttpClient(plan.defaultApi, plan.origin);
const admin = new pg.Client({
  connectionString: plan.adminUrl,
  application_name: "issue300_w13_v2_reader",
});
const writer = new pg.Client({
  connectionString: plan.adminUrl,
  application_name: "issue300_w13_v2_held_writer",
});
const runtime = new pg.Client({
  connectionString: plan.runtimeUrl,
  application_name: "issue300_w13_v2_runtime_identity",
});
const scopes = plan.proof.allowedScopes;

const {
  assertLeaseLive,
  assertExpected,
  snapshot,
  assertDefaultDisabled,
  assertScope,
  independentLateReadback,
  verifyOperationalBaseline,
  verifyPreexistingIndirect,
} = createW13Verifier({ plan, admin, client, ordinary, scopes });
async function runLane(lane, users) {
  assertLeaseLive();
  validateLane(lane, scopes);
  await verifyPreexistingIndirect(lane);
  await independentLateReadback(lane, false);
  const evidence = {
    kind: lane.kind,
    outcome: lane.outcome,
    viewers: [],
    executedSqlFixture: true,
    actualDomainWriter: false,
  };
  let held = false;
  try {
    await writer.query("BEGIN");
    held = true;
    const begunAt = new Date().toISOString();
    await stageHeldSource(writer, lane);
    await independentLateReadback(lane, false);
    for (const [role, viewer] of [
      ["CA", users.ca],
      ["LM", users.lm],
    ]) {
      await assertDefaultDisabled(lane, viewer);
      await assertScope(lane, viewer, role, users.foreign, users.supervisor);
    }
    const before = {};
    for (const [role, viewer] of [
      ["CA", users.ca],
      ["LM", users.lm],
    ]) {
      before[role] = {
        search: await firstPage(client, lane.searchPath, viewer.token),
        timeline: await firstPage(client, lane.timelinePath, viewer.token),
      };
    }
    const capturedAt = new Date().toISOString();
    assert(Date.parse(begunAt) <= Date.parse(capturedAt));
    await writer.query(lane.outcome === "commit" ? "COMMIT" : "ROLLBACK");
    held = false;
    const finishedAt = new Date().toISOString();
    assert(Date.parse(finishedAt) >= Date.parse(capturedAt));
    await independentLateReadback(lane, lane.outcome === "commit");
    const afterExpected =
      lane.outcome === "commit" ? lane.expected.s1 : lane.expected.s0;
    for (const [role, viewer] of [
      ["CA", users.ca],
      ["LM", users.lm],
    ]) {
      const s0Search = await snapshot(
        lane.searchPath,
        viewer.token,
        "search",
        before[role].search,
      );
      const s0Timeline = await snapshot(
        lane.timelinePath,
        viewer.token,
        "timeline",
        before[role].timeline,
      );
      assertExpected(s0Search, lane.expected.s0, "search");
      assertExpected(s0Timeline, lane.expected.s0, "timeline");
      const s1Search = await snapshot(lane.searchPath, viewer.token, "search");
      const s1Timeline = await snapshot(
        lane.timelinePath,
        viewer.token,
        "timeline",
      );
      assertExpected(s1Search, afterExpected, "search");
      assertExpected(s1Timeline, afterExpected, "timeline");
      assertLateTaskAssociation(lane, s0Timeline, s1Timeline);
      assert.notEqual(
        s0Timeline.snapshot,
        s1Timeline.snapshot,
        "Fresh S1 was silently reused from old S0",
      );
      await cursorSecurity(client, lane, viewer.token, users.foreign.token);
      evidence.viewers.push({
        role,
        s0SearchPages: s0Search.pages,
        s0TimelinePages: s0Timeline.pages,
        s1SearchPages: s1Search.pages,
        s1TimelinePages: s1Timeline.pages,
      });
    }
    evidence.twoIndependentConnections = true;
    evidence.beginBeforeS0 = true;
    evidence.commitOrRollbackAfterS0 = true;
    return evidence;
  } finally {
    if (held) await writer.query("ROLLBACK").catch(() => undefined);
  }
}

try {
  await Promise.all([admin.connect(), writer.connect(), runtime.connect()]);
  const [readerIdentity, writerIdentity, runtimeIdentity] = await Promise.all([
    verifyDatabaseIdentity(admin, target.database, "issue300_r2_w7_owner_v2"),
    verifyDatabaseIdentity(writer, target.database, "issue300_r2_w7_owner_v2"),
    verifyDatabaseIdentity(runtime, target.database, target.runtimeRole),
  ]);
  assert.notEqual(
    readerIdentity.pid,
    writerIdentity.pid,
    "Held writer must have independent PostgreSQL backend",
  );
  assert.notEqual(runtimeIdentity.pid, writerIdentity.pid);
  await verifyOperationalBaseline();
  const users = {};
  for (const role of ["ca", "lm", "supervisor", "foreign"])
    users[role] =
      role === "ca" || role === "lm" || role === "foreign"
        ? await loginActualMfa(client, plan.credentials[role])
        : await (async () => {
            const { email, password } = plan.credentials[role];
            const reply = await client("/v1/staff/auth/login", null, {
              email,
              password,
            });
            assert.equal(reply.status, 200, "Supervisor real login failed");
            return {
              token: reply.json.accessToken,
              sessionId: reply.sessionId,
            };
          })();
  const foreignScope = plan.fixture.lanes[0].negativeScopes.find(
    (scope) => scope.kind === "FOREIGN_ORG",
  );
  assert(foreignScope, "Missing real foreign tenant scope");
  const membershipRoles = {
    ca: {
      role: "ORG_ADMIN",
      organizationId: scopes[0].organizationId,
      locationId: scopes[0].locationId,
    },
    lm: {
      role: "LOCATION_MANAGER",
      organizationId: scopes[0].organizationId,
      locationId: scopes[0].locationId,
    },
    supervisor: {
      role: "VALET_SUPERVISOR",
      organizationId: scopes[0].organizationId,
      locationId: scopes[0].locationId,
      requireMfa: false,
    },
    foreign: {
      role: "ORG_ADMIN",
      organizationId: foreignScope.organizationId,
      locationId: foreignScope.locationId,
    },
  };
  for (const role of ["ca", "lm", "supervisor", "foreign"])
    users[role].membershipId = await verifyStaffAuthority(
      admin,
      users[role],
      plan.credentials[role],
      membershipRoles[role],
      client,
    );
  assert.notEqual(
    users.ca.membershipId,
    users.lm.membershipId,
    "Distinct logins cannot prove two roles through the same membership",
  );
  assert.equal(
    new Set(
      Object.values(users)
        .map((user) => user.sessionId)
        .filter(Boolean),
    ).size,
    3,
    "Expected distinct CA/LM/foreign MFA sessions",
  );
  const lanes = plan.fixture.lanes;
  for (const kind of [
    "AUDIT",
    "KEY_CUSTODY",
    "DISPATCH",
    "INCIDENT",
    "TASK_PARENT",
    "INCIDENT_PARENT",
  ])
    assert(
      lanes.some((lane) => lane.kind === kind),
      `Missing held cohort ${kind}`,
    );
  assert(
    lanes.some((lane) => lane.outcome === "rollback"),
    "Missing independent transaction rollback control",
  );
  const rows = [];
  for (const lane of lanes) rows.push(await runLane(lane, users));
  assertLeaseLive();
  const result = {
    verdict: "ACTUAL_DOMAIN_BASELINE_AND_SQL_HELD_SIGNED_HTTP_PASS",
    candidate: plan.candidate,
    lease: plan.lease,
    target: target.database,
    scopeCount: scopes.length,
    actualCaLmMfa: true,
    operationalBaselineReceiptsVerified:
      plan.fixture.operationalWriterReceipts.length,
    postgresBackendsDistinct: true,
    sourceOracleOwnerSigned: true,
    rows,
  };
  const path = join(plan.ownDirectory, `W13_V2_HTTP_${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  globalThis.console.log(
    JSON.stringify({
      verdict: result.verdict,
      candidate: plan.candidate,
      scenarioCount: rows.length,
      evidenceFile: path,
    }),
  );
} finally {
  await Promise.allSettled([admin.end(), writer.end(), runtime.end()]);
}
