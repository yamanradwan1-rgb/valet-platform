// Opt-in production-build QA. No fixture creation, migration or runtime
// assumption: explicit Prime exclusivity and independently attested PG17 first.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireInvocationLease } from "./invocation-lease.mjs";
import { preflightIssue414Phase23HttpBeforeLease } from "./issue414-phase23-http-target.mjs";
import { startIssue429HttpsMock } from "./issue429-qa-https-mock.mjs";
import { createIssue429TlsFixture } from "./issue429-qa-tls-fixture.mjs";
import {
  assertIssue429ProductionArtifact,
  checkIssue429ProductionInputs,
  inspectIssue429QaDocker,
  readIssue429SyntheticActors,
} from "./issue429-qa-production-target.mjs";
import {
  observeIssue429Debits, openIssue429Ledger, requestIssue429PlateOcr,
  startIssue429ProductionApi,
} from "./issue429-qa-production-ops.mjs";
import { observeIssue429RuntimeAcl, verifyIssue429AclSnapshot } from "./issue429-qa-runtime-acl.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
let stage = "PRECHECK";

function assureAllowed(result) {
  assert.equal(result.status, 200, "Expected production OCR HTTP 200.");
  assert.equal(result.publicOutcome, "NO_MATCH",
    "Expected mock provider NO_MATCH, not fast UNAVAILABLE.");
  assert.equal(result.publicPayloadSafe, true,
    "OCR public response leaked additional internal fields.");
  assert.ok(result.noStore, "OCR response cache-control missing.");
}

function assertDebits(before, after, actors) {
  assert.equal(after.global - before.global, 3,
    "Global committed debit must equal three permitted synthetic sends.");
  const first = actors[0].organizationId;
  const second = actors[1].organizationId;
  assert.equal(after.tenants[first] - before.tenants[first], 2,
    "Tenant A committed debit must match its two identities.");
  assert.equal(after.tenants[second] - before.tenants[second], 1,
    "Tenant B committed debit must match its one identity.");
}

async function main() {
  stage = "INPUT_FENCE";
  const inputs = checkIssue429ProductionInputs(process.env, root);
  stage = "BUILD_ATTESTATION";
  const artifact = assertIssue429ProductionArtifact(
    process.env.ISSUE429_QA_BUILD_SHA, root,
    process.env.ISSUE429_QA_ARTIFACT_SHA256);
  const actors = readIssue429SyntheticActors(inputs.fixturePath,
    new URL(inputs.runtimeUrl).pathname.slice(1));
  stage = "DOCKER_IDENTITY";
  inspectIssue429QaDocker();
  // Target verification before lease: inherited/unknown default 5432 is forbidden.
  stage = "PG17_PREFLIGHT";
  await preflightIssue414Phase23HttpBeforeLease();
  stage = "EXCLUSIVE_LEASE";
  const lease = await acquireInvocationLease("issue429-qa-production",
    { selectedProjects: ["api-postgres-race"] });
  let tls;
  let mock;
  let ledger;
  const processes = [];
  let smoke = null;
  let released = false;
  try {
    stage = "TLS_AND_RUNTIME_ACL";
    const token = `issue429-synthetic-${randomBytes(20).toString("hex")}`;
    tls = createIssue429TlsFixture(root, process.env.ISSUE429_QA_OPENSSL);
    ledger = await openIssue429Ledger(inputs.adminUrl, inputs.runtimeUrl,
      process.env.ISSUE429_QA_DATABASE_TLS_CA_PEM);
    const acl = verifyIssue429AclSnapshot(await observeIssue429RuntimeAcl(
      ledger.runtime, ledger.admin));
    assert.equal(acl.status, "PASS",
      "Restricted runtime role OCR ACL or PUBLIC-function proof failed.");
    mock = await startIssue429HttpsMock({
      certificate: tls.certificate, privateKey: tls.privateKey,
      expectedToken: token,
    });
    stage = "TWO_PRODUCTION_API_PROCESSES";
    for (let i = 0; i < 2; i += 1) {
      processes.push(await startIssue429ProductionApi({
        distributionPath: artifact.distributionPath,
        runtimeUrl: inputs.runtimeUrl,
        mockEndpoint: mock.endpoint,
        token, caPath: tls.certificatePath,
        databaseCa: process.env.ISSUE429_QA_DATABASE_TLS_CA_PEM,
        root: resolve(root, "apps", "api"),
      }));
    }
    assert.notEqual(processes[0].pid, processes[1].pid,
      "Two separate API OS processes are mandatory.");
    stage = "TWO_TENANT_REAL_HTTPS";
    const before = await observeIssue429Debits(ledger.admin,
      actors.map((actor) => actor.organizationId));
    assureAllowed(await requestIssue429PlateOcr(
      processes[0].origin, actors[0], actors[0].locationId));
    assureAllowed(await requestIssue429PlateOcr(
      processes[1].origin, actors[1], actors[1].locationId));
    assert.equal(mock.snapshot().received, 2,
      "Each production API process must dispatch one real TLS mock request.");
    stage = "AUTH_TENANT_MEDIA_NEGATIVES";
    const negatives = [
      await requestIssue429PlateOcr(processes[1].origin, actors[0],
        actors[1].locationId),
      await requestIssue429PlateOcr(processes[0].origin, actors[0],
        actors[0].locationId, { invalidMime: true }),
      await requestIssue429PlateOcr(processes[1].origin, actors[0],
        actors[0].locationId, { noBearer: true }),
    ];
    assert.ok(negatives.every((result) =>
      result.status >= 400 && result.status < 500));
    assert.equal(mock.snapshot().received, 2,
      "Foreign Location, invalid image and absent bearer must send nothing.");
    stage = "TWO_PROCESS_IDENTITY_RACE";
    mock.setReply({ status: 201, body: { results: [] }, delayMs: 350 });
    const race = await Promise.all([
      requestIssue429PlateOcr(processes[0].origin, actors[2],
        actors[2].locationId),
      requestIssue429PlateOcr(processes[1].origin, actors[2],
        actors[2].locationId),
    ]);
    assert.deepEqual(race.map((result) => result.publicOutcome).sort(),
      ["NO_MATCH", "UNAVAILABLE"]);
    assert.ok(race.every((result) =>
      result.status === 200 && result.noStore && result.publicPayloadSafe));
    const provider = mock.snapshot();
    assert.equal(provider.received, 3,
      "Two independent real API processes bypassed the shared active identity.");
    assert.equal(provider.completed, 3);
    const after = await observeIssue429Debits(ledger.admin,
      actors.map((actor) => actor.organizationId));
    assertDebits(before, after, actors);
    smoke = {
      status: "SMOKE_PASS_ONLY",
      issue: 429,
      sourceSha: artifact.sourceSha,
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
  } finally {
    const attemptedStage = stage;
    stage = "OWNED_CLEANUP";
    const cleanupErrors = [];
    for (const child of processes.reverse()) {
      try { await child.close(); } catch { cleanupErrors.push("api-child"); }
    }
    if (mock) {
      try { await mock.close(); } catch { cleanupErrors.push("https-mock"); }
    }
    if (ledger) {
      try { await ledger.close(); } catch { cleanupErrors.push("pg-clients"); }
    }
    if (tls) {
      try { tls.close(); } catch { cleanupErrors.push("tls-fixture"); }
    }
    try {
      await lease.release();
      released = true;
    } catch { cleanupErrors.push("postgres-lease"); }
    if (cleanupErrors.length) {
      throw new Error(`Owned QA cleanup incomplete: ${cleanupErrors.join(",")}`);
    }
    stage = attemptedStage;
  }
  // Do not leave a PASS report if cleanup/lease release failed.
  if (smoke && released) {
    const path = resolve(root, "tmp", "issue429-qa",
      "production-smoke-redacted.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(smoke, null, 2) + "\n", { flag: "wx" });
    process.stdout.write("Issue429 restricted production HTTPS multiprocess smoke PASS; " +
      "performance and physical-device gates NOT RUN.\n");
  }
}

await main().catch((error) => {
  // Do not print driver/provider errors: they can include environment material.
  const kind = error instanceof assert.AssertionError ? "ASSERTION" : "RUNTIME";
  process.stderr.write(`Issue429 production QA NOT QUALIFIED stage=${stage} kind=${kind}.\n`);
  process.exitCode = 1;
});
