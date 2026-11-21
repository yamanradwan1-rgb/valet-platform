// PostgreSQL 17 can grant a CREATEROLE migrator an ADMIN-only membership in a
// role it creates. The migrator still has no direct SET/INHERIT execution path,
// but ADMIN remains real delegation authority; accept it only for the explicit
// higher-trust migration edge, never for Runtime or another writer.
import { trustedCreatorAdmin } from "./option-c-bootstrap-creator-admin.mjs";

export async function verifyStaffAuthWriterMembership(client, writer, runtime) {
  const identity = await client.query(
    `SELECT session_user AS migration_role,
            db_owner.rolname AS database_owner
       FROM pg_catalog.pg_database db
       JOIN pg_catalog.pg_roles db_owner ON db_owner.oid=db.datdba
       WHERE db.datname=pg_catalog.current_database()`,
  );
  const migrationRole = identity.rows[0]?.migration_role;
  const databaseOwner = identity.rows[0]?.database_owner;
  if (
    identity.rowCount !== 1 ||
    !migrationRole ||
    !databaseOwner ||
    [writer, runtime].includes(migrationRole)
  ) {
    throw new Error("Staff Auth writer migration identity is unsafe.");
  }
  const result = await client.query(
    `SELECT parent.rolname AS parent,member.rolname AS member,
            grantor.rolname AS grantor,grantor.rolsuper AS grantor_superuser,
            membership.inherit_option,
            membership.set_option,membership.admin_option
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid=membership.member
       JOIN pg_catalog.pg_roles grantor ON grantor.oid=membership.grantor
       WHERE parent.rolname=$1 OR member.rolname=$1`,
    [writer],
  );
  if (
    result.rows.length > 1 ||
    result.rows.some(
      (row) =>
        !trustedCreatorAdmin(row, {
          parent: writer,
          migrationRole,
          databaseOwner,
        }),
    )
  ) {
    throw new Error("Staff Auth writer has an unsafe role membership.");
  }
  const effective = await client.query(
    `SELECT pg_catalog.pg_has_role($1,$2,'SET') AS runtime_set,
            pg_catalog.pg_has_role($1,$2,'USAGE') AS runtime_inherit,
            pg_catalog.pg_has_role($3,$2,'SET') AS migrator_set,
            pg_catalog.pg_has_role($3,$2,'USAGE') AS migrator_inherit,
            pg_catalog.pg_has_role($2,$3,'SET') AS writer_set_migrator,
            pg_catalog.pg_has_role($2,$3,'USAGE') AS writer_inherit_migrator`,
    [runtime, writer, migrationRole],
  );
  if (
    effective.rowCount !== 1 ||
    !effective.rows[0] ||
    Object.values(effective.rows[0]).some((value) => value !== false)
  ) {
    throw new Error("Staff Auth writer SET or inherited authority is unsafe.");
  }
}
