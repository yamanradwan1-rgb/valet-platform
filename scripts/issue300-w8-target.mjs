// Test-only attestation; never uses production, human, G2, W6 or old R2 URLs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { readSignedW8Manifest } from "./issue300-w8-owner-root.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenPorts = new Set([57285, 55480, 58385, 3114, 3165]);
const shaPattern = /^[a-f0-9]{40}$/;
const safeId = /^[a-z0-9][a-z0-9_-]{8,63}$/;
const vmOwned = /^issue300-r2-w7-acceptance-[a-z0-9-]+$/;
const dOwned =
  /^D:\\kndoom\\valet-platform\\tmp\\issue300-r2-w7-acceptance-[a-z0-9-]+\\/i;

function bundleDigest() {
  const dir = join(root, "apps/api/dist");
  const files = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink(), "No symlink in attested API artifact");
      const name = join(path, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) files.push(name);
      assert(files.length <= 12_000, "Unexpected API artifact breadth");
    }
  };
  visit(dir);
  assert(files.includes(join(dir, "main.js")), "API bundle missing");
  const h = createHash("sha256");
  for (const name of files.sort()) {
    h.update(name.slice(dir.length + 1).replaceAll("\\", "/")).update("\0");
    h.update(readFileSync(name)).update("\0");
  }
  return h.digest("hex");
}

export function assertTargetManifest(m, env, observed) {
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.ISSUE300_W8_ENABLE, "EXCLUSIVE_TEST_ONLY");
  assert.equal(env.ISSUE300_W8_SINGLE_HEAVY_LEASE, "GRANTED");
  assert.equal(env.ISSUE300_W8_CAPACITY_ATTESTED, "TRUE");
  assert.match(env.ISSUE300_R2_CANDIDATE_SHA ?? "", shaPattern);
  assert.match(
    env.ISSUE300_W8_EXCLUSIVE_LEASE ?? "",
    /^issue300-r2-w8-[a-z0-9-]{12,}$/,
  );
  assert.equal(m.candidateSha, env.ISSUE300_R2_CANDIDATE_SHA);
  assert.equal(m.leaseId, env.ISSUE300_W8_EXCLUSIVE_LEASE);
  assert.equal(m.lease?.owner, "W8");
  assert.equal(m.lease?.exclusive, true);
  assert.equal(m.lease?.id, m.leaseId);
  assert(
    Number.isFinite(Date.parse(m.lease?.issuedAt)) &&
      Date.parse(m.lease?.issuedAt) <= Date.now(),
  );
  assert(
    Number.isFinite(Date.parse(m.lease?.expiresAt)) &&
      Date.parse(m.lease?.expiresAt) > Date.now(),
  );
  assert.match(m.resource?.container ?? "", vmOwned);
  assert.match(
    m.resource?.database ?? "",
    /^issue300_r2_w7_acceptance_[a-z0-9_]+$/,
  );
  assert.match(
    m.resource?.dockerTaskLabel ?? "",
    /^issue300-r2-w7-acceptance$/,
  );
  assert.match(m.resource?.dataPath ?? "", dOwned);
  assert.match(m.resource?.containerId ?? "", /^[a-f0-9]{64}$/);
  assert.match(m.resource?.volumeId ?? "", safeId);
  assert(
    Number.isInteger(m.resource?.dbPort) &&
      m.resource.dbPort >= 58000 &&
      m.resource.dbPort <= 59999 &&
      !forbiddenPorts.has(m.resource.dbPort),
  );
  assert(
    Number.isInteger(m.resource?.apiPort) &&
      m.resource.apiPort >= 32000 &&
      m.resource.apiPort <= 59999 &&
      m.resource.apiPort !== m.resource.dbPort,
  );
  assert(
    Number.isInteger(m.resource?.dashboardPort) &&
      m.resource.dashboardPort >= 32000 &&
      m.resource.dashboardPort <= 59999 &&
      ![m.resource.dbPort, m.resource.apiPort].includes(
        m.resource.dashboardPort,
      ),
  );
  for (const k of ["dbPort", "apiPort", "dashboardPort"])
    assert(!forbiddenPorts.has(m.resource[k]));
  assert.equal(m.resource?.dbHost, "127.0.0.1");
  assert.equal(m.resource?.apiHost, "127.0.0.1");
  assert.equal(m.resource?.dashboardHost, "127.0.0.1");
  assert.equal(
    m.resource?.dedicatedVm,
    true,
    "True cold testing requires owned guest OS cache reset",
  );
  assert.match(m.resource?.vmName ?? "", vmOwned);
  assert.match(m.resource?.vmUuid ?? "", /^[0-9a-f-]{36}$/);
  assert.match(m.resource?.apiBundleSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(m.resource?.schemaMigrations, 96);
  assert.equal(m.resource?.postgresVersion, "17.10");
  assert.equal(m.resource?.migrationChecksumsVerified, true);
  assert.equal(m.resource?.runtimeRoleAttested, true);
  assert.match(
    m.resource?.runtimeRole ?? "",
    /^issue300_r2_w7_[a-z0-9_]+_runtime$/,
  );
  assert.match(
    m.resource?.fixtureRole ?? "",
    /^issue300_r2_w7_[a-z0-9_]+_owner$/,
  );
  assert.equal(m.resource?.exclusiveOwnership, true);
  assert.equal(m.resource?.targetPathOnD, true);
  if (observed) {
    assert.equal(observed.Id, m.resource.containerId);
    assert.equal(observed.Name, "/" + m.resource.container);
    assert.equal(observed.State?.Running, true);
    assert.equal(
      observed.Config?.Labels?.["com.vaylet.task"],
      m.resource.dockerTaskLabel,
    );
    assert.equal(
      observed.Config?.Labels?.["com.vaylet.volume"],
      m.resource.volumeId,
    );
    assert.match(observed.Config?.Image ?? "", /^postgres:17\.10(?:-alpine)?$/);
    const ports = observed.NetworkSettings?.Ports?.["5432/tcp"];
    assert.equal(ports?.length, 1);
    assert.equal(ports[0].HostIp, "127.0.0.1");
    assert.equal(Number(ports[0].HostPort), m.resource.dbPort);
    assert(
      observed.Mounts?.some((mount) => {
        if (mount.Type !== "bind") return false;
        const source = mount.Source.toLowerCase()
          .replaceAll("\\", "/")
          .replace(/^\/(?:run\/desktop\/mnt\/host|host_mnt|host)\/d\//, "d:/")
          .replace(/\/+$/, "");
        const expected = m.resource.dataPath
          .toLowerCase()
          .replaceAll("\\", "/")
          .replace(/\/+$/, "");
        return (
          source === expected &&
          mount.Destination === "/var/lib/postgresql/data" &&
          mount.RW === true
        );
      }),
      "PG data mount must be EXACT owned D path and PGDATA destination",
    );
  }
  return m;
}

export function readTarget() {
  const path = process.env.ISSUE300_W8_RESOURCE_MANIFEST;
  assert(path, "W8 manifest required");
  assert.match(path, dOwned);
  assert.equal(
    basename(path),
    "R2_OWNED_RESOURCE_MANIFEST.json",
    "Only the exact Prime Owner-issued W8 resource manifest is permitted",
  );
  const m = readSignedW8Manifest(path, dirname(resolve(path)));
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert.equal(head, m.candidateSha, "Exact committed candidate must match");
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    "",
    "Never run against uncommitted source",
  );
  assert.equal(
    bundleDigest(),
    m.resource?.apiBundleSha256,
    "Compiled bundle bytes differ from approved exact candidate",
  );
  const container = JSON.parse(
    execFileSync("docker", ["inspect", m.resource?.container], {
      encoding: "utf8",
      windowsHide: true,
    }),
  )[0];
  return assertTargetManifest(m, process.env, container);
}

export function assertOwnedUri(raw, target, kind) {
  const u = new URL(raw);
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.search, "");
  assert.equal(u.hash, "");
  if (kind === "db" || kind === "fixtureDb") {
    assert.equal(Number(u.port), target.resource.dbPort);
    assert.equal(u.pathname, "/" + target.resource.database);
    assert(["postgresql:", "postgres:"].includes(u.protocol));
    assert.equal(
      u.username,
      kind === "db" ? target.resource.runtimeRole : target.resource.fixtureRole,
    );
  } else {
    assert.equal(u.protocol, "http:");
    assert.equal(u.pathname, "/");
    assert.equal(Number(u.port), target.resource[kind + "Port"]);
    assert.equal(u.username, "");
    assert.equal(u.password, "");
  }
  return u;
}
