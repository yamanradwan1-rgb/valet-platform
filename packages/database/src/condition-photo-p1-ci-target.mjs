import { URL } from "node:url";

const deny = () => { throw new Error("Issue 215 CI test service identity mismatch."); };

export function requireIssue215CiUrl(env) {
  const id = env.VAYLET_ISSUE215_CI_POSTGRES_CONTAINER_ID;
  if (
    env.VAYLET_ISSUE215_TEST_TARGET !== "ci" ||
    env.GITHUB_ACTIONS !== "true" || env.GITHUB_JOB !== "postgres" ||
    env.RUNNER_OS !== "Linux" || env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    !/^\d+$/.test(env.GITHUB_RUN_ID ?? "") ||
    !/^[a-f0-9]{64}$/.test(id ?? "")
  ) deny();
  let url;
  try { url = new URL(env.TEST_DATABASE_URL ?? ""); } catch { deny(); }
  if (
    url.protocol !== "postgresql:" || url.hostname !== "localhost" ||
    url.port !== "5432" || url.pathname !== "/valet" ||
    url.username !== "valet" || !url.password || url.search || url.hash
  ) deny();
  return env.TEST_DATABASE_URL;
}

export function assertIssue215CiDockerTarget(targets, env) {
  const target = targets.length === 1 ? targets[0] : undefined;
  const ports = target?.NetworkSettings?.Ports?.["5432/tcp"];
  if (
    target?.Id !== env.VAYLET_ISSUE215_CI_POSTGRES_CONTAINER_ID ||
    target?.Config?.Image !== "postgres:17-alpine" ||
    target?.Config?.Labels?.["vaylet.issue215.disposable"] !== "true" ||
    target?.Config?.Labels?.["vaylet.issue215.run-id"] !== env.GITHUB_RUN_ID ||
    target?.State?.Status !== "running" ||
    !target?.Config?.Env?.includes("POSTGRES_USER=valet") ||
    !target?.Config?.Env?.includes("POSTGRES_DB=valet") ||
    !Array.isArray(ports) || ports.length < 1 || ports.length > 2 ||
    !ports.some((port) => port.HostPort === "5432" &&
      ["0.0.0.0", "127.0.0.1"].includes(port.HostIp)) ||
    ports.some((port) => port.HostPort !== "5432" ||
      !["0.0.0.0", "127.0.0.1", "::"].includes(port.HostIp)) ||
    !target?.Mounts?.some((mount) =>
      mount.Type === "volume" && mount.Destination === "/var/lib/postgresql/data") ||
    target?.Mounts?.some((mount) => mount.Type === "bind")
  ) deny();
}

export function assertIssue215CiLiveIdentity(identity) {
  if (
    identity?.database !== "valet" || identity.actor !== "valet" ||
    identity.session_role !== "valet" || identity.database_owner !== "valet" ||
    identity.port !== 5432 || identity.recovery !== false ||
    identity.can_create_db !== true || identity.can_create_role !== true ||
    identity.accepts_connections !== true ||
    !Number.isInteger(identity.version) ||
    identity.version < 170000 || identity.version >= 180000
  ) deny();
}
