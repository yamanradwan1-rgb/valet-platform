import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareCiManagementWriter } from "./ci-management-writer.mjs";

const script = "provision-runtime-role.mjs";
const root = "localhost:1/valet_004b_db_123_456_abcdef12";

function probe(overrides = {}) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_JOB: "postgres",
    NODE_ENV: "test",
    VAYLET_CI_POSTGRES_BOOTSTRAP_URL: "postgresql://valet:fixture@localhost:5432/valet",
    VAYLET_CI_MANAGEMENT_WRITER_PASSWORD: "a".repeat(64),
    VAYLET_CI_RUNTIME_PROVISION_UNREACHABLE_PROBE: "1",
    MIGRATION_DATABASE_URL: "postgresql://valet:fixture@" + root,
    DATABASE_URL: "postgresql://runtime:runtime-fixture@" + root,
    MANAGEMENT_WRITER_DATABASE_URL:
      "postgresql://vaylet_management_writer:writer-fixture@" + root,
    ...overrides,
  };
}

test("does not connect or rewrite inputs for an explicit unreachable negative probe", async () => {
  const env = probe({
    DATABASE_URL: "postgresql://hostile-role:runtime-fixture@" + root + "?user=valet#probe",
  });
  const original = { ...env };
  await prepareCiManagementWriter({}, env, script);
  assert.deepEqual(env, original);
});

test("unreachable probe cannot bypass real fixture target validation", async () => {
  for (const overrides of [
    { DATABASE_URL: "postgresql://runtime:runtime-fixture@localhost:5432/valet_004b_db_123_456_abcdef12" },
    { MIGRATION_DATABASE_URL: "postgresql://valet:fixture@remote.invalid:1/valet_004b_db_123_456_abcdef12" },
    { MANAGEMENT_WRITER_DATABASE_URL: "postgresql://vaylet_management_writer:runtime-fixture@" + root },
    { MANAGEMENT_WRITER_DATABASE_URL: "postgresql://vaylet_management_writer:writer-fixture@" + root + "?user=valet" },
    { VAYLET_CI_RUNTIME_PROVISION_UNREACHABLE_PROBE: undefined },
  ]) {
    await assert.rejects(prepareCiManagementWriter({}, probe(overrides), script),
      /Invalid (unreachable runtime provisioning probe|PostgreSQL CI Management Writer fixture)/);
  }
});
