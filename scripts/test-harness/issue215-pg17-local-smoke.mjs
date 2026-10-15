// Owned PostgreSQL 17 runtime deadline smoke. Creates only its own ephemeral
// loopback container, and removes exactly that container ID in finally.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const repo = resolve(import.meta.dirname, "../..");
const image = "postgres:17-alpine";
const name = `issue215-worker9-pg17-${randomBytes(5).toString("hex")}`;
const secret = randomBytes(24).toString("hex");
const labels = [
  "--label", "vaylet.issue=215",
  "--label", "vaylet.task=287",
  "--label", "vaylet.owner=issue215-worker9",
];
const docker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", timeout: 15_000, windowsHide: true, stdio: "pipe",
}).trim();

function inspect(id) {
  const containers = JSON.parse(docker("inspect", id));
  if (!Array.isArray(containers) || containers.length !== 1)
    throw new Error("Owned PG17 container identity is unavailable.");
  const own = containers[0];
  const ports = own.NetworkSettings?.Ports?.["5432/tcp"];
  const port = Array.isArray(ports) && ports.length === 1 ? ports[0] : null;
  if (own.Id !== id || own.Name !== `/${name}` ||
      own.Config?.Image !== image ||
      own.Config?.Labels?.["vaylet.issue"] !== "215" ||
      own.Config?.Labels?.["vaylet.task"] !== "287" ||
      own.Config?.Labels?.["vaylet.owner"] !== "issue215-worker9" ||
      own.State?.Status !== "running" ||
      own.Image !== docker("image", "inspect", image, "--format", "{{.Id}}") ||
      port?.HostIp !== "127.0.0.1" ||
      !/^\d{2,5}$/.test(port?.HostPort ?? "") ||
      !own.HostConfig?.Tmpfs?.["/var/lib/postgresql/data"] ||
      !Array.isArray(own.Mounts) || own.Mounts.length !== 0)
    throw new Error("Owned PG17 image, labels, tmpfs or loopback port mismatched.");
  return port.HostPort;
}

let id;
try {
  id = docker(
    "run", "--detach", "--rm", "--name", name,
    ...labels, "--publish", "127.0.0.1::5432",
    "--tmpfs", "/var/lib/postgresql/data:rw,size=134217728",
    "--env", `POSTGRES_PASSWORD=${secret}`, image,
  );
  const port = inspect(id);
  let healthy = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if (docker("exec", id, "pg_isready", "-U", "postgres").includes("accepting connections")) {
        healthy = true;
        break;
      }
    } catch { /* Bootstrap can be in progress. */ }
    await pause(200);
  }
  if (!healthy) throw new Error("Owned PG17 readiness deadline expired.");
  const child = spawnSync(process.execPath, [
    "--import", "tsx", "test/issue215-pg17-runtime-smoke.ts",
  ], {
    cwd: resolve(repo, "apps/api"), windowsHide: true, stdio: "inherit",
    timeout: 60_000,
    env: {
      ...process.env, NODE_ENV: "test", ISSUE215_PG17_CONTAINER_ID: id,
      ISSUE215_PG17_CONTAINER_NAME: name,
      ISSUE215_PG17_IMAGE_ID: docker("image", "inspect", image, "--format", "{{.Id}}"),
      ISSUE215_PG17_DATABASE_URL:
        `postgresql://postgres:${secret}@127.0.0.1:${port}/postgres`,
    },
  });
  if (child.error) throw child.error;
  if (child.status !== 0)
    throw new Error(`PG17 smoke exited ${String(child.status)}.`);
  process.stdout.write("Issue #287 PG17 startup, lease and native guest deadline PASS.\n");
} finally {
  if (id) {
    // Exact ID + task owner label must still match before stopping anything.
    try {
      const owned = JSON.parse(docker("inspect", id))[0];
      if (owned?.Id !== id ||
          owned.Config?.Labels?.["vaylet.owner"] !== "issue215-worker9" ||
          owned.Name !== `/${name}`)
        throw new Error("Unsafe PG17 cleanup identity; leave for investigation.");
      docker("stop", "--time", "3", id);
    } catch (error) {
      process.stderr.write(`PG17 owned cleanup requires inspection: ${String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
