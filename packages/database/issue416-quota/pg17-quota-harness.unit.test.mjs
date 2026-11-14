import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EXPLICIT_RELEASE, assertPg17QuotaRelease,
} from "./pg17-quota-release.mjs";

function source(name) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("R02/R03 source-only PG17 harness safety — NO database access", () => {
  it("refuses absent, incorrect or production/CI release flags", () => {
    for (const env of [{}, { ISSUE416_R02_PG17_RELEASE: "true" },
      { ISSUE416_R02_PG17_RELEASE: EXPLICIT_RELEASE, CI: "1" },
      { ISSUE416_R02_PG17_RELEASE: EXPLICIT_RELEASE, NODE_ENV: "production" }]) {
      assert.throws(() => assertPg17QuotaRelease(env));
    }
    assert.doesNotThrow(() => assertPg17QuotaRelease({
      ISSUE416_R02_PG17_RELEASE: EXPLICIT_RELEASE,
    })); // Pure flag test; does not certify actual Owner authorization.
  });

  it("requires gate before W9 attestation/lease and again before DB connections", () => {
    const setup = source("./pg17-quota-global-setup.mjs");
    const fixture = source("./pg17-quota-fixture.mjs");
    const config = source("./vitest.issue416-quota.config.mjs");
    assert.ok(setup.indexOf("assertPg17QuotaRelease();") <
      setup.indexOf("return w9GlobalSetup()"));
    assert.ok(fixture.indexOf("assertPg17QuotaRelease();") <
      fixture.indexOf("await preflightIssue416Target()"));
    assert.match(config, /pg17-quota-global-setup\.mjs/);
    assert.match(fixture, /attestQuotaSchema\(client\)/);
    assert.match(fixture, /"ROLLBACK"/);
    assert.doesNotMatch(fixture, /"COMMIT"|DROP TABLE|CREATE DATABASE|prisma migrate/i);
  });

  it("preserves the six independent source caps and red R03 SQL gap", () => {
    const fixture = source("./pg17-quota-fixture.mjs");
    const api = source("../../../apps/api/src/modules/anti-abuse/anti-abuse-key.ts");
    const latestLegacyConstraint = source(
      "../prisma/migrations/20261021009800_issue309_photo_view_anti_abuse_scope/migration.sql",
    );
    const issueLimits = [3, 20, 100, 30];
    const redeemLimits = [30, 5];
    for (const cap of [...issueLimits, ...redeemLimits]) {
      assert.match(fixture, new RegExp(", " + cap + "\\]"));
      assert.match(api, new RegExp("limit: " + cap + "[,\\n]"));
    }
    assert.doesNotMatch(latestLegacyConstraint, /staff-password-reset-redeem/);
    const acceptance = source("./PG17_ACCEPTANCE_NOT_RUN.md");
    assert.match(acceptance, /P0 activation blocker — limiter ABI mismatch/);
    assert.match(acceptance, /PG17 NOT RUN/);
  });

  it("retains real two-connection and receipt tests without asserting COMMIT proof", () => {
    const concurrency = source("./pg17-r02-concurrency.integration.test.mjs");
    const evidence = source("./pg17-r02-receipt.integration.test.mjs");
    const abi = source("./pg17-r02-abi-acl.integration.test.mjs");
    assert.match(concurrency, /55P03/);
    assert.match(concurrency, /it\.skip\("requires separately approved durable fixture/);
    assert.match(evidence, /reconcile_reset_issue_quota/);
    assert.match(evidence, /it\.skip\("requires authorized committed domain receipt/);
    assert.match(abi, /"23503"/);
    assert.match(abi, /Intentionally RED until approved forward-only R03/);
    assert.match(abi, /has_any_column_privilege\(current_user,'public\.anti_abuse_events','UPDATE'\)/);
  });
});
