import { revokeAllTableColumnPrivileges } from "./mfa-protected-writer-acl-provisioning.mjs";

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

/** @internal Exact owner-aware revocation, also tested against synthetic PG17 catalogs. */
export async function resetSchemaPrivileges(client, formatted, writerRole) {
  const schemas = await client.query(
    `SELECT nspname, nspowner=(
       SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user
     ) AS owned
     FROM pg_catalog.pg_namespace
     WHERE nspname NOT IN ('pg_catalog','information_schema')
       AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%'
     ORDER BY nspname`,
  );
  for (const { nspname, owned } of schemas.rows) {
    // SECURITY DEFINER/private proof schemas have independent NOLOGIN owners.
    // Never assume the migrator owns every object in a schema: PostgreSQL
    // rejects REVOKE ALL ON ALL ... when even one owner differs (42501).
    if (nspname !== "public" && owned) {
      await formatted(client, "REVOKE ALL ON SCHEMA %I FROM %I", [
        nspname,
        writerRole,
      ]);
    }
    if (!owned) {
      const reachable = await client.query(
        `SELECT pg_catalog.has_schema_privilege($1,$2,'USAGE') AS usage,
                pg_catalog.has_schema_privilege($1,$2,'CREATE') AS create`,
        [writerRole, nspname],
      );
      // On some supported PostgreSQL 17 clusters public is owned by the
      // pseudo-role pg_database_owner, not the login migrator. It is the one
      // intended writer schema: require USAGE, still forbid CREATE.
      const expectedUsage = nspname === "public";
      if (
        reachable.rowCount !== 1 ||
        reachable.rows[0]?.usage !== expectedUsage ||
        reachable.rows[0]?.create !== false
      )
        throw new Error("MFA writer has foreign-owned schema authority.");
    }
    const relations = await client.query(
      `SELECT relation.relname, relation.relkind,
              relation.relowner=(
                SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user
              ) AS owned,
              CASE WHEN relation.relkind='S'
                THEN pg_catalog.has_sequence_privilege($1,relation.oid,
                  'USAGE,SELECT,UPDATE')
                ELSE pg_catalog.has_table_privilege($1,relation.oid,
                  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
              END AS table_allowed,
              CASE WHEN relation.relkind='S' THEN false
                ELSE pg_catalog.has_any_column_privilege($1,relation.oid,
                  'SELECT,INSERT,UPDATE,REFERENCES')
              END AS column_allowed
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname=$2 AND relation.relkind IN ('r','p','v','m','f','S')
        ORDER BY relation.relname`,
      [writerRole, nspname],
    );
    for (const relation of relations.rows) {
      if (!relation.owned) {
        if (relation.table_allowed || relation.column_allowed)
          throw new Error("MFA writer has foreign-owned relation authority.");
        continue;
      }
      const kind = relation.relkind === "S" ? "SEQUENCE" : "TABLE";
      await formatted(
        client,
        `REVOKE ALL PRIVILEGES ON ${kind} %I.%I FROM %I`,
        [nspname, relation.relname, writerRole],
      );
      if (kind === "TABLE" && relation.relkind !== "m")
        await revokeAllTableColumnPrivileges(
          client,
          formatted,
          writerRole,
          nspname,
          relation.relname,
        );
    }
    const functions = await client.query(
      `SELECT pg_catalog.format('%I.%I(%s)', namespace.nspname, routine.proname,
                pg_catalog.pg_get_function_identity_arguments(routine.oid)) AS signature,
              routine.proowner=(
                SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user
              ) AS owned,
              routine.prosecdef AS security_definer,
              pg_catalog.has_function_privilege($1,routine.oid,'EXECUTE') AS executable,
              EXISTS (
                SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                  routine.proacl,pg_catalog.acldefault('f',routine.proowner)
                )) acl WHERE acl.grantee=(
                  SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1
                ) AND acl.privilege_type='EXECUTE'
              ) AS direct_grant
         FROM pg_catalog.pg_proc routine
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid=routine.pronamespace
        WHERE namespace.nspname=$2 ORDER BY routine.proname,routine.oid`,
      [writerRole, nspname],
    );
    for (const routine of functions.rows) {
      if (!routine.owned) {
        // PostgreSQL gives PUBLIC EXECUTE on harmless SECURITY INVOKER
        // extension functions (e.g. pgcrypto.armor); only a reachable
        // foreign SECURITY DEFINER or an explicit writer grant is unsafe.
        if (
          routine.direct_grant ||
          (routine.security_definer && routine.executable)
        )
          throw new Error(
            `MFA writer can execute foreign-owned function ${routine.signature}.`,
          );
        continue;
      }
      await formatted(client, "REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I", [
        routine.signature,
        writerRole,
      ]);
    }
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
    "ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC",
    [migrationRole],
  );
  await resetSchemaPrivileges(client, formatted, writer.role);
}
