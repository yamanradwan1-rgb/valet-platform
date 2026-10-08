import "dotenv/config";

import pg from "pg";

import {
  migrationClientConfig,
  verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";
import {
  provisionGuestPushWorkerPrivileges,
  verifyGuestPushWorkerPrivileges,
} from "./guest-push-worker-runtime-privileges.mjs";
import { readGuestPushWorkerProvisioningConfiguration } from "./guest-push-worker-provisioning-policy.mjs";

const { Client } = pg;

async function formattedStatement(client, format, values) {
  const placeholders = values.map((_, index) => `$${index + 2}::text`).join(", ");
  const result = await client.query(
    `SELECT format($1, ${placeholders}) AS statement`,
    [format, ...values],
  );
  const statement = result.rows[0]?.statement;
  if (typeof statement !== "string") {
    throw new Error("Guest Push worker provisioning could not construct safe SQL.");
  }
  return statement;
}

async function executeFormatted(client, format, values) {
  await client.query(await formattedStatement(client, format, values));
}

async function provisionGuestPushWorkerRole() {
  const { migration, migrationIdentity, workerRole } =
    readGuestPushWorkerProvisioningConfiguration(process.env);

  const client = new Client(migrationClientConfig(migration, process.env.NODE_ENV));
  try {
    await client.connect();
  } catch {
    throw new Error("Guest Push worker provisioning could not connect with migration credentials.");
  }

  try {
    await verifyMigrationConnectionTls(client, process.env.NODE_ENV);
    await client.query("BEGIN");
    const roleResult = await client.query(
      `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
              rolreplication, rolbypassrls
         FROM pg_roles WHERE rolname = $1`,
      [workerRole],
    );
    const role = roleResult.rows[0];
    if (
      roleResult.rowCount !== 1 ||
      role?.rolcanlogin !== true ||
      role.rolsuper === true ||
      role.rolcreatedb === true ||
      role.rolcreaterole === true ||
      role.rolreplication === true ||
      role.rolbypassrls === true
    ) {
      throw new Error("Guest Push worker role is missing or has unsafe attributes.");
    }
    const inheritance = await client.query(
      `SELECT count(*)::integer AS count
         FROM pg_auth_members AS membership
         INNER JOIN pg_roles AS member ON member.oid = membership.member
        WHERE member.rolname = $1`,
      [workerRole],
    );
    if (inheritance.rows[0]?.count !== 0) {
      throw new Error("Guest Push worker role must not inherit another role.");
    }
    const ownership = await client.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM pg_class object
           INNER JOIN pg_namespace namespace ON namespace.oid=object.relnamespace
           INNER JOIN pg_roles owner ON owner.oid=object.relowner
           WHERE namespace.nspname='public' AND owner.rolname=$1
         ) OR EXISTS (
           SELECT 1 FROM pg_namespace namespace
           INNER JOIN pg_roles owner ON owner.oid=namespace.nspowner
           WHERE owner.rolname=$1
         ) AS owns_objects`,
      [workerRole],
    );
    if (ownership.rows[0]?.owns_objects === true) {
      throw new Error("Guest Push worker role must not own application objects.");
    }

    await executeFormatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [
      migrationIdentity.database,
      workerRole,
    ]);
    await executeFormatted(client, "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I", [
      migrationIdentity.database,
      workerRole,
    ]);
    await executeFormatted(client, "REVOKE ALL ON SCHEMA public FROM %I", [workerRole]);
    await executeFormatted(client, "GRANT USAGE ON SCHEMA public TO %I", [workerRole]);
    for (const objectType of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
      await executeFormatted(
        client,
        `REVOKE ALL PRIVILEGES ON ALL ${objectType} IN SCHEMA public FROM %I`,
        [workerRole],
      );
    }
    await provisionGuestPushWorkerPrivileges(client, executeFormatted, workerRole);
    for (const objectType of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
      await executeFormatted(
        client,
        `ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON ${objectType} FROM %I`,
        [migrationIdentity.role, workerRole],
      );
    }
    await verifyGuestPushWorkerPrivileges(client, workerRole);
    await client.query("COMMIT");
    console.log("VAYLET Guest Push worker role privileges provisioned.");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original provisioning error without exposing credentials.
    }
    throw error;
  } finally {
    await client.end();
  }
}

await provisionGuestPushWorkerRole();
