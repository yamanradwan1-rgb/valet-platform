import { revokeAllSchemaColumnPrivileges } from "./mfa-protected-writer-acl-provisioning.mjs";

export const mfaProtectedWriterRolePattern = /^[a-z_][a-z0-9_]{0,62}$/;

async function resetRoleMemberships(client, formatted, writerRole) {
  const inherited = await client.query(
    `SELECT parent.rolname FROM pg_catalog.pg_auth_members membership
     JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
     JOIN pg_catalog.pg_roles child ON child.oid=membership.member
     WHERE child.rolname=$1`,
    [writerRole],
  );
  for (const { rolname } of inherited.rows) {
    await formatted(client, "REVOKE %I FROM %I", [rolname, writerRole]);
  }

  const delegated = await client.query(
    `SELECT member.rolname FROM pg_catalog.pg_auth_members membership
     JOIN pg_catalog.pg_roles writer ON writer.oid=membership.roleid
     JOIN pg_catalog.pg_roles member ON member.oid=membership.member
     WHERE writer.rolname=$1`,
    [writerRole],
  );
  for (const { rolname } of delegated.rows) {
    await formatted(client, "REVOKE %I FROM %I", [writerRole, rolname]);
  }
}

async function ensureWriterRole(client, formatted, writer) {
  const role = await client.query(
    `SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
            rolreplication,rolbypassrls
     FROM pg_catalog.pg_roles WHERE rolname=$1`,
    [writer.role],
  );
  if (role.rowCount === 0) {
    await formatted(
      client,
      "CREATE ROLE %I WITH LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      [writer.role, writer.password],
    );
    return;
  }
  const flags = role.rows[0];
  if (
    !flags ||
    flags.rolsuper ||
    flags.rolcreatedb ||
    flags.rolcreaterole ||
    flags.rolreplication ||
    flags.rolbypassrls
  ) {
    throw new Error("Existing MFA writer role has unsafe attributes.");
  }
  await formatted(client, "ALTER ROLE %I WITH LOGIN PASSWORD %L NOINHERIT", [
    writer.role,
    writer.password,
  ]);
}

async function resetSchemaPrivileges(client, formatted, writerRole) {
  const schemas = await client.query(
    "SELECT nspname FROM pg_catalog.pg_namespace " +
      "WHERE nspname NOT IN ('pg_catalog','information_schema') " +
      "AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%' " +
      "ORDER BY nspname",
  );
  for (const { nspname } of schemas.rows) {
    if (nspname !== "public") {
      await formatted(client, "REVOKE ALL ON SCHEMA %I FROM %I", [
        nspname,
        writerRole,
      ]);
    }
    for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
      await formatted(
        client,
        `REVOKE ALL PRIVILEGES ON ALL ${kind} IN SCHEMA %I FROM %I`,
        [nspname, writerRole],
      );
    }
    await revokeAllSchemaColumnPrivileges(
      client,
      formatted,
      writerRole,
      nspname,
    );
  }
}

export async function prepareMfaProtectedWriterRole(
  client,
  formatted,
  writer,
  runtimeRole,
  migrationRole,
) {
  if (
    writer.role === runtimeRole ||
    writer.role === migrationRole ||
    !mfaProtectedWriterRolePattern.test(writer.role) ||
    !writer.password
  ) {
    throw new Error("MFA protected writer identity is unsafe.");
  }
  await ensureWriterRole(client, formatted, writer);
  await resetRoleMemberships(client, formatted, writer.role);

  const database = (await client.query("SELECT current_database() AS db"))
    .rows[0].db;
  await formatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [
    database,
    writer.role,
  ]);
  await formatted(client, "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I", [
    database,
    writer.role,
  ]);
  await formatted(client, "REVOKE ALL ON SCHEMA public FROM %I", [writer.role]);
  await formatted(client, "GRANT USAGE ON SCHEMA public TO %I", [writer.role]);
  await formatted(
    client,
    "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC",
    [migrationRole],
  );
  await resetSchemaPrivileges(client, formatted, writer.role);
}
