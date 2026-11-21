import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";

import { TARGET } from "./target-contract.mjs";

const execFileAsync = promisify(execFile);
const labels = {
  "com.docker.compose.project": TARGET.project,
  "com.docker.compose.service": "postgres",
  "vaylet.environment": "isolated-test",
  "vaylet.issue": "416",
  "vaylet.owner": "worker-9",
  "vaylet.disposable": "true",
};

function refuse(reason) {
  throw new Error(`Issue416 isolated-PG17 Docker attestation refused: ${reason}.`);
}

export function assertDockerIdentity(containers) {
  const c = Array.isArray(containers) && containers.length === 1
    ? containers[0] : undefined;
  if (!c || !/^[a-f0-9]{64}$/.test(c.Id ?? "")) refuse("container ID");
  if (c.Name !== `/${TARGET.container}` || c.Config?.Image !== TARGET.image ||
      c.State?.Running !== true || c.State?.Status !== "running") {
    refuse("container name, image, or runtime state");
  }
  for (const [key, value] of Object.entries(labels)) {
    if (c.Config?.Labels?.[key] !== value) refuse("container ownership labels");
  }
  const env = c.Config?.Env ?? [];
  if (!env.includes(`POSTGRES_USER=${TARGET.owner}`) ||
      !env.includes(`POSTGRES_DB=${TARGET.database}`)) {
    refuse("container database bootstrap identity");
  }
  const expectedPort = [{ HostIp: "127.0.0.1", HostPort: TARGET.port }];
  const binding = c.HostConfig?.PortBindings?.["5432/tcp"];
  const publicPort = c.NetworkSettings?.Ports?.["5432/tcp"];
  for (const ports of [binding, publicPort]) {
    if (!Array.isArray(ports) || ports.length !== 1 ||
        ports[0]?.HostIp !== expectedPort[0].HostIp ||
        ports[0]?.HostPort !== expectedPort[0].HostPort) {
      refuse("non-loopback or incorrect published port");
    }
  }
  const mounts = c.Mounts ?? [];
  const bind = mounts.find((m) => m.Type === "bind" &&
    m.Destination === "/docker-entrypoint-initdb.d/01-issue416-w9-roles.sql");
  const normalizedSource = String(bind?.Source ?? "").replaceAll("\\", "/").toLowerCase();
  if (mounts.length !== 2 || !mounts.some((m) =>
    m.Type === "volume" && m.Name === TARGET.volume &&
    m.Destination === "/var/lib/postgresql/data") ||
    !bind || bind.RW !== false ||
    !normalizedSource.endsWith("/issue416-impl-w9/packages/database/issue416-private/init-roles.sql")) {
    refuse("unexpected or shared volume/bind mounts");
  }
  const networks = Object.keys(c.NetworkSettings?.Networks ?? {});
  if (networks.length !== 1 || networks[0] !== `${TARGET.project}_default`) {
    refuse("container network ownership");
  }
  return Object.freeze({ containerId: c.Id, imageId: c.Image, volume: TARGET.volume });
}

async function inspect(kind, name) {
  const { stdout } = await execFileAsync("docker", ["inspect", "--type", kind, name], {
    encoding: "utf8", timeout: 7_000, windowsHide: true, maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

export async function inspectOwnedDocker() {
  let containers;
  try {
    containers = await inspect("container", TARGET.container);
  } catch {
    refuse("dedicated Docker container is missing or inaccessible");
  }
  const identity = assertDockerIdentity(containers);
  let volumes;
  try {
    volumes = await inspect("volume", TARGET.volume);
  } catch {
    refuse("dedicated named volume missing or inaccessible");
  }
  const v = volumes.length === 1 ? volumes[0] : undefined;
  if (v?.Name !== TARGET.volume || v.Driver !== "local" ||
      v.Labels?.["com.docker.compose.project"] !== TARGET.project ||
      v.Labels?.["com.docker.compose.volume"] !== "issue416_w9_pg_data" ||
      v.Labels?.["vaylet.environment"] !== "isolated-test" ||
      v.Labels?.["vaylet.owner"] !== "worker-9" ||
      v.Labels?.["vaylet.issue"] !== "416" ||
      v.Labels?.["vaylet.disposable"] !== "true") {
    refuse("named volume labels or driver");
  }
  return identity;
}

async function assertAbsent(kind, name) {
  try {
    await inspect(kind, name);
  } catch (error) {
    // Missing resources return a nonzero docker inspect; daemon errors may not.
    if (/No such (?:object|container|volume)/i.test(
      String(error.stderr ?? "") + String(error.message ?? ""))) return;
    refuse(`cannot prove ${kind} absence`);
  }
  refuse(`${kind} name/volume already exists; no automatic overwrite`);
}

async function assertPortFree() {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(Number(TARGET.port), "127.0.0.1", resolve);
    });
  } catch {
    refuse("dedicated loopback port is occupied");
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

// Read-only pre-start gate. A human starts the *new* container after PASS.
export async function preflightBeforeCompose() {
  await assertAbsent("container", TARGET.container);
  await assertAbsent("volume", TARGET.volume);
  let existing;
  try {
    const { stdout } = await execFileAsync("docker", ["ps", "-a", "-q",
      "--filter", `label=com.docker.compose.project=${TARGET.project}`], {
      encoding: "utf8", timeout: 7_000, windowsHide: true,
    });
    existing = stdout.trim();
  } catch {
    refuse("cannot verify the dedicated Compose project is unused");
  }
  if (existing) refuse("existing container belongs to the proposed Compose project");
  await assertPortFree();
}
