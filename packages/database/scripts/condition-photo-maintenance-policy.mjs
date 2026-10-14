import {
  decodedDatabaseIdentity,
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
} from "./database-connection-policy.mjs";

const safeRole = /^[a-z_][a-z0-9_]{0,62}$/;

export function readConditionPhotoMaintenancePolicy(env) {
  const migration = parseMigrationDatabaseUrl(
    env.MIGRATION_DATABASE_URL,
    env.NODE_ENV,
  );
  const apiUrl = parseRuntimeDatabaseUrlForProvisioning(env.DATABASE_URL);
  const maintenanceUrl = parseRuntimeDatabaseUrlForProvisioning(
    env.CONDITION_PHOTO_MAINTENANCE_DATABASE_URL,
    "CONDITION_PHOTO_MAINTENANCE_DATABASE_URL",
  );
  const migrationIdentity = decodedDatabaseIdentity(migration);
  const apiIdentity = decodedDatabaseIdentity(apiUrl);
  const maintenanceIdentity = decodedDatabaseIdentity(maintenanceUrl);
  const maintenanceRole = env.CONDITION_PHOTO_MAINTENANCE_ROLE;
  if (!safeRole.test(maintenanceRole ?? "")) {
    throw new Error("CONDITION_PHOTO_MAINTENANCE_ROLE must name a safe pre-existing role.");
  }
  if (maintenanceRole !== maintenanceIdentity.role) {
    throw new Error("Condition-photo maintenance role must match its database URL.");
  }
  if ([apiIdentity.role, migrationIdentity.role].includes(maintenanceRole)) {
    throw new Error("Condition-photo maintenance role must be isolated from API and migration.");
  }
  const sameTarget = (identity) =>
    identity.database === migrationIdentity.database &&
    identity.host === migrationIdentity.host &&
    identity.port === migrationIdentity.port;
  if (!sameTarget(apiIdentity) || !sameTarget(maintenanceIdentity)) {
    throw new Error("Condition-photo maintenance credentials must use the API migration database target.");
  }
  return { maintenanceRole, migration, migrationIdentity };
}
