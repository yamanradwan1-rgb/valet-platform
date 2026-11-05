import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function assureIssue429Allowed(result) {
  assert.equal(result.status, 200, "Expected production OCR HTTP 200.");
  assert.equal(
    result.publicOutcome,
    "NO_MATCH",
    "Expected mock provider NO_MATCH, not fast UNAVAILABLE.",
  );
  assert.equal(
    result.publicPayloadSafe,
    true,
    "OCR public response leaked additional internal fields.",
  );
  assert.ok(result.noStore, "OCR response cache-control missing.");
}

export function assertIssue429Debits(before, after, actors) {
  assert.equal(
    after.global - before.global,
    3,
    "Global committed debit must equal three permitted synthetic sends.",
  );
  assert.equal(
    after.tenants[actors[0].organizationId] -
      before.tenants[actors[0].organizationId],
    2,
    "Tenant A committed debit must match its two identities.",
  );
  assert.equal(
    after.tenants[actors[1].organizationId] -
      before.tenants[actors[1].organizationId],
    1,
    "Tenant B committed debit must match its one identity.",
  );
}

export function issue429SmokeEvidence({
  artifact,
  processes,
  acl,
  provider,
  before,
  after,
  actors,
  negatives,
}) {
  return {
    status: "SMOKE_PASS_ONLY",
    issue: 429,
    sourceSha: artifact.sourceSha,
    buildProvenance: "FRESH_CONTROLLED_PINNED_GIT_SNAPSHOT",
    apiDistSha256: artifact.distributionSha256,
    contractsDistSha256: artifact.contractsSha256,
    pgMajor: 17,
    apiProcessCount: processes.length,
    distinctApiProcessIds: new Set(processes.map((p) => p.pid)).size === 2,
    productionNodeEnv: true,
    httpsMockWithTrustAnchor: true,
    restrictedRoleAcl: acl.status,
    providerReceives: provider.received,
    providerPeakActive: provider.peakActive,
    globalDebitDelta: after.global - before.global,
    tenantDebitDeltas: [
      after.tenants[actors[0].organizationId] -
        before.tenants[actors[0].organizationId],
      after.tenants[actors[1].organizationId] -
        before.tenants[actors[1].organizationId],
    ],
    negativeScopeAndInputCount: negatives.length,
    egressPolicy: "EXTERNALLY_ATTESTED_NOT_PROBED",
    performanceGate: "NOT_RUN",
    physicalNativeGate: "NOT_RUN",
  };
}

export function publishIssue429SmokeEvidence(root, result) {
  const path = resolve(
    root,
    "tmp",
    "issue429-qa",
    "production-smoke-redacted.json",
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(
    "Issue429 restricted production HTTPS multiprocess smoke PASS; " +
      "performance and physical-device gates NOT RUN.\n",
  );
}
