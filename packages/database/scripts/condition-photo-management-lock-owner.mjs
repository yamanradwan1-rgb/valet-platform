import {
  managementPhotoLockOwner as owner,
  managementPhotoLockSignature as signature,
  photoReadTables,
} from "./condition-photo-privilege-policy.mjs";

const keyColumns = ["id", "id", "vehicle_photo_id", "vehicle_photo_id"];

/** Runs in the existing migration-role provisioning transaction, after migrate. */
export async function provisionManagementPhotoLockOwner(client, executeFormatted, runtimeRole) {
  const identity = await client.query("SELECT current_user AS name");
  const migrationRole = identity.rows[0]?.name;
  if (!migrationRole || [migrationRole, runtimeRole].includes(owner)) {
    throw new Error("Management photo lock requires a separate migration owner.");
  }
  const fn = await client.query(
    `SELECT p.prosecdef,p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS safe,
            role.rolname AS owner,
            NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS denied
     FROM pg_proc p JOIN pg_roles role ON role.oid=p.proowner
     WHERE p.oid=to_regprocedure($1)`, [signature],
  );
  if (fn.rowCount !== 1 || !fn.rows[0].prosecdef || !fn.rows[0].safe ||
      !fn.rows[0].denied || ![migrationRole, owner].includes(fn.rows[0].owner)) {
    throw new Error("Management photo lock has an untrusted definition/owner.");
  }
  const roles = await client.query(
    `SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,
            rolbypassrls,rolinherit FROM pg_roles WHERE rolname=$1`, [owner],
  );
  const created = roles.rowCount === 0;
  if (created) {
    await executeFormatted(client,
      "CREATE ROLE %I WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
      [owner]);
  } else {
    const role = roles.rows[0];
    if (role.rolcanlogin || role.rolsuper || role.rolcreatedb || role.rolcreaterole ||
        role.rolreplication || role.rolbypassrls || role.rolinherit) {
      throw new Error("Management photo lock owner has privileged role attributes.");
    }
    const member = await client.query(
      `SELECT COUNT(*)::integer AS total FROM pg_auth_members m
       JOIN pg_roles a ON a.oid=m.member JOIN pg_roles b ON b.oid=m.roleid
       WHERE a.rolname=$1 OR b.rolname=$1`, [owner],
    );
    if (member.rows[0]?.total !== 0) throw new Error("Photo lock owner inherits roles.");
  }
  const owned = await client.query(
    `SELECT COUNT(*)::integer AS total FROM pg_proc p
     JOIN pg_roles r ON r.oid=p.proowner WHERE r.rolname=$1
       AND p.oid<>to_regprocedure($2)`, [owner, signature],
  );
  const relations = await client.query(
    `SELECT COUNT(*)::integer AS total FROM pg_class c
     JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname=$1`, [owner],
  );
  if (owned.rows[0]?.total !== 0 || relations.rows[0]?.total !== 0) {
    throw new Error("Management photo lock owner has unrelated objects.");
  }
  await executeFormatted(client, "REVOKE ALL ON SCHEMA public FROM %I", [owner]);
  await executeFormatted(client, "GRANT USAGE,CREATE ON SCHEMA public TO %I", [owner]);
  await executeFormatted(client, "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I", [owner]);
  await executeFormatted(client, "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I", [owner]);
  for (const [index, table] of photoReadTables.entries()) {
    await executeFormatted(client, "GRANT SELECT ON TABLE %s TO %I", [table, owner]);
    await executeFormatted(client, "GRANT UPDATE (%I) ON TABLE %s TO %I", [keyColumns[index], table, owner]);
  }
  // PostgreSQL requires membership of the target owner for ALTER FUNCTION.
  // It is granted and revoked entirely inside this provisioning transaction.
  if (fn.rows[0].owner !== owner) {
    await executeFormatted(client, "GRANT %I TO %I", [owner, migrationRole]);
    await executeFormatted(client, "ALTER FUNCTION %s OWNER TO %I", [signature, owner]);
  }
  await executeFormatted(client, "REVOKE %I FROM %I", [owner, migrationRole]);
  await executeFormatted(client, "REVOKE CREATE ON SCHEMA public FROM %I", [owner]);
  const verified = await client.query(
    `SELECT p.prosecdef,r.rolcanlogin,r.rolinherit,
            has_schema_privilege($1,'public','CREATE') AS can_create,
            (SELECT COUNT(*)::integer FROM pg_auth_members m
             WHERE m.member=r.oid OR m.roleid=r.oid) AS memberships
     FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
     WHERE p.oid=to_regprocedure($2) AND r.rolname=$1`, [owner, signature],
  );
  const row = verified.rows[0];
  if (verified.rowCount !== 1 || !row.prosecdef || row.rolcanlogin ||
      row.rolinherit || row.can_create || row.memberships !== 0) {
    throw new Error("Management photo lock owner provisioning failed.");
  }
}
