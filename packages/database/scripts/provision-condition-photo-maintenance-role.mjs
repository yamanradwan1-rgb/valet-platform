import "dotenv/config";

import pg from "pg";

import {
  migrationClientConfig,
  verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";
import { readConditionPhotoMaintenancePolicy } from "./condition-photo-maintenance-policy.mjs";
import {
  provisionConditionPhotoMaintenancePrivileges,
  verifyConditionPhotoMaintenancePrivileges,
} from "./condition-photo-maintenance-privileges.mjs";

async function executeFormatted(client, format, args) {
  const placeholders = args.map((_, i) => `$${i + 2}::text`).join(", ");
  const result = await client.query(`SELECT format($1, ${placeholders}) AS sql`, [format, ...args]);
  if (typeof result.rows[0]?.sql !== "string") {
    throw new Error("Condition-photo maintenance SQL formatting failed.");
  }
  await client.query(result.rows[0].sql);
}

async function provision() {
  const { migration, migrationIdentity, maintenanceRole } =
    readConditionPhotoMaintenancePolicy(process.env);
  const client = new pg.Client(migrationClientConfig(migration, process.env.NODE_ENV));
  try {
    await client.connect();
  } catch {
    throw new Error("Condition-photo maintenance provisioning could not connect.");
  }
  try {
    await verifyMigrationConnectionTls(client, process.env.NODE_ENV);
    await client.query("BEGIN");
    const role = await client.query(
      `SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
         FROM pg_roles WHERE rolname=$1`,
      [maintenanceRole],
    );
    const flags = role.rows[0];
    if (
      role.rowCount !== 1 || !flags.rolcanlogin || flags.rolsuper || flags.rolcreatedb ||
      flags.rolcreaterole || flags.rolreplication || flags.rolbypassrls
    ) throw new Error("Condition-photo maintenance role is missing or privileged.");
    const member = await client.query(
      `SELECT count(*)::integer AS total FROM pg_auth_members m
       JOIN pg_roles role ON role.oid=m.member WHERE role.rolname=$1`,
      [maintenanceRole],
    );
    if (member.rows[0]?.total !== 0) {
      throw new Error("Condition-photo maintenance role cannot inherit any other role.");
    }
    const owned = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_roles owner ON owner.oid=c.relowner
         WHERE owner.rolname=$1
       ) OR EXISTS (
         SELECT 1 FROM pg_namespace n JOIN pg_roles owner ON owner.oid=n.nspowner
         WHERE owner.rolname=$1
       ) AS owns_objects`,
      [maintenanceRole],
    );
    if (owned.rows[0]?.owns_objects) {
      throw new Error("Condition-photo maintenance role cannot own schema objects.");
    }
    await executeFormatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [
      migrationIdentity.database, maintenanceRole,
    ]);
    await executeFormatted(client, "REVOKE CREATE,TEMPORARY ON DATABASE %I FROM %I", [
      migrationIdentity.database, maintenanceRole,
    ]);
    await executeFormatted(client, "REVOKE ALL ON SCHEMA public FROM %I", [maintenanceRole]);
    await executeFormatted(client, "GRANT USAGE ON SCHEMA public TO %I", [maintenanceRole]);
    for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
      await executeFormatted(
        client,
        `REVOKE ALL PRIVILEGES ON ALL ${kind} IN SCHEMA public FROM %I`,
        [maintenanceRole],
      );
      await executeFormatted(
        client,
        `ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON ${kind} FROM %I`,
        [migrationIdentity.role, maintenanceRole],
      );
    }
    await provisionConditionPhotoMaintenancePrivileges(client, executeFormatted, maintenanceRole);
    await verifyConditionPhotoMaintenancePrivileges(client, maintenanceRole);
    await client.query("COMMIT");
    console.log("VAYLET condition-photo maintenance role provisioned.");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve original error. */ }
    throw error;
  } finally {
    await client.end();
  }
}

await provision();
