import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadOwnedPlan,
  validateDbUrl,
  target,
} from "./issue300-w13-owned-target.mjs";
import {
  validateLane,
  verifyDatabaseIdentity,
  stageHeldSource,
} from "./issue300-w13-held-source.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1);
const location = id(2);
const session = id(3);
const actor = id(4);
const sources = ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"];
const keys = Array.from(
  { length: 104 },
  (_, index) => `${sources[index % 4]}:${id(index + 1000)}`,
);
const search = Array.from({ length: 104 }, (_, index) => id(index + 2000));
const countMap = Object.fromEntries(search.map((key) => [key, 1]));
const reasons = Object.fromEntries(
  search.map((key) => [key, ["AUDIT:" + id(1000)]]),
);
const expected = {
  timeline: keys,
  search,
  counts: countMap,
  matchReasonsBySession: reasons,
  coverage: Object.fromEntries(
    ["search", "timeline"].map((kind) => [
      kind,
      Object.fromEntries(sources.map((key) => [key, { status: "AVAILABLE" }])),
    ]),
  ),
};
const scope = {
  organizationId: org,
  locationId: location,
  approvedAuditEventIds: [],
};
const lane = (kind) => ({
  kind,
  id: id(5),
  org,
  location,
  session,
  actor,
  task: id(6),
  incident: id(7),
  slot: id(8),
  occurredAt: "2026-10-16T11:30:00Z",
  outcome: "commit",
  searchPath: `/v1/staff/management/organizations/${org}/locations/${location}/audit-investigations/sessions?from=2026-10-16T11%3A00%3A00Z&to=2026-10-16T12%3A00%3A00Z&limit=100`,
  timelinePath: `/v1/staff/management/organizations/${org}/locations/${location}/audit-investigations/sessions/${session}/timeline?limit=100`,
  negativeScopePaths: [
    `/v1/staff/management/organizations/${id(97)}/locations/${id(98)}/audit-investigations/sessions?limit=1`,
    `/v1/staff/management/organizations/${org}/locations/${id(99)}/audit-investigations/sessions?limit=1`,
  ],
  expected: {
    s0: expected,
    s1: {
      ...expected,
      timeline:
        kind === "TASK_PARENT"
          ? keys
          : [
              ...keys,
              `${kind === "INCIDENT_PARENT" ? "INCIDENT" : kind}:` +
                (kind === "INCIDENT_PARENT" ? id(7) : id(5)),
            ],
    },
  },
  preexistingIndirectAuditIds: kind.endsWith("PARENT") ? [id(9)] : [],
});

test("V2 excludes all human database targets and credentials", () => {
  assert.equal(target.database, "issue300_r2_w7_acceptance_v2");
  const own = `postgresql://issue300_r2_w7_owner_v2:private@127.0.0.1:58387/${target.database}`;
  assert.equal(validateDbUrl(own, "issue300_r2_w7_owner_v2"), own);
  for (const url of [
    own.replace("58387", "57285"),
    own.replace(target.database, "issue300_r2"),
    own.replace("127.0.0.1", "localhost"),
    own.replace("owner_v2", "runtime_v2"),
    own.replace("postgresql:", "http:"),
    own + "?sslmode=disable",
  ])
    assert.throws(() => validateDbUrl(url, "issue300_r2_w7_owner_v2"));
});

test("no execution without explicit lease and signed attestation", () => {
  assert.throws(
    () => loadOwnedPlan({ NODE_ENV: "test" }),
    /execution|lease handoff/i,
  );
  assert.throws(
    () =>
      loadOwnedPlan({ NODE_ENV: "test", ISSUE300_W13_EXECUTION_ENABLE: "1" }),
    /issue300-r2-/,
  );
});

test("all six source and parent SQL lanes have bounded shape", async () => {
  for (const kind of [...sources, "TASK_PARENT", "INCIDENT_PARENT"]) {
    const value = lane(kind);
    assert.doesNotThrow(() => validateLane(value, [scope]));
    const calls = [];
    await stageHeldSource(
      {
        query: async (...params) => {
          calls.push(params);
        },
      },
      value,
    );
    assert.equal(calls.length, 1);
    assert.match(
      calls[0][0],
      /^INSERT INTO (audit_events|key_custody_events|dispatch_events|incidents|tasks)/,
    );
    assert(!calls[0][0].includes(org), "SQL must be parameterized");
  }
});

test("source validation denies foreign locations and fabricated page oracles", () => {
  assert.throws(() =>
    validateLane({ ...lane("AUDIT"), location: id(99) }, [scope]),
  );
  assert.throws(() =>
    validateLane(
      {
        ...lane("AUDIT"),
        expected: {
          s0: { ...expected, timeline: keys.slice(0, 2) },
          s1: expected,
        },
      },
      [scope],
    ),
  );
  assert.throws(() =>
    validateLane({ ...lane("INCIDENT"), kind: "SQL" }, [scope]),
  );
  assert.throws(() =>
    validateLane({ ...lane("INCIDENT"), outcome: "DELETE" }, [scope]),
  );
  assert.throws(() =>
    validateLane({ ...lane("TASK_PARENT"), task: "invalid" }, [scope]),
  );
});

test("runtime identity checks actual PostgreSQL role, version and db", async () => {
  const client = {
    query: async () => ({
      rows: [
        {
          db: target.database,
          role: target.runtimeRole,
          version: 170010,
          pid: 123,
          address: "127.0.0.1",
        },
      ],
    }),
  };
  assert.equal(
    (await verifyDatabaseIdentity(client, target.database, target.runtimeRole))
      .pid,
    123,
  );
  await assert.rejects(() =>
    verifyDatabaseIdentity(client, target.database, "issue300_r2_w7_owner_v2"),
  );
});
