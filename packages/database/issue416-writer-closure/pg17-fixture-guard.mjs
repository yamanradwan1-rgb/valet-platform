// Never infer fixture ownership from a URL, server version, or port alone.
// Dedicated W26 container attestation must precede any PostgreSQL connection.
import { execFileSync } from "node:child_process";
import { URL } from "node:url";

const expectedLabels = Object.freeze({
  "vaylet.issue": "416",
  "vaylet.owner": "issue416-w26-20261114",
  "vaylet.environment": "isolated-test",
  "vaylet.disposable": "true",
});

export function assertW26Fixture(args, inspected, inherited = {}) {
  if (args?.purpose !== "PROBE" && args?.purpose !== "REPEAT_CUTOVER") {
    throw new Error("W26_PG17_EXPLICIT_PURPOSE_REQUIRED");
  }
  if (
    !/^[a-z_][a-z0-9_]{0,62}$/.test(args?.role ?? "") ||
    !/^issue416_w26_(?:db|acl_corrected)$/.test(args?.database ?? "") ||
    args?.container !== "vaylet-issue416-w26-20261114-pg17" ||
    !/^[a-f0-9]{64}$/.test(args?.containerId ?? "")
  ) {
    throw new Error("W26_PG17_FIXTURE_IDENTITY_REQUIRED");
  }
  let target;
  try {
    target = new URL(args.url);
  } catch {
    throw new Error("W26_PG17_INVALID_URL");
  }
  const port = Number(target.port);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "127.0.0.1" ||
    !Number.isSafeInteger(port) ||
    port < 50000 ||
    port > 65535 ||
    port !== 51126 ||
    decodeURIComponent(target.pathname) !== "/" + args.database ||
    !target.username ||
    !target.password ||
    target.search ||
    target.hash
  ) {
    throw new Error("W26_PG17_TARGET_MUST_BE_DEDICATED_LOOPBACK");
  }
  for (const envName of [
    "DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "TEST_DATABASE_URL",
  ]) {
    const value = inherited[envName];
    if (!value) continue;
    let old;
    try {
      old = new URL(value);
    } catch {
      throw new Error("W26_PG17_INHERITED_TARGET_UNVERIFIABLE");
    }
    if (
      old.hostname === target.hostname &&
      old.port === target.port &&
      decodeURIComponent(old.pathname) === target.pathname
    ) {
      throw new Error("W26_PG17_TARGET_COLLIDES_WITH_EXISTING_DB");
    }
  }
  if (
    !Array.isArray(inspected) ||
    inspected.length !== 1 ||
    inspected[0]?.Id !== args.containerId ||
    inspected[0]?.Name !== "/" + args.container ||
    inspected[0]?.State?.Running !== true ||
    inspected[0]?.Config?.Image !== "postgres:17-alpine"
  ) {
    throw new Error("W26_PG17_UNEXPECTED_CONTAINER");
  }
  for (const [name, expected] of Object.entries(expectedLabels)) {
    if (inspected[0]?.Config?.Labels?.[name] !== expected) {
      throw new Error("W26_PG17_UNOWNED_CONTAINER");
    }
  }
  const ports = inspected[0]?.NetworkSettings?.Ports?.["5432/tcp"];
  if (
    !Array.isArray(ports) ||
    ports.length !== 1 ||
    ports[0].HostIp !== "127.0.0.1" ||
    ports[0].HostPort !== String(port)
  ) {
    throw new Error("W26_PG17_UNSAFE_PORT_MAPPING");
  }
  if (
    args.purpose === "REPEAT_CUTOVER" &&
    args.mutationConsent !== "W26_DISPOSABLE_C3_REVOKE_TWICE"
  ) {
    throw new Error("W26_PG17_CUTOVER_OPT_IN_REQUIRED");
  }
  return {
    database: args.database,
    runtimeRole: args.role,
    purpose: args.purpose,
  };
}

export function inspectW26Container(name) {
  if (name !== "vaylet-issue416-w26-20261114-pg17") {
    throw new Error("W26_PG17_CONTAINER_NAME_REJECTED");
  }
  try {
    const bytes = execFileSync(
      "docker",
      ["inspect", "--type", "container", name],
      {
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 128 * 1024,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return JSON.parse(bytes);
  } catch {
    throw new Error("W26_PG17_DOCKER_ATTESTATION_UNAVAILABLE");
  }
}
