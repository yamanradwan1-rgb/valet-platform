import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ISSUE463_SHARED_ROLES,
  isIssue463SharedRole,
} from "./issue463-shared-role-policy.mjs";
import { cleanupOwnedRun } from "./owned-cleanup.mjs";
import { appendOwnershipEvent } from "./ownership-state.mjs";
import { patchPostgresOwnershipQueries } from "./postgres-ownership-hooks.mjs";

const databaseUrl = "postgresql://fixture:secret@127.0.0.1:5432/valet";

function fakeClient() {
  const events = [];
  const sqlCalls = [];
  class Client {
    connectionParameters = {
      host: "127.0.0.1", port: 5432, database: "valet",
    };
    query(sql, params) {
      sqlCalls.push({ sql, params });
      if (sql.startsWith("SELECT EXISTS"))
        return Promise.resolve({ rows: [{ exists: false }] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
  }
  patchPostgresOwnershipQueries({
    appendEvent: (event) => events.push(event),
    pg: { Client, Pool: class Pool extends Client {} },
    primaryDatabaseUrl: databaseUrl,
  });
  return { client: new Client(), events, sqlCalls };
}

test("only four exact Issue463 cluster role names are classified", () => {
  assert.deepEqual(ISSUE463_SHARED_ROLES, [
    "vaylet_rating_feedback_reader_owner",
    "vaylet_rating_feedback_privacy_owner",
    "vaylet_rating_feedback_privacy_approver",
    "vaylet_rating_feedback_privacy_executor",
  ]);
  for (const role of ISSUE463_SHARED_ROLES)
    assert.equal(isIssue463SharedRole(role), true);
  for (const role of [
    "valet_runtime",
    "vap1_proof_owner",
    "vaylet_rating_feedback_reader_owner_extra",
    "VAYLET_RATING_FEEDBACK_READER_OWNER",
    "vlt_t_role_215_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ]) assert.equal(isIssue463SharedRole(role), false);
});

test("unreviewed W2 CREATE ROLE cannot be claimed as test-owned on a shared cluster", async () => {
  for (const role of ISSUE463_SHARED_ROLES) {
    const fixture = fakeClient();
    await assert.rejects(
      async () => fixture.client.query(`CREATE ROLE ${role} NOLOGIN`),
      /Issue463 shared roles require a reviewed pinned migration/,
    );
    assert.deepEqual(fixture.events, []);
    assert.deepEqual(fixture.sqlCalls, []);
  }
  const fixture = fakeClient();
  await assert.rejects(
    async () => fixture.client.query(
      ISSUE463_SHARED_ROLES.map((role) =>
        `CREATE ROLE ${role} NOLOGIN;`).join("\n"),
    ),
    /pre-attested cluster role reuse/,
  );
  assert.deepEqual(fixture.events, []);
  assert.deepEqual(fixture.sqlCalls, []);
});

test("mutated W2 source cannot bypass pin by stripping its original preflight marker", async () => {
  const fixture = fakeClient();
  await assert.rejects(
    async () => fixture.client.query(
      "BEGIN; CREATE SCHEMA rating_feedback_private; " +
      "DO $w2_exact_roles$ DECLARE x text := " +
      "'vaylet_rating_feedback_reader_owner'; BEGIN NULL; END $w2_exact_roles$;",
    ),
    /has no final review pin/,
  );
  assert.deepEqual(fixture.sqlCalls, []);
  assert.deepEqual(fixture.events, []);
});

test("a test cannot DROP one of the four shared roles", async () => {
  const fixture = fakeClient();
  await assert.rejects(
    async () => fixture.client.query(
      `DROP ROLE IF EXISTS ${ISSUE463_SHARED_ROLES[0]}`,
    ),
    /cluster-owned; refusing per-test DROP ROLE/,
  );
  assert.deepEqual(fixture.events, []);
  assert.deepEqual(fixture.sqlCalls, []);
});

test("unrelated ephemeral role creation still gets owned cleanup receipts", async () => {
  const fixture = fakeClient();
  await fixture.client.query("CREATE ROLE isolated_issue463_test_role NOLOGIN");
  assert.deepEqual(
    fixture.events.map(({ type, kind, name }) => ({ type, kind, name })),
    [
      { type: "resource-planned", kind: "role", name: "isolated_issue463_test_role" },
      { type: "resource-created", kind: "role", name: "isolated_issue463_test_role" },
    ],
  );
});

test("cleanup refuses forged or stale ownership over every fixed Issue463 role", async () => {
  for (const role of ISSUE463_SHARED_ROLES) {
    const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-issue463-owned-role-"));
    const runId = "run_issue463_untrusted";
    let cleanupCalls = 0;
    try {
      appendOwnershipEvent({
        databaseUrl, runId, stateRoot,
        event: { type: "resource-planned", kind: "role",
          name: role, absentBeforeCreate: true },
      });
      const adapter = {
        async dropDatabase() { cleanupCalls++; },
        async dropRole() { cleanupCalls++; },
        async findExistingDatabases() { return []; },
        async findExistingRoles() { return []; },
      };
      for (const requireAttestedTarget of [false, true]) {
        await assert.rejects(
          cleanupOwnedRun({
            adapter, databaseUrl, runId, stateRoot, requireAttestedTarget,
          }),
          /cleanup refuses Issue463 cluster-owned shared roles/,
        );
      }
      assert.equal(cleanupCalls, 0);
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  }
});
