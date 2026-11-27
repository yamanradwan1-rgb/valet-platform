import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checked, execute, pause } from "./issue463-w9-proof-process.mjs";

export const PG17_IMAGE =
  "sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085";

export function createIdentity() {
  const owner = randomUUID();
  const prefix = owner.replaceAll("-", "").slice(0, 12);
  return {
    owner, prefix,
    containerName: `vaylet-issue463-w9-proof-${prefix}`,
    databaseNames: [`issue463_w9_a_${prefix}`, `issue463_w9_b_${prefix}`],
    bootstrapSecret: randomBytes(32).toString("hex"),
    migratorSecret: randomBytes(32).toString("hex"),
    managementSecret: randomBytes(32).toString("hex"),
  };
}

export async function checkLocalDocker() {
  const context = (await checked(["docker", "context", "show"])).stdout.trim();
  const endpoint = (await checked([
    "docker", "context", "inspect", "--format",
    "{{.Endpoints.docker.Host}}",
  ])).stdout.trim();
  if (context !== "desktop-linux" ||
      endpoint !== "npipe:////./pipe/dockerDesktopLinuxEngine")
    throw new Error("Docker engine is not the independently approved local Desktop engine.");
  const localImage = (await checked([
    "docker", "image", "inspect", PG17_IMAGE, "--format", "{{.Id}}",
  ])).stdout.trim();
  if (localImage !== PG17_IMAGE)
    throw new Error("Pinned PG17 image ID differs from reviewed local image.");
}

export async function containerDetails(id) {
  const output = await checked([
    "docker", "inspect", "--format",
    "{{json .}}", id,
  ]);
  return JSON.parse(output.stdout);
}

function verifyOwner(identity, details, requireLoopback = true) {
  if (details.Id !== identity.containerId ||
      details.Name !== `/${identity.containerName}` ||
      details.Image !== PG17_IMAGE ||
      details.Config?.Labels?.["vaylet.issue463.w9.owner"] !== identity.owner ||
      details.Config?.Labels?.["vaylet.issue463.w9.purpose"] !==
        "concurrent-disposable-proof")
    throw new Error("Disposable container identity/labels changed.");
  if (!requireLoopback) return undefined;
  const mapping = details.NetworkSettings?.Ports?.["5432/tcp"];
  if (!Array.isArray(mapping) || mapping.length !== 1 ||
      mapping[0].HostIp !== "127.0.0.1" ||
      !/^\d{4,5}$/.test(mapping[0].HostPort))
    throw new Error("Disposable container is not exclusively on loopback.");
  return Number(mapping[0].HostPort);
}

export async function launchOwned(identity) {
  identity.tmpDirectory = mkdtempSync(join(tmpdir(), "vaylet-issue463-w9-"));
  const envFile = join(identity.tmpDirectory, "postgres.env");
  writeFileSync(envFile,
    `POSTGRES_USER=valet_ci_bootstrap\nPOSTGRES_PASSWORD=${identity.bootstrapSecret}\nPOSTGRES_DB=valet\n`,
    { mode: 0o600 },
  );
  const collisions = (await checked([
    "docker", "ps", "-a", "--filter",
    `name=^/${identity.containerName}$`, "--format", "{{.Names}}",
  ])).stdout.trim();
  if (collisions !== "") throw new Error("Disposable container name collision.");
  const started = await checked([
    "docker", "run", "-d", "--name", identity.containerName,
    "--label", `vaylet.issue463.w9.owner=${identity.owner}`,
    "--label", "vaylet.issue463.w9.purpose=concurrent-disposable-proof",
    "--publish", "127.0.0.1::5432",
    "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,nodev,size=1073741824",
    "--shm-size", "128m",
    "--memory", "2g", "--cpus", "2",
    "--health-cmd", "pg_isready -U valet_ci_bootstrap -d valet",
    "--health-interval", "2s", "--health-timeout", "2s",
    "--health-retries", "15",
    "--env-file", envFile, PG17_IMAGE,
  ], { timeoutMs: 45_000 });
  identity.containerId = started.stdout.trim();
  if (!/^[a-f0-9]{64}$/.test(identity.containerId))
    throw new Error("Docker did not return an exact 64-hex container identity.");
  identity.port = verifyOwner(identity,
    await containerDetails(identity.containerId));
  for (let i = 0; i < 40; i += 1) {
    const details = await containerDetails(identity.containerId);
    verifyOwner(identity, details);
    if (details.State?.Health?.Status === "healthy") return;
    if (details.State?.Status === "exited" ||
        details.State?.Health?.Status === "unhealthy")
      throw new Error("Fresh disposable PG17 container became unhealthy.");
    await pause(1000);
  }
  throw new Error("Disposable PG17 health deadline expired.");
}

export async function ownedPsql(identity, sql, database = "valet") {
  return checked([
    "docker", "exec", "-i", identity.containerId, "psql", "-X",
    "-v", "ON_ERROR_STOP=1", "-U", "valet_ci_bootstrap", "-d", database,
  ], { input: sql + "\n", timeoutMs: 120_000 });
}

export async function destroyOwned(identity) {
  let cleanupVerified = false;
  try {
    if (!identity.containerId) {
      const found = await execute(["docker", "inspect", identity.containerName]);
      if (found.code === 0) {
        const details = JSON.parse(found.stdout)[0];
        if (details?.Config?.Labels?.["vaylet.issue463.w9.owner"] !==
            identity.owner ||
            details?.Image !== PG17_IMAGE ||
            details?.Name !== `/${identity.containerName}`)
          throw new Error("Unattested container name after failed startup.");
        identity.containerId = details.Id;
      }
    }
    if (identity.containerId) {
      verifyOwner(identity, await containerDetails(identity.containerId), false);
      await checked(["docker", "rm", "-f", identity.containerId], {
        timeoutMs: 45_000,
      });
      const observed = await execute([
        "docker", "inspect", identity.containerId,
      ]);
      cleanupVerified = observed.code !== 0 &&
        /No such (object|container)/i.test(observed.stderr);
    } else {
      cleanupVerified = true;
    }
  } finally {
    if (identity.tmpDirectory)
      rmSync(identity.tmpDirectory, { recursive: true, force: true });
  }
  if (!cleanupVerified)
    throw new Error("Owned disposable container removal could not be verified.");
}
