import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

export const P7_IMAGE =
  "sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085";
export const P7_OWNER_LABEL = "vaylet.issue463.browser.owner";
const dockerEngine = "npipe:////./pipe/dockerDesktopLinuxEngine";
const forbiddenPorts = new Set([5432, 45432, 55416, 55568, 55673]);

function docker(args, input, allowFailure = false) {
  const result = spawnSync("docker", args, {
    encoding: "utf8", input, timeout: 30000, windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && !allowFailure)) {
    throw new Error("Issue463 Docker command failed: " + args[0] + ".");
  }
  return result;
}

export function assertLocalDocker() {
  if (["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"].some(
    (name) => process.env[name] !== undefined,
  )) throw new Error("Issue463 refuses externally configured Docker endpoints.");
  const name = docker(["context", "show"]).stdout.trim();
  const host = docker([
    "context", "inspect", "--format", "{{.Endpoints.docker.Host}}",
  ]).stdout.trim();
  if (name !== "desktop-linux" || host !== dockerEngine) {
    throw new Error("Issue463 requires the exact local Docker Desktop Linux context.");
  }
  if (docker(["image", "inspect", P7_IMAGE, "--format", "{{.Id}}"])
    .stdout.trim() !== P7_IMAGE) {
    throw new Error("Issue463 exact pinned PG17 image is unavailable.");
  }
}

function assertOwnedIdentity(info, id, owner) {
  const name = "vaylet-issue463-prime-p7-" + owner.slice(0, 12);
  const tmpfs = info?.HostConfig?.Tmpfs ?? {};
  if (
    !/^[a-f0-9]{64}$/.test(id) ||
    info?.Id !== id || info.Name !== "/" + name ||
    info.Image !== P7_IMAGE ||
    info.Config?.Labels?.[P7_OWNER_LABEL] !== owner ||
    info.Config?.Labels?.["vaylet.disposable"] !== "true" ||
    info.HostConfig?.RestartPolicy?.Name !== "no" ||
    (info.HostConfig?.Binds?.length ?? 0) !== 0 ||
    !Object.hasOwn(tmpfs, "/var/lib/postgresql/data") ||
    (info.Mounts ?? []).some((mount) => mount.Type !== "tmpfs") ||
    info.HostConfig?.NetworkMode !== "bridge"
  ) throw new Error("Issue463 owned Docker container attestation failed.");
}

export function assertOwnedContainer(info, id, owner) {
  assertOwnedIdentity(info, id, owner);
  const ports = info?.NetworkSettings?.Ports?.["5432/tcp"];
  if (info.State?.Status !== "running" ||
      !Array.isArray(ports) || ports.length !== 1 ||
      ports[0]?.HostIp !== "127.0.0.1") {
    throw new Error("Issue463 owned Docker loopback-only PG port not attested.");
  }
  const port = Number(ports[0].HostPort);
  if (!Number.isInteger(port) || port <= 1024 || port > 65535 ||
    forbiddenPorts.has(port)) {
    throw new Error("Issue463 Docker mapped port is not isolated.");
  }
  return port;
}

function inspect(id) {
  const raw = docker(["inspect", id]).stdout;
  const result = JSON.parse(raw);
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error("Issue463 Docker inspect returned ambiguous identity.");
  }
  return result[0];
}

function psql(id, sql, db = "postgres") {
  return docker([
    "exec", "-i", id, "psql", "-X", "-Atq",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db,
  ], sql).stdout.trim();
}

export async function createOwnedPg17(owner, adminPassword, rememberAllocation) {
  assertLocalDocker();
  if (!/^[0-9a-f]{32}$/.test(owner) ||
    !/^[A-Za-z0-9_-]{43}$/.test(adminPassword)) {
    throw new Error("Issue463 owner/password format invalid.");
  }
  const name = "vaylet-issue463-prime-p7-" + owner.slice(0, 12);
  const existing = docker(["inspect", name], undefined, true);
  if (existing.status === 0 || existing.status !== 1 ||
      !/No such object:/i.test(existing.stderr ?? "")) {
    throw new Error("Issue463 container name not demonstrably unused.");
  }
  const id = docker([
    "run", "-d", "--rm", "--pull=never", "--restart=no",
    "--name", name,
    "--label", P7_OWNER_LABEL + "=" + owner,
    "--label", "vaylet.disposable=true",
    "--network", "bridge",
    "--tmpfs", "/var/lib/postgresql/data:rw,size=1g",
    "-p", "127.0.0.1::5432",
    "-e", "POSTGRES_PASSWORD=" + adminPassword,
    P7_IMAGE,
  ]).stdout.trim();
  // Keep id even when initial attestation fails; cleanup requires re-attestation.
  rememberAllocation({ id, name });
  return { id, name, port: assertOwnedContainer(inspect(id), id, owner) };
}

export async function bootstrapOwnedDatabase(target, owner, passwords) {
  const id = target.id;
  const db = "issue463_p7_" + owner.slice(0, 12);
  const migrator = "issue463_p7_migrator";
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const probe = docker([
      "exec", id, "pg_isready", "-h", "127.0.0.1",
      "-p", "5432", "-U", "postgres",
    ], undefined, true);
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await delay(350);
  }
  if (!ready) throw new Error("Issue463 isolated PG17 did not become ready.");
  const version = Number(psql(id,
    "SELECT current_setting('server_version_num');"));
  if (!Number.isInteger(version) || version < 170000 || version >= 180000) {
    throw new Error("Issue463 target PostgreSQL major version differs.");
  }
  const existing = psql(id,
    "SELECT count(*) FROM pg_roles WHERE rolname='issue463_p7_migrator';");
  if (existing !== "0") throw new Error("Issue463 newly created PG role already exists.");
  psql(id, "CREATE ROLE " + migrator +
    " LOGIN PASSWORD '" + passwords.migrator +
    "' NOINHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS;" +
    " GRANT pg_monitor TO " + migrator +
    " WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;");
  psql(id, "CREATE DATABASE " + db + " OWNER " + migrator + ";");
  const systemId = psql(id,
    "SELECT system_identifier::text FROM pg_control_system();");
  if (!/^\d{15,20}$/.test(systemId)) {
    throw new Error("Issue463 PostgreSQL system identifier is invalid.");
  }
  return { database: db, systemId, version };
}

export function removeOwnedContainer(target, owner, invoke = docker) {
  if (!target?.id) return;
  const before = invoke(["inspect", target.id], undefined, true);
  if (before.status !== 0) {
    if (before.status === 1 &&
        /No such object:/i.test(before.stderr ?? "")) return;
    throw new Error("Issue463 cleanup cannot confirm owned container identity.");
  }
  assertOwnedIdentity(JSON.parse(before.stdout)[0], target.id, owner);
  invoke(["rm", "-f", target.id]);
  const gone = invoke(["inspect", target.id], undefined, true);
  if (gone.status !== 1 ||
      !/No such object:/i.test(gone.stderr ?? "")) {
    throw new Error("Issue463 owned container cleanup was not verified.");
  }
}
