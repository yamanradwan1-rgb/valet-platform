import "dotenv/config";

import pg from "pg";

import {
  assertDatabaseCredentialSeparation,
  decodedDatabaseIdentity,
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
  verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";
import { provisionAppendOnlyTablePrivileges } from "./provision-append-only-tables.mjs";
import { provisionOptionCMfaBoundary } from "./mfa-protected-writer-privileges.mjs";
import { provisionRuntimeTablePrivileges } from "./runtime-table-privileges.mjs";
import { verifyRuntimeTablePrivileges } from "./verify-runtime-table-privileges.mjs";
import { assertLegacyRuntimeProvisioningAllowed } from "./vap1-security-privileges.mjs";
import { assertOptionCProvisioningIsLegacy } from "./option-c-runtime-provision-guard.mjs";
import { provisionS04RuntimePrivileges } from "./s04-runtime-privileges.mjs";
import { verifyRuntimeRoleObjectSafety } from "./runtime-role-object-safety.mjs";
import { provisionLegacyStaffSessionLock } from "./option-c-staff-session-lock-acl.mjs";
import {
  requireManagementWriterIdentity,
  provisionManagementWriterPrivileges,
  verifyManagementWriterPrivileges,
} from "./management-writer-privileges.mjs";

const { Client } = pg;

const safeRolePattern = /^[a-z_][a-z0-9_]{0,62}$/;
const safeDatabasePattern = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;

async function formattedStatement(client, format, values) {
  const placeholders = values
    .map((_, index) => `$${index + 2}::text`)
    .join(", ");
  const result = await client.query(
    `SELECT format($1, ${placeholders}) AS statement`,
    [format, ...values],
  );
  const statement = result.rows[0]?.statement;
  if (typeof statement !== "string") {
    throw new Error("Runtime-role provisioning could not construct safe SQL.");
  }
  return statement;
}

async function executeFormatted(client, format, values) {
  await client.query(await formattedStatement(client, format, values));
}

async function provisionRuntimeRole() {
  const migration = parseMigrationDatabaseUrl(
    process.env.MIGRATION_DATABASE_URL,
    process.env.NODE_ENV,
  );
  const runtime = parseRuntimeDatabaseUrlForProvisioning(
    process.env.DATABASE_URL,
  );
  const managementWriter = requireManagementWriterIdentity(
    process.env.MANAGEMENT_WRITER_DATABASE_URL,
    migration,
    runtime,
  );
  const migrationIdentity = decodedDatabaseIdentity(migration);
  const runtimeIdentity = decodedDatabaseIdentity(runtime);
  assertDatabaseCredentialSeparation(migration, runtime, process.env.NODE_ENV);
  const migrationRole = migrationIdentity.role;
  const runtimeRole = runtimeIdentity.role;
  const runtimePassword = runtimeIdentity.password;
  const migrationDatabase = migrationIdentity.database;
  const runtimeDatabase = runtimeIdentity.database;

  if (!safeRolePattern.test(migrationRole)) {
    throw new Error("MIGRATION_DATABASE_URL contains an unsafe role name.");
  }
  if (!safeRolePattern.test(runtimeRole)) {
    throw new Error("DATABASE_URL contains an unsafe runtime role name.");
  }
  if (!safeDatabasePattern.test(migrationDatabase)) {
    throw new Error("MIGRATION_DATABASE_URL contains an unsafe database name.");
  }
  if (migrationDatabase !== runtimeDatabase) {
    throw new Error(
      "MIGRATION_DATABASE_URL and DATABASE_URL must target the same database.",
    );
  }
  if (
    migrationIdentity.host !== runtimeIdentity.host ||
    migrationIdentity.port !== runtimeIdentity.port
  ) {
    throw new Error(
      "MIGRATION_DATABASE_URL and DATABASE_URL must target the same PostgreSQL server.",
    );
  }
  if (runtimePassword === "") {
    throw new Error("DATABASE_URL must contain a runtime role password.");
  }

  const client = new Client(
    migrationClientConfig(migration, process.env.NODE_ENV),
  );
  try {
    await client.connect();
  } catch {
    throw new Error(
      "Runtime-role provisioning could not connect with MIGRATION_DATABASE_URL.",
    );
  }

  try {
    await verifyMigrationConnectionTls(client, process.env.NODE_ENV);
    await client.query("BEGIN");
    await assertLegacyRuntimeProvisioningAllowed(client);
    await assertOptionCProvisioningIsLegacy(client);
    const existingRole = await client.query(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname = $1`,
      [runtimeRole],
    );
    if (existingRole.rowCount === 0) {
      await executeFormatted(
        client,
        "CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
        [runtimeRole, runtimePassword],
      );
    } else {
      const attributes = existingRole.rows[0];
      if (
        attributes.rolsuper === true ||
        attributes.rolcreatedb === true ||
        attributes.rolcreaterole === true ||
        attributes.rolreplication === true ||
        attributes.rolbypassrls === true
      ) {
        throw new Error("Existing runtime role has unsafe role attributes.");
      }
      await executeFormatted(
        client,
        "ALTER ROLE %I WITH LOGIN PASSWORD %L NOINHERIT",
        [runtimeRole, runtimePassword],
      );
    }

    const inheritedRoles = await client.query(
      `SELECT inherited.rolname
       FROM pg_auth_members AS membership
       INNER JOIN pg_roles AS inherited ON inherited.oid = membership.roleid
       INNER JOIN pg_roles AS member ON member.oid = membership.member
       WHERE member.rolname = $1`,
      [runtimeRole],
    );
    for (const inheritedRole of inheritedRoles.rows) {
      await executeFormatted(client, "REVOKE %I FROM %I", [
        inheritedRole.rolname,
        runtimeRole,
      ]);
    }

    await executeFormatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [
      migrationDatabase,
      runtimeRole,
    ]);
    await executeFormatted(
      client,
      "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC",
      [migrationDatabase],
    );
    await executeFormatted(
      client,
      "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I",
      [migrationDatabase, runtimeRole],
    );
    await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON SCHEMA public FROM %I", [
      runtimeRole,
    ]);
    await executeFormatted(client, "GRANT USAGE ON SCHEMA public TO %I", [
      runtimeRole,
    ]);

    await executeFormatted(
      client,
      "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I",
      [runtimeRole],
    );
    await client.query(
      `REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM PUBLIC`,
    );
    await executeFormatted(
      client,
      "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I",
      [runtimeRole],
    );
    await client.query(
      `REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC`,
    );
    await executeFormatted(
      client,
      "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I",
      [runtimeRole],
    );

    await client.query(
      `REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM PUBLIC`,
    );
    await executeFormatted(
      client,
      "REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM %I",
      [runtimeRole],
    );

    await provisionAppendOnlyTablePrivileges(
      client,
      executeFormatted,
      runtimeRole,
    );
    await provisionRuntimeTablePrivileges(
      client,
      executeFormatted,
      runtimeRole,
    );
    await provisionOptionCMfaBoundary(
      client, executeFormatted, runtimeRole, migrationRole,
    );
    await provisionManagementWriterPrivileges(
      client, executeFormatted, managementWriter, runtimeRole,
    );

    await provisionS04RuntimePrivileges(client, executeFormatted, runtimeRole);
    await provisionLegacyStaffSessionLock(client, executeFormatted, runtimeRole);

    await executeFormatted(
      client,
      "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I",
      [migrationRole, runtimeRole],
    );
    await executeFormatted(
      client,
      "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I",
      [migrationRole, runtimeRole],
    );
    await executeFormatted(
      client,
      "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM PUBLIC",
      [migrationRole],
    );
    await executeFormatted(
      client,
      "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I",
      [migrationRole, runtimeRole],
    );

    await verifyRuntimeTablePrivileges(client, runtimeRole);
    await verifyManagementWriterPrivileges(
      client, managementWriter.role, runtimeRole,
    );

    await verifyRuntimeRoleObjectSafety(client, runtimeRole);

    await client.query("COMMIT");
    console.log("VAYLET runtime database role provisioned.");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original provisioning failure without logging credentials.
    }
    throw error;
  } finally {
    await client.end();
  }
}

await provisionRuntimeRole();
