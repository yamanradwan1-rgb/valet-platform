import {
  decodedDatabaseIdentity,
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
} from "./database-connection-policy.mjs";

const safeRolePattern = /^[a-z_][a-z0-9_]{0,62}$/;

function sameTarget(left, right) {
  return (
    left.database === right.database &&
    left.host === right.host &&
    left.port === right.port
  );
}

export function readGuestPushWorkerProvisioningConfiguration(
  env,
  nodeEnv = env.NODE_ENV,
) {
  const migration = parseMigrationDatabaseUrl(env.MIGRATION_DATABASE_URL, nodeEnv);
  const apiRuntime = parseRuntimeDatabaseUrlForProvisioning(
    env.DATABASE_URL,
    "DATABASE_URL",
  );
  const workerRuntime = parseRuntimeDatabaseUrlForProvisioning(
    env.GUEST_PUSH_WORKER_DATABASE_URL,
    "GUEST_PUSH_WORKER_DATABASE_URL",
  );
  const migrationIdentity = decodedDatabaseIdentity(migration);
  const apiIdentity = decodedDatabaseIdentity(apiRuntime);
  const workerIdentity = decodedDatabaseIdentity(workerRuntime);
  const workerRole = env.GUEST_PUSH_WORKER_ROLE;

  if (workerRole === undefined || !safeRolePattern.test(workerRole)) {
    throw new Error("GUEST_PUSH_WORKER_ROLE must name a safe pre-existing role.");
  }
  if (workerRole !== workerIdentity.role) {
    throw new Error(
      "GUEST_PUSH_WORKER_ROLE must match the GUEST_PUSH_WORKER_DATABASE_URL principal.",
    );
  }
  if (workerRole === migrationIdentity.role) {
    throw new Error("Guest Push worker role must differ from the migration role.");
  }
  if (workerRole === apiIdentity.role) {
    throw new Error("Guest Push worker role must differ from the ordinary API role.");
  }
  if (!sameTarget(apiIdentity, migrationIdentity)) {
    throw new Error("DATABASE_URL must target the same database as migration credentials.");
  }
  if (!sameTarget(workerIdentity, migrationIdentity)) {
    throw new Error(
      "GUEST_PUSH_WORKER_DATABASE_URL must target the same database and server as migration credentials.",
    );
  }
  if (!sameTarget(workerIdentity, apiIdentity)) {
    throw new Error(
      "GUEST_PUSH_WORKER_DATABASE_URL must target the same database and server as DATABASE_URL.",
    );
  }

  return {
    apiIdentity,
    migration,
    migrationIdentity,
    workerIdentity,
    workerRole,
  };
}
