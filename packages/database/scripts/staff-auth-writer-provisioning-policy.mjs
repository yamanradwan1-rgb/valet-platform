import {
  decodedDatabaseIdentity,
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
} from "./database-connection-policy.mjs";

export const staffAuthWriterRole = "vaylet_staff_auth_writer";

export function readStaffAuthWriterProvisioningConfiguration(env) {
  const migration = parseMigrationDatabaseUrl(env.MIGRATION_DATABASE_URL, env.NODE_ENV);
  const ordinary = parseRuntimeDatabaseUrlForProvisioning(env.DATABASE_URL);
  const writer = parseRuntimeDatabaseUrlForProvisioning(
    env.STAFF_AUTH_WRITER_DATABASE_URL, "STAFF_AUTH_WRITER_DATABASE_URL",
  );
  const migrationIdentity = decodedDatabaseIdentity(migration);
  const runtimeIdentity = decodedDatabaseIdentity(ordinary);
  const writerIdentity = decodedDatabaseIdentity(writer);
  const sameTarget = (left, right) =>
    left.host === right.host && left.port === right.port &&
    left.database === right.database;
  if (!sameTarget(migrationIdentity, runtimeIdentity) ||
      !sameTarget(runtimeIdentity, writerIdentity)) {
    throw new Error("Staff Auth writer and runtime must target the migration database/server.");
  }
  if (writerIdentity.role !== staffAuthWriterRole ||
      migrationIdentity.role === writerIdentity.role ||
      runtimeIdentity.role === writerIdentity.role ||
      writerIdentity.password === migrationIdentity.password ||
      writerIdentity.password === runtimeIdentity.password) {
    throw new Error("Staff Auth writer requires an isolated fixed-role credential.");
  }
  return { migration, migrationIdentity, runtimeIdentity, writerIdentity };
}
