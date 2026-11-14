import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import * as release from "./pg17-quota-release.mjs";
import * as fixture from "./pg17-quota-fixture.mjs";

function source(name) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("W12 R02 PG17 security blockers — source-only, no connection", () => {
  it("rejects arbitrary environment URL keys before any release or preflight", async () => {
    for (const key of ["ATTACKER_DATABASE_URL", "TEST_DATABASE_URL", "", null]) {
      assert.throws(() => release.assertQuotaUrlRole(key), /R02_PG17_URL_ROLE_DENIED/);
      await assert.rejects(fixture.attestedQuotaClient(key), /R02_PG17_URL_ROLE_DENIED/);
    }
    for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
      assert.equal(release.assertQuotaUrlRole(key), key);
    }
    const fixtureSource = source("./pg17-quota-fixture.mjs");
    assert.match(fixtureSource, /assertQuotaUrlRole\(urlKey\)/);
  });

  it("does not expose a writable client or callback while W9 lease owner is unverifiable", async () => {
    assert.equal(typeof release.assertQuotaLeaseOwned, "function");
    assert.throws(() => release.assertQuotaLeaseOwned(), /R02_PG17_LEASE_OWNER_NOT_ATTESTED/);
    let calls = 0;
    const badClient = { query() { calls += 1; throw Error("SHOULD_NOT_RUN_SQL"); } };
    let callbackCalled = false;
    await assert.rejects(fixture.withQuotaRollback(() => {
      callbackCalled = true;
      return badClient.query("COMMIT; DROP TABLE anything");
    }), /Issue416 R02 PG17 NOT RUN|R02_PG17_LEASE_OWNER_NOT_ATTESTED/);
    await assert.rejects(fixture.attestedQuotaClient(),
      /Issue416 R02 PG17 NOT RUN|R02_PG17_LEASE_OWNER_NOT_ATTESTED/);
    await assert.rejects(fixture.attestQuotaSchema(badClient),
      /R02_PG17_LEASE_OWNER_NOT_ATTESTED/);
    await assert.rejects(fixture.reserveQuota(badClient, fixture.syntheticRequest()),
      /R02_PG17_LEASE_OWNER_NOT_ATTESTED/);
    await assert.rejects(fixture.expectSavepointRejection(badClient, () => {
      calls += 1;
    }, "42501"), /R02_PG17_LEASE_OWNER_NOT_ATTESTED/);
    assert.equal(callbackCalled, false);
    assert.equal(calls, 0);
    const src = source("./pg17-quota-fixture.mjs");
    assert.match(src, /assertQuotaLeaseOwned\(\)/);
    assert.doesNotMatch(src, /\bnew Client\s*\(/);
    assert.doesNotMatch(src, /\bawait action\s*\(\s*client\s*\)/);
    assert.doesNotMatch(src, /client\.query\s*\(\s*["']BEGIN/);
  });

  it("the PG17 project and legacy R02 connector stop before W9 or PostgreSQL", () => {
    const setup = source("./pg17-quota-global-setup.mjs");
    const legacy = source("./pg17-reset-issue-quota.integration.test.mjs");
    assert.match(setup, /assertQuotaLeaseOwned\(\)/);
    assert.doesNotMatch(setup, /\bw9GlobalSetup\s*\(/);
    assert.match(legacy, /assertQuotaUrlRole\(urlKey\)/);
    assert.match(legacy, /assertQuotaLeaseOwned\(\)/);
    assert.ok(legacy.indexOf("assertQuotaLeaseOwned()") <
      legacy.indexOf("await preflightIssue416Target()"));
    assert.match(source("./PG17_ACCEPTANCE_NOT_RUN.md"), /NO SAFE PG17 RELEASE/);
  });
});
