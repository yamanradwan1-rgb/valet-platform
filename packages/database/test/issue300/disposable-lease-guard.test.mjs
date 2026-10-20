import assert from "node:assert/strict";
import test from "node:test";
import { validateDisposableLease } from "./disposable-lease-guard.mjs";

const good = {
  project: "issue300",
  issuedTo: "w7",
  disposable: true,
  leaseId: "issue300-w7-local-lease-abc123",
  runId: "prime-approved-qa-001",
  database: "issue300_w7_accepted_fixture_1",
  port: 55381,
  ownerPid: 10001,
  createdBy: "prime",
  cleanupAuthority: "prime-owned-cluster",
};
const dsn = "postgresql://qa:unused@127.0.0.1:55381/issue300_w7_accepted_fixture_1";

test("preflight validates only a uniquely named disposable local W7 lease", () => {
  assert.deepEqual(validateDisposableLease(good, dsn), {
    database: good.database, host: "127.0.0.1", port: 55381,
    leaseId: good.leaseId, runId: good.runId,
  });
});

test("preflight rejects shared valet and default port even with asserted ownership", () => {
  assert.throws(() => validateDisposableLease(
    { ...good, port: 5432, database: "valet" }, "postgres://qa@localhost:5432/valet",
  ), /non-disposable PostgreSQL port/);
});

test("preflight rejects cross-task DB and mismatched port/claim", () => {
  assert.throws(() => validateDisposableLease(good, "postgres://qa@localhost:55381/valet"),
    /not uniquely task-owned/);
  assert.throws(() => validateDisposableLease({ ...good, port: 55431 }, dsn),
    /non-disposable PostgreSQL port/);
});

test("preflight refuses remote hosts and implicit env fallback", () => {
  assert.throws(() => validateDisposableLease(good,
    "postgres://qa@production.example:55381/issue300_w7_accepted_fixture_1"),
  /local-only/);
  assert.throws(() => validateDisposableLease(good), /no fallback/);
});

test("preflight requires process identity and cleanup authority", () => {
  assert.throws(() => validateDisposableLease({ ...good, ownerPid: 0 }, dsn),
    /ownership not documented/);
  assert.throws(() => validateDisposableLease({ ...good, createdBy: "worker7" }, dsn),
    /ownership not documented/);
});
