export async function verifyRuntimeRoleObjectSafety(client, runtimeRole) {
  const roleSecurity = await client.query(
    `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
     FROM pg_roles WHERE rolname = $1`,
    [runtimeRole],
  );
  const flags = roleSecurity.rows[0];
  if (
    flags === undefined ||
    flags.rolsuper === true ||
    flags.rolcreatedb === true ||
    flags.rolcreaterole === true ||
    flags.rolreplication === true ||
    flags.rolbypassrls === true
  ) {
    throw new Error("Runtime database role has unsafe role attributes.");
  }

  const ownedObjects = await client.query(
    `SELECT count(*)::integer AS count
     FROM pg_class AS object
     INNER JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
     INNER JOIN pg_roles AS owner ON owner.oid = object.relowner
     WHERE namespace.nspname = 'public' AND owner.rolname = $1`,
    [runtimeRole],
  );
  if (ownedObjects.rows[0]?.count !== 0) {
    throw new Error("Runtime database role must not own schema objects.");
  }

  const ownedContainers = await client.query(
    `SELECT
       EXISTS (
         SELECT 1
         FROM pg_database AS database
         INNER JOIN pg_roles AS owner ON owner.oid = database.datdba
         WHERE database.datname = current_database() AND owner.rolname = $1
       ) OR EXISTS (
         SELECT 1
         FROM pg_namespace AS namespace
         INNER JOIN pg_roles AS owner ON owner.oid = namespace.nspowner
         WHERE owner.rolname = $1
       ) AS owns_container`,
    [runtimeRole],
  );
  if (ownedContainers.rows[0]?.owns_container === true) {
    throw new Error("Runtime database role must not own database containers.");
  }
}
