import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  checkIssue429ProductionInputs,
  readIssue429SyntheticActors,
} from "./issue429-qa-production-target.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixtureDir = resolve(root, "tmp", "issue429-qa");
mkdirSync(fixtureDir, { recursive: true });
const fixture = resolve(fixtureDir, `negative-target-test-${randomUUID()}.json`);
writeFileSync(fixture, "{}");

const acceptable = {
  ISSUE429_QA_EXCLUSIVE_PG17: "PRIME_GRANTED_EXCLUSIVE_PG17",
  TEST_DATABASE_URL: "postgresql://vaylet_test_admin:synthetic@127.0.0.1:45432/vaylet_test",
  ISSUE429_QA_RUNTIME_DATABASE_URL:
    "postgresql://issue429_runtime:synthetic@127.0.0.1:45432/issue429_qa_synthetic",
  ISSUE429_QA_FIXTURE_PATH: fixture,
  ISSUE429_QA_DATABASE_TLS_CA_PEM: "-----BEGIN CERTIFICATE-----\nsynthetic\n",
  ISSUE429_QA_EGRESS_POLICY_REF: "owned-isolated-network-attestation",
  ISSUE429_QA_BUILD_SHA: "a".repeat(40),
  ISSUE429_QA_ARTIFACT_SHA256: "b".repeat(64),
};

test.after(() => unlinkSync(fixture));

test("Issue429 target fence requires explicit Prime grant before all PG operations", () => {
  assert.throws(() => checkIssue429ProductionInputs({
    ...acceptable, ISSUE429_QA_EXCLUSIVE_PG17: undefined,
  }, root), /Prime exclusive PG17/);
  assert.throws(() => checkIssue429ProductionInputs({
    ...acceptable, NODE_ENV: "production",
  }, root), /parent must run outside production/);
});

test("Issue429 target fence rejects every default, wrong port and foreign host", () => {
  for (const url of [
    undefined,
    "postgresql://valet:valet@127.0.0.1:5432/valet",
    "postgresql://vaylet_test_admin:synthetic@localhost:45432/vaylet_test",
    "postgresql://vaylet_test_admin:synthetic@192.168.1.10:45432/vaylet_test",
  ]) {
    assert.throws(() => checkIssue429ProductionInputs({
      ...acceptable, TEST_DATABASE_URL: url,
    }, root));
  }
});

test("Issue429 target fence rejects unsafe runtime scope and TLS override", () => {
  for (const runtimeUrl of [
    "postgresql://vaylet_test_admin:synthetic@127.0.0.1:45432/vaylet_test",
    "postgresql://runtime:synthetic@127.0.0.1:5432/issue429_qa_synthetic",
    "postgresql://runtime:synthetic@127.0.0.1:45432/production",
    "postgresql://runtime:synthetic@127.0.0.1:45432/issue429_qa_synthetic?sslmode=disable",
  ]) {
    assert.throws(() => checkIssue429ProductionInputs({
      ...acceptable, ISSUE429_QA_RUNTIME_DATABASE_URL: runtimeUrl,
    }, root));
  }
  assert.throws(() => checkIssue429ProductionInputs({
    ...acceptable, NODE_TLS_REJECT_UNAUTHORIZED: "0",
  }, root), /disabled certificate/);
  assert.throws(() => checkIssue429ProductionInputs({
    ...acceptable, ISSUE429_QA_EGRESS_POLICY_REF: "",
  }, root), /evidence is incomplete/);
});

test("Issue429 guard validates offline input without opening PostgreSQL", () => {
  const result = checkIssue429ProductionInputs(acceptable, root);
  assert.equal(result.fixturePath, fixture);
  assert.equal(new URL(result.runtimeUrl).pathname, "/issue429_qa_synthetic");
});

test("real fixture must include 2 tenants and distinct third eligible identity", () => {
  writeFileSync(fixture, JSON.stringify({
    syntheticOnly: true, databaseName: "issue429_qa_synthetic",
    accountReadyByOperator: true,
    actors: [
      { accessToken: "synthetic-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        organizationId: "org-a-00000000000001", membershipId: "m-a-000000000001",
        locationId: "loc-a-000000000001" },
      { accessToken: "synthetic-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        organizationId: "org-b-00000000000001", membershipId: "m-b-000000000001",
        locationId: "loc-b-000000000001" },
      { accessToken: "synthetic-token-cccccccccccccccccccccccccccc",
        organizationId: "org-a-00000000000001", membershipId: "m-c-000000000001",
        locationId: "loc-a-000000000001" },
    ],
  }));
  assert.equal(readIssue429SyntheticActors(fixture, "issue429_qa_synthetic").length, 3);
  assert.throws(() =>
    readIssue429SyntheticActors(fixture, "production"), /preprovisioned synthetic/);
});
