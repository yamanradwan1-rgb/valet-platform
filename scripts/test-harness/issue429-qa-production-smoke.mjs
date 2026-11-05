import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireInvocationLease } from "./invocation-lease.mjs";
import { preflightIssue414Phase23HttpBeforeLease } from "./issue414-phase23-http-target.mjs";
import { startIssue429HttpsMock } from "./issue429-qa-https-mock.mjs";
import { releaseIssue429LeaseAfterChildExits } from "./issue429-qa-child-lifecycle.mjs";
import {
  assureIssue429Allowed,
  assertIssue429Debits,
  issue429SmokeEvidence,
  publishIssue429SmokeEvidence,
  releaseIssue429SmokeSnapshot,
} from "./issue429-qa-production-evidence.mjs";
import { createIssue429TlsFixture } from "./issue429-qa-tls-fixture.mjs";
import {
  checkIssue429ProductionInputs,
  inspectIssue429QaDocker,
  readIssue429SyntheticActors,
} from "./issue429-qa-production-target.mjs";
import {
  buildIssue429FreshArtifact,
  releaseIssue429FreshArtifact,
  verifyIssue429FreshArtifact,
} from "./issue429-qa-source-build.mjs";
import {
  observeIssue429Debits,
  openIssue429Ledger,
  requestIssue429PlateOcr,
  startIssue429ProductionApi,
} from "./issue429-qa-production-ops.mjs";
import {
  observeIssue429RuntimeAcl,
  verifyIssue429AclSnapshot,
} from "./issue429-qa-runtime-acl.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
let stage = "PRECHECK";

async function main() {
  stage = "INPUT_FENCE";
  const inputs = checkIssue429ProductionInputs(process.env, root);
  const actors = readIssue429SyntheticActors(
    inputs.fixturePath,
    new URL(inputs.runtimeUrl).pathname.slice(1),
  );
  stage = "DOCKER_IDENTITY";
  inspectIssue429QaDocker();
  stage = "PG17_PREFLIGHT";
  await preflightIssue414Phase23HttpBeforeLease();
  stage = "FRESH_SOURCE_BUILD";
  const artifact = buildIssue429FreshArtifact(
    process.env.ISSUE429_QA_BUILD_SHA,
    root,
  );
  let result;
  const lifecycle = {
    leaseAcquired: false,
    leaseReleased: false,
    allChildExitsConfirmed: false,
    cleanupErrors: [],
  };
  try {
    result = await runValidatedSmoke(artifact, inputs, actors, lifecycle);
  } finally {
    releaseIssue429SmokeSnapshot(lifecycle, () =>
      releaseIssue429FreshArtifact(artifact, root),
    );
  }
  if (result) publishIssue429SmokeEvidence(root, result);
}

async function runValidatedSmoke(artifact, inputs, actors, lifecycle) {
  stage = "RECHECK_TARGET_BEFORE_EXCLUSIVE_LEASE";
  inspectIssue429QaDocker();
  await preflightIssue414Phase23HttpBeforeLease();
  verifyIssue429FreshArtifact(artifact, root);
  stage = "EXCLUSIVE_LEASE";
  const lease = await acquireInvocationLease("issue429-qa-production", {
    selectedProjects: ["api-postgres-race"],
  });
  lifecycle.leaseAcquired = true;
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
    ledger = await openIssue429Ledger(
      inputs.adminUrl,
      inputs.runtimeUrl,
      process.env.ISSUE429_QA_DATABASE_TLS_CA_PEM,
    );
    const acl = verifyIssue429AclSnapshot(
      await observeIssue429RuntimeAcl(ledger.runtime, ledger.admin),
    );
    assert.equal(
      acl.status,
      "PASS",
      "Restricted runtime role OCR ACL or PUBLIC-function proof failed.",
    );
    mock = await startIssue429HttpsMock({
      certificate: tls.certificate,
      privateKey: tls.privateKey,
      expectedToken: token,
    });
    stage = "TWO_PRODUCTION_API_PROCESSES";
    for (let i = 0; i < 2; i += 1) {
      verifyIssue429FreshArtifact(artifact, root);
      await startIssue429ProductionApi({
        distributionPath: artifact.distributionPath,
        runtimeUrl: inputs.runtimeUrl,
        mockEndpoint: mock.endpoint,
        token,
        caPath: tls.certificatePath,
        databaseCa: process.env.ISSUE429_QA_DATABASE_TLS_CA_PEM,
        root: resolve(artifact.buildRoot, "apps", "api"),
        onSpawn: (owner) => processes.push(owner),
      });
      verifyIssue429FreshArtifact(artifact, root);
    }
    assert.notEqual(
      processes[0].pid,
      processes[1].pid,
      "Two separate API OS processes are mandatory.",
    );
    stage = "TWO_TENANT_REAL_HTTPS";
    const before = await observeIssue429Debits(
      ledger.admin,
      actors.map((actor) => actor.organizationId),
    );
    assureIssue429Allowed(
      await requestIssue429PlateOcr(
        processes[0].origin,
        actors[0],
        actors[0].locationId,
      ),
    );
    assureIssue429Allowed(
      await requestIssue429PlateOcr(
        processes[1].origin,
        actors[1],
        actors[1].locationId,
      ),
    );
    assert.equal(
      mock.snapshot().received,
      2,
      "Each production API process must dispatch one real TLS mock request.",
    );
    stage = "AUTH_TENANT_MEDIA_NEGATIVES";
    const negatives = [
      await requestIssue429PlateOcr(
        processes[1].origin,
        actors[0],
        actors[1].locationId,
      ),
      await requestIssue429PlateOcr(
        processes[0].origin,
        actors[0],
        actors[0].locationId,
        { invalidMime: true },
      ),
      await requestIssue429PlateOcr(
        processes[1].origin,
        actors[0],
        actors[0].locationId,
        { noBearer: true },
      ),
    ];
    assert.ok(
      negatives.every((result) => result.status >= 400 && result.status < 500),
    );
    assert.equal(
      mock.snapshot().received,
      2,
      "Foreign Location, invalid image and absent bearer must send nothing.",
    );
    stage = "TWO_PROCESS_IDENTITY_RACE";
    mock.setReply({ status: 201, body: { results: [] }, delayMs: 350 });
    const race = await Promise.all([
      requestIssue429PlateOcr(
        processes[0].origin,
        actors[2],
        actors[2].locationId,
      ),
      requestIssue429PlateOcr(
        processes[1].origin,
        actors[2],
        actors[2].locationId,
      ),
    ]);
    assert.deepEqual(race.map((result) => result.publicOutcome).sort(), [
      "NO_MATCH",
      "UNAVAILABLE",
    ]);
    assert.ok(
      race.every(
        (result) =>
          result.status === 200 && result.noStore && result.publicPayloadSafe,
      ),
    );
    const provider = mock.snapshot();
    assert.equal(
      provider.received,
      3,
      "Two independent real API processes bypassed the shared active identity.",
    );
    assert.equal(provider.completed, 3);
    const after = await observeIssue429Debits(
      ledger.admin,
      actors.map((actor) => actor.organizationId),
    );
    assertIssue429Debits(before, after, actors);
    verifyIssue429FreshArtifact(artifact, root);
    smoke = issue429SmokeEvidence({
      artifact,
      processes,
      acl,
      provider,
      before,
      after,
      actors,
      negatives,
    });
  } finally {
    const attemptedStage = stage;
    stage = "OWNED_CLEANUP";
    const cleanupErrors = [];
    for (const child of processes.reverse()) {
      try {
        await child.close();
      } catch {
        cleanupErrors.push("api-child");
      }
    }
    const allChildExitsConfirmed = processes.every((child) =>
      child.exitConfirmed(),
    );
    lifecycle.allChildExitsConfirmed = allChildExitsConfirmed;
    lifecycle.cleanupErrors = cleanupErrors;
    if (!allChildExitsConfirmed)
      cleanupErrors.push("unconfirmed-api-child-exit");
    if (mock) {
      try {
        await mock.close();
      } catch {
        cleanupErrors.push("https-mock");
      }
    }
    if (ledger) {
      try {
        await ledger.close();
      } catch {
        cleanupErrors.push("pg-clients");
      }
    }
    if (tls) {
      try {
        tls.close();
      } catch {
        cleanupErrors.push("tls-fixture");
      }
    }
    try {
      await releaseIssue429LeaseAfterChildExits(
        lease,
        processes,
        cleanupErrors,
      );
      released = true;
      lifecycle.leaseReleased = true;
    } catch {
      cleanupErrors.push("exclusive-pg-lease-not-released");
    }
    if (cleanupErrors.length) {
      throw new Error(
        `Owned QA cleanup incomplete: ${cleanupErrors.join(",")}`,
      );
    }
    stage = attemptedStage;
  }
  if (smoke && released) verifyIssue429FreshArtifact(artifact, root);
  return smoke && released ? smoke : null;
}

await main().catch((error) => {
  const kind = error instanceof assert.AssertionError ? "ASSERTION" : "RUNTIME";
  process.stderr.write(
    `Issue429 production QA NOT QUALIFIED stage=${stage} kind=${kind}.\n`,
  );
  process.exitCode = 1;
});
