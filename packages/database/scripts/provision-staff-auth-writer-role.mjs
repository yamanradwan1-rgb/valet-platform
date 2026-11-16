/* global process, console */
import "dotenv/config";
import pg from "pg";
import {
  migrationClientConfig,
  verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";
import { readStaffAuthWriterProvisioningConfiguration } from "./staff-auth-writer-provisioning-policy.mjs";
import { applyStaffAuthWriterGrants } from "./staff-auth-writer-grants.mjs";
import { verifyStaffAuthWriterGrants } from "./verify-staff-auth-writer-grants.mjs";

const { Client } = pg;

async function executeFormatted(client, format, values) {
  const placeholders = values
    .map((_, index) => `$${index + 2}::text`)
    .join(", ");
  const result = await client.query(
    `SELECT format($1, ${placeholders}) AS statement`,
    [format, ...values],
  );
  const statement = result.rows[0]?.statement;
  if (typeof statement !== "string")
    throw new Error("Unsafe Staff Auth writer SQL formatting.");
  await client.query(statement);
}

async function provisionStaffAuthWriter() {
  const {
    migration,
    migrationIdentity,
    runtimeIdentity,
    writerIdentity,
    writerRole,
  } = readStaffAuthWriterProvisioningConfiguration(process.env);
  const client = new Client(
    migrationClientConfig(migration, process.env.NODE_ENV),
  );
  try {
    await client.connect();
    await verifyMigrationConnectionTls(client, process.env.NODE_ENV);
    await client.query("BEGIN");
    const role = await client.query(
      "SELECT rolcanlogin FROM pg_roles WHERE rolname=$1",
      [writerRole],
    );
    if (role.rowCount === 0) {
      await executeFormatted(
        client,
        "CREATE ROLE %I WITH LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
        [writerRole, writerIdentity.password],
      );
    } else {
      // Existing unsafe role attributes or memberships are never repaired silently.
      await verifyRoleAttributes(client, writerRole);
      await executeFormatted(client, "ALTER ROLE %I WITH PASSWORD %L", [
        writerRole,
        writerIdentity.password,
      ]);
    }
    await executeFormatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [
      migrationIdentity.database,
      writerRole,
    ]);
    await executeFormatted(
      client,
      "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I",
      [migrationIdentity.database, writerRole],
    );
    await executeFormatted(
      client,
      "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC",
      [migrationIdentity.database],
    );
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await applyStaffAuthWriterGrants(
      client,
      executeFormatted,
      writerRole,
      runtimeIdentity.role,
    );
    for (const objectType of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
      await executeFormatted(
        client,
        `ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON ${objectType} FROM %I`,
        [migrationIdentity.role, writerRole],
      );
    }
    await verifyStaffAuthWriterGrants(
      client,
      writerRole,
      runtimeIdentity.role,
      migrationIdentity.role,
    );
    await client.query("COMMIT");
    console.log("Dedicated Staff Auth writer role provisioned and verified.");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* preserve primary failure */
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function verifyRoleAttributes(client, role) {
  const result = await client.query(
    `SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
            rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1`,
    [role],
  );
  const current = result.rows[0];
  if (
    !current ||
    current.rolcanlogin !== true ||
    current.rolinherit !== false ||
    current.rolsuper ||
    current.rolcreatedb ||
    current.rolcreaterole ||
    current.rolreplication ||
    current.rolbypassrls
  ) {
    throw new Error("Existing Staff Auth writer role has unsafe attributes.");
  }
}

await provisionStaffAuthWriter();
