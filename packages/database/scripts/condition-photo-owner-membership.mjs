// PG17 grants CREATEROLE creators an ADMIN-only membership in newly created
// roles. It grants neither SET nor INHERIT, so this is not runtime execution
// authority. Treat only that exact trusted migration-principal grant as safe.
export const photoLockMembershipSql = `
  SELECT granted.rolname AS granted_role,
         member.rolname AS member_role,
         member.rolcreaterole AS member_createrole,
         grantor.rolname AS grantor_role,
         grantor.rolsuper AS grantor_superuser,
         membership.inherit_option,
         membership.set_option,
         membership.admin_option
  FROM pg_auth_members AS membership
  JOIN pg_roles AS granted ON granted.oid=membership.roleid
  JOIN pg_roles AS member ON member.oid=membership.member
  JOIN pg_roles AS grantor ON grantor.oid=membership.grantor
  WHERE granted.rolname=$1 OR member.rolname=$1`;

export function assertPhotoLockOwnerMembership(rows, owner, migrationRole, runtimeRole) {
  if (!Array.isArray(rows) || owner === migrationRole || owner === runtimeRole) {
    throw new Error("Photo lock owner membership is unsafe.");
  }
  if (rows.length === 0) return;
  const row = rows[0];
  if (rows.length !== 1 || row?.granted_role !== owner ||
      row.member_role !== migrationRole ||
      row.member_role === runtimeRole ||
      row.member_createrole !== true ||
      row.grantor_superuser !== true ||
      row.grantor_role === owner ||
      row.grantor_role === migrationRole ||
      row.inherit_option !== false ||
      row.set_option !== false ||
      row.admin_option !== true) {
    throw new Error("Photo lock owner membership is unsafe.");
  }
}
