import { isIP } from "node:net";

// Preliminary verifier for an *already separately inspected* disposable target.
// Not a Docker inspector, SQL attestation, or authorization to connect/drop.
const FORBIDDEN_PORTS = new Set([5432, 45432]);
const ID_RE = /^[a-z0-9][a-z0-9_-]{7,62}$/;
const PREFIX = "issue416_w5_";

export function inspectSyntheticTarget(target, observation) {
  const problems = [];
  if (!target || !observation) {
    return Object.freeze({ allowed: false,
      blockers: Object.freeze(["L2_NO_ISOLATED_PG17_ATTESTATION"]) });
  }
  if (target.host !== "127.0.0.1" || isIP(target.host) !== 4 ||
      !Number.isInteger(target.port) || target.port < 40000 ||
      target.port > 65535 || FORBIDDEN_PORTS.has(target.port)) {
    problems.push("L2_UNSAFE_PG_TARGET");
  }
  for (const field of ["project", "container", "database", "runtimeRole",
    "migrationRole", "volume"]) {
    if (typeof target[field] !== "string" ||
        !ID_RE.test(target[field]) ||
        !target[field].startsWith(PREFIX)) {
      problems.push("L2_NONISOLATED_" + field.toUpperCase());
    }
  }
  if (target.runtimeRole === target.migrationRole) {
    problems.push("L2_NOT_SEPARATE_DB_ROLES");
  }
  if (target.database === "vaylet_test" || target.database === "postgres") {
    problems.push("L2_EXISTING_DB_DENIED");
  }
  if (observation.dockerProject !== target.project ||
      observation.container !== target.container ||
      observation.volume !== target.volume ||
      observation.labels?.["vaylet.environment"] !== "isolated-test" ||
      observation.labels?.["vaylet.issue"] !== "416-w5" ||
      observation.image !== "postgres:17-alpine" ||
      observation.exposedHost !== target.host ||
      observation.exposedPort !== target.port) {
    problems.push("L2_DOCKER_IDENTITY_MISMATCH");
  }
  if (observation.serverMajor !== 17 ||
      observation.database !== target.database ||
      observation.runtimeRole !== target.runtimeRole ||
      observation.migrationRole !== target.migrationRole ||
      observation.runtimeIsOwner !== false ||
      observation.migrationIsOwner !== true) {
    problems.push("L2_SQL_IDENTITY_MISMATCH");
  }
  if (observation.exclusiveLease !== "issue416-w5" ||
      observation.cleanChildEnv !== true ||
      observation.noDestructiveHarnessFallback !== true ||
      observation.currentOwnerApproved !== true) {
    problems.push("L2_LEASE_OR_CHILD_ENV_NOT_VERIFIED");
  }
  // A JSON observation can be forged; never call this a live attestation.
  return Object.freeze({
    allowed: problems.length === 0,
    status: problems.length ? "BLOCKED" : "SYNTHETIC_SHAPE_ONLY",
    blockers: Object.freeze(problems),
    needsIndependentDockerAndSqlObservation: true,
  });
}

export function refuseUnattestedPg17Run() {
  throw new Error("L2_NO_VERIFIED_EXCLUSIVE_DISPOSABLE_PG17_LEASE");
}
