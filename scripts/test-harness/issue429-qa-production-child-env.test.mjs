import assert from "node:assert/strict";
import { test } from "node:test";

import { issue429ProductionChildEnvironment } from "./issue429-qa-production-child-env.mjs";

function configuration(systemEnvironment = {}) {
  return issue429ProductionChildEnvironment({
    systemEnvironment,
    port: 38381,
    runtimeUrl: "postgresql://synthetic:synthetic@127.0.0.1:45432/issue429_qa_test",
    databaseCa: "synthetic-ca",
    mockEndpoint: "https://127.0.0.1:44444/ocr",
    token: "issue429-synthetic-test-only",
    caPath: "synthetic-local-ca.pem",
  });
}

test("restricted API child receives no test administrator, operator, or owner secrets", () => {
  const inherited = {
    SystemRoot: "C:\\Windows",
    TEST_DATABASE_URL: "secret-postgres-admin",
    MIGRATION_DATABASE_URL: "secret-migration-admin",
    OCR_OPERATOR_DATABASE_URL: "secret-operator",
    OCR_MAINTENANCE_DATABASE_URL: "secret-maintenance",
    ISSUE429_QA_RUNTIME_DATABASE_URL: "other-secret",
    ISSUE429_QA_EXCLUSIVE_PG17: "fake-owner-secret",
    ISSUE429_QA_FIXTURE_PATH: "private-fixture-location",
    ISSUE429_QA_EGRESS_POLICY_REF: "private-provisioning-record",
    PLATE_OCR_ENDPOINT: "https://paid-provider.invalid",
    PLATE_OCR_TOKEN: "real-provider-credential",
    NODE_OPTIONS: "--require unexpected-module",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    PATH: "sensitive-administrator-path",
  };
  const environment = configuration(inherited);
  assert.equal(environment.SystemRoot, inherited.SystemRoot);
  assert.equal(environment.NODE_ENV, "production");
  assert.equal(environment.STAFF_PUSH_WORKER_SENDING_ENABLED, "false");
  assert.equal(environment.PLATE_OCR_TOKEN, "issue429-synthetic-test-only");
  for (const [name, secret] of Object.entries(inherited)) {
    if (name === "SystemRoot") continue;
    if (name !== "PLATE_OCR_ENDPOINT" && name !== "PLATE_OCR_TOKEN") {
      assert.ok(!(name in environment), `Unexpected child credential: ${name}`);
    }
    // The mock endpoint and synthetic token intentionally replace the original.
    if (name !== "NODE_TLS_REJECT_UNAUTHORIZED") {
      assert.ok(!JSON.stringify(environment).includes(secret),
        `Inherited value was not sanitized: ${name}`);
    }
  }
  assert.ok(!Object.keys(environment).some((name) =>
    /^(TEST_|ISSUE429_|MIGRATION_|OCR_OPERATOR_|OCR_MAINTENANCE_)/.test(name)));
});

test("child rejects provider destinations outside the loopback HTTPS mock", () => {
  assert.throws(() => issue429ProductionChildEnvironment({
    systemEnvironment: {},
    port: 38381, runtimeUrl: "synthetic", databaseCa: "ca",
    mockEndpoint: "http://127.0.0.1:44444/ocr",
    token: "issue429-synthetic-only", caPath: "mock.pem",
  }), /incomplete or unsafe/);
});
