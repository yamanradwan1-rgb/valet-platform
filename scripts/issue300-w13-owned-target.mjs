import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ownDirectory = join(root, "tmp/issue300-r2-w7-v2-owned");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hexSha = /^[a-f0-9]{64}$/;
const gitSha = /^[a-f0-9]{40}$/;
// Prime's V2 fixture issuer key. Private key is held only in ignored Prime files.
const ownerPublicPem = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=
-----END PUBLIC KEY-----
`;
const ownerKey = createPublicKey(ownerPublicPem);
assert.equal(
  sha256(Buffer.from(ownerPublicPem)),
  "7d13ad66aaf979dc269e13ac33a4f557661a8080cee074ce3e64eec922824f22",
);
export const target = Object.freeze({
  database: "issue300_r2_w7_acceptance_v2",
  host: "127.0.0.1",
  port: 58387,
  containerName: "issue300_r2_w7_acceptance_v2_pg17",
  containerLabel: "issue300-r2-w7-acceptance-v2",
  volume: "issue300_r2_w7_acceptance_v2_pgdata",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
});

function fromOwnedDirectory(value, name) {
  assert.equal(typeof value, "string", `Missing ${name}`);
  const path = resolve(value);
  assert.equal(
    dirname(path).toLowerCase(),
    ownDirectory.toLowerCase(),
    `${name} must be in the ignored W7 V2 fixture directory`,
  );
  const bytes = readFileSync(path);
  assert(
    bytes.length > 0 && bytes.length < 262_144,
    `${name} is empty or oversized`,
  );
  return {
    json: JSON.parse(bytes.toString("utf8")),
    sha: sha256(bytes),
    bytes,
  };
}

export function validateDbUrl(raw, role) {
  let url;
  try {
    url = new URL(raw ?? "");
  } catch {
    throw Error("Missing exact owned database connection");
  }
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, target.host);
  assert.equal(url.port, String(target.port));
  assert.equal(url.pathname, `/${target.database}`);
  assert.equal(decodeURIComponent(url.username), role);
  assert(
    url.password && !url.search && !url.hash,
    "Invalid owned database URL",
  );
  return url.href;
}

function ensureOrigin(value, expectedPort) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, String(expectedPort));
  assert.equal(url.pathname, "/");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  return url.origin;
}

export function loadOwnedPlan(env = process.env) {
  assert.equal(env.NODE_ENV, "test");
  assert.equal(
    env.ISSUE300_W13_EXECUTION_ENABLE,
    "1",
    "No HTTP/DB execution without explicit W13 lease handoff",
  );
  const lease = env.ISSUE300_W13_EXCLUSIVE_LEASE;
  const candidate = env.ISSUE300_R2_CANDIDATE_SHA;
  assert.match(lease ?? "", /^issue300-r2-[a-z0-9-]{8,}$/);
  assert.match(candidate ?? "", gitSha);
  const runningSource = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  assert.equal(
    runningSource,
    env.ISSUE300_W13_RUNNER_SHA,
    "W13 test runner SHA differs from pinned, reviewed harness",
  );
  const attestation = fromOwnedDirectory(
    env.ISSUE300_W13_ATTESTATION,
    "attestation",
  );
  assert.match(env.ISSUE300_W13_ATTESTATION_SHA256 ?? "", hexSha);
  assert.equal(
    attestation.sha,
    env.ISSUE300_W13_ATTESTATION_SHA256,
    "Attestation bytes changed since independent issuance",
  );
  const proof = attestation.json;
  assert.equal(proof.mode, "ISOLATED_PROOF_CANDIDATE");
  assert.equal(proof.candidateSha, candidate);
  assert.equal(proof.leaseId, lease);
  for (const [key, value] of Object.entries(target))
    assert.equal(proof[key], value, `Wrong attested ${key}`);
  assert.equal(proof.actualRoleVerified, true);
  assert.equal(proof.migrationsApplied, 96);
  assert.equal(proof.serverVersionNum, 170010);
  assert.equal(
    proof.allowedCohorts?.includes("SIGNED_HTTP_SOURCE_PARENT_CANDIDATE"),
    true,
  );
  assert.match(proof.apiBundleSha256 ?? "", hexSha);
  assert.match(proof.containerId ?? "", hexSha);
  assert.equal(proof.bindHost, "127.0.0.1");
  assert.equal(proof.bindPort, target.port);
  assert.match(proof.resourceManifestSha256 ?? "", hexSha);
  assert.match(proof.migrationLedgerSha256 ?? "", hexSha);
  assert.equal(proof.birthTriggers, 12);
  assert.equal(proof.immutableTriggers, 6);
  assert(
    Date.parse(proof.issuedAt) <= Date.now() &&
      Date.parse(proof.expiresAt) > Date.now() &&
      Date.parse(proof.expiresAt) - Date.parse(proof.issuedAt) <= 900_000,
    "Attestation expired or outside 15-minute authorization interval",
  );
  const manifest = fromOwnedDirectory(
    env.ISSUE300_W13_FIXTURE_MANIFEST,
    "fixture manifest",
  );
  const signature = fromOwnedDirectory(
    env.ISSUE300_W13_FIXTURE_SIGNATURE,
    "fixture signature",
  );
  assert.equal(typeof signature.json?.signatureBase64, "string");
  assert.equal(signature.json?.manifestSha256, manifest.sha);
  assert.equal(
    signature.json?.purpose,
    "ISSUE300_W7_V2_INDEPENDENT_SOURCE_ORACLE",
  );
  assert.equal(
    verify(
      null,
      manifest.bytes,
      ownerKey,
      Buffer.from(signature.json.signatureBase64, "base64"),
    ),
    true,
    "Independent V2 fixture manifest is not signed by Prime",
  );
  const fixture = manifest.json;
  assert.equal(fixture.candidateSha, candidate);
  assert.equal(fixture.leaseId, lease);
  assert.equal(fixture.attestationSha256, attestation.sha);
  assert.equal(
    fixture.writerKind,
    "ACTUAL_DOMAIN_WRITER_PLUS_DISPOSABLE_HELD_SQL",
    "Independent operational domain command receipts are required",
  );
  assert.equal(fixture.oracleSource, "INDEPENDENT_DATABASE_WRITER_ROWS");
  assert.equal(fixture.ownerVerifiedDbReadback, true);
  const receipts = fixture.operationalWriterReceipts;
  assert(Array.isArray(receipts) && receipts.length >= 4);
  for (const source of ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"])
    assert(
      receipts.some(
        (receipt) =>
          receipt.source === source &&
          /^[a-f0-9-]{36}$/.test(receipt.sourceId ?? "") &&
          receipt.actualHttpDomainCommand === true &&
          receipt.independentlyReadBack === true &&
          receipt.httpStatus >= 200 &&
          receipt.httpStatus < 300 &&
          /^\/v1\/staff\/(?:valet-sessions|tasks|check-in)\//.test(
            receipt.path ?? "",
          ),
      ),
      `Missing independently verified operational ${source} writer receipt`,
    );
  assert(Array.isArray(fixture.lanes) && fixture.lanes.length >= 6);
  const enabledApi = ensureOrigin(fixture.enabledApiOrigin, 3167);
  const defaultApi = ensureOrigin(fixture.defaultApiOrigin, 3168);
  const origin = ensureOrigin(fixture.dashboardOrigin, 3117);
  assert.notEqual(enabledApi, defaultApi);
  assert.equal(proof.apiOrigin, enabledApi);
  assert.equal(proof.defaultApiOrigin, defaultApi);
  assert.equal(proof.dashboardOrigin, origin);
  const inspected = JSON.parse(
    execFileSync("docker", ["inspect", target.containerName], {
      encoding: "utf8",
      windowsHide: true,
    }),
  )[0];
  const ports = inspected?.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  assert.equal(inspected?.Id, proof.containerId);
  assert.equal(inspected?.Name, `/${target.containerName}`);
  assert.equal(inspected?.State?.Running, true);
  assert.equal(
    inspected?.Config?.Labels?.["com.vaylet.task"],
    target.containerLabel,
  );
  assert.equal(ports.length, 1);
  assert.equal(ports[0].HostIp, target.host);
  assert.equal(ports[0].HostPort, String(target.port));
  assert(
    inspected.Mounts?.some(
      (mount) =>
        mount.Type === "volume" &&
        mount.Name === target.volume &&
        mount.Destination === "/var/lib/postgresql/data",
    ),
  );
  for (const lane of fixture.lanes) {
    const scope = proof.allowedScopes?.find(
      (allowed) =>
        allowed.organizationId === lane.org &&
        allowed.locationId === lane.location,
    );
    assert(scope, "Fixture scope outside attested Organization/Location");
    for (const existing of lane.preexistingIndirectAuditIds ?? [])
      assert(
        scope.approvedAuditEventIds?.includes(existing),
        "Existing indirect Audit ID absent from attested source readback",
      );
  }
  const credentials = fromOwnedDirectory(
    env.ISSUE300_W13_CREDENTIALS,
    "test-only credentials",
  ).json;
  for (const name of ["ca", "lm", "supervisor", "foreign"])
    assert(
      credentials[name]?.email && credentials[name]?.password,
      `Missing isolated ${name} login fixture`,
    );
  const adminUrl = validateDbUrl(
    env.ISSUE300_W13_FIXTURE_DB_URL,
    target.migrationRole,
  );
  const runtimeUrl = validateDbUrl(
    env.ISSUE300_W13_RUNTIME_DB_URL,
    target.runtimeRole,
  );
  return {
    fixture,
    proof,
    lease,
    candidate,
    origin,
    enabledApi,
    defaultApi,
    adminUrl,
    runtimeUrl,
    credentials,
    ownDirectory,
  };
}
