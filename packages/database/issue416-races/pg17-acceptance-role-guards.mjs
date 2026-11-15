// Evaluates actual named login privileges, not just ACL grant entries.
// PostgreSQL predefined roles can confer access without relacl/nspacl rows.
export const LOGIN_PRIVILEGES_SQL = `
SELECT r.rolname AS principal, r.rolsuper AS superuser,
 r.rolcreatedb AS can_create_db, r.rolcreaterole AS can_create_role,
 r.rolreplication AS can_replicate,
 r.rolbypassrls AS bypass_rls,
 has_schema_privilege(r.oid,n.oid,'USAGE') AS private_usage,
 has_schema_privilege(r.oid,n.oid,'CREATE') AS private_create,
 has_table_privilege(r.oid,c.oid,'SELECT') AS key_select,
 has_any_column_privilege(r.oid,c.oid,'SELECT') AS key_column_select,
 has_table_privilege(r.oid,c.oid,'INSERT') AS key_insert,
 has_table_privilege(r.oid,c.oid,'UPDATE') AS key_update,
 has_table_privilege(r.oid,c.oid,'DELETE') AS key_delete,
 has_table_privilege(r.oid,c.oid,'MAINTAIN') AS key_maintain
FROM pg_roles r
CROSS JOIN pg_namespace n
JOIN pg_class c ON c.relnamespace=n.oid AND c.relname='proof_keys'
WHERE r.rolcanlogin AND n.nspname='auth_proof_private' AND c.relkind='r'`;

// Catch SET-only chains to privileged predefined roles, including when the
// login has NOINHERIT and has_table_privilege() alone reports false.
export const ELEVATED_MEMBERSHIP_SQL = `
SELECT parent.rolname AS granted_role, member.rolname AS member_role,
 m.inherit_option, m.set_option, m.admin_option
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid=m.roleid
JOIN pg_roles member ON member.oid=m.member
WHERE parent.rolsuper OR parent.rolcreatedb OR parent.rolcreaterole
  OR parent.rolbypassrls OR parent.rolreplication
  OR parent.rolname IN (
 'pg_read_all_data','pg_write_all_data','pg_maintain',
 'pg_read_server_files','pg_write_server_files','pg_execute_server_program'
)`;

export function assertLoginPrivilegeIsolation(logins, elevated, target) {
  const deniedFields = [
    "superuser",
    "can_create_db",
    "can_create_role",
    "can_replicate",
    "bypass_rls",
    "private_usage",
    "private_create",
    "key_select",
    "key_column_select",
    "key_insert",
    "key_update",
    "key_delete",
    "key_maintain",
  ];
  if (
    !target ||
    !["owner", "migrator", "runtime", "login"].every(
      (key) => typeof target[key] === "string" && target[key].length > 0,
    ) ||
    !Array.isArray(elevated) ||
    elevated.length !== 0 ||
    !Array.isArray(logins) ||
    logins.length < 4 ||
    new Set(logins.map((row) => row?.principal)).size !== logins.length ||
    ![target.owner, target.migrator, target.runtime, target.login].every(
      (name) => logins.some((row) => row?.principal === name),
    ) ||
    logins.some(
      (row) =>
        !row ||
        typeof row.principal !== "string" ||
        (![target.owner, target.migrator].includes(row.principal) &&
          deniedFields.some((field) => row[field] !== false)),
    )
  ) {
    throw new Error("W30_PG17_LOGIN_PRIVILEGE_ISOLATION_UNPROVEN");
  }
  return true;
}
