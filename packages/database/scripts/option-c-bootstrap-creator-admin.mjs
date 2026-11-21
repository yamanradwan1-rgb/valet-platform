/**
 * PostgreSQL 17 may auto-grant the creator of a new role ADMIN while direct
 * SET and INHERIT remain false. Its grantor may be the cluster bootstrap
 * superuser rather than the migration user/database owner.
 *
 * ADMIN is real administrative authority: the grantee can delegate membership
 * options (including SET) to another role. We accept this edge only for the
 * explicitly higher-trust migration principal; it must never be interpreted as
 * proof that the migrator is unable to escalate or delegate protected access.
 */
export function trustedCreatorAdmin(
  row,
  { parent, migrationRole, databaseOwner },
) {
  return (
    row.parent === parent &&
    row.member === migrationRole &&
    row.inherit_option === false &&
    row.set_option === false &&
    row.admin_option === true &&
    (row.grantor === migrationRole ||
      row.grantor === databaseOwner ||
      row.grantor_superuser === true)
  );
}
