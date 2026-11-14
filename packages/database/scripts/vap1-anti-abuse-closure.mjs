// Post-retirement, same-transaction effective privilege verification.
// No writes, caller-provided SQL identifiers, signer, or proof-bearing grants.
const publicAclQuery = [
  "SELECT pg_catalog.to_regclass('public.anti_abuse_events') IS NOT NULL AS present,",
  "(SELECT count(*)::integer FROM pg_catalog.pg_class c",
  "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
  "CROSS JOIN LATERAL pg_catalog.aclexplode(",
  "COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl",
  "WHERE n.nspname='public' AND c.relname='anti_abuse_events'",
  "AND acl.grantee=0 AND acl.privilege_type IN",
  "('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))",
  "AS public_table_writes,",
  "(SELECT count(*)::integer FROM pg_catalog.pg_attribute a",
  "JOIN pg_catalog.pg_class c ON c.oid=a.attrelid",
  "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
  "CROSS JOIN LATERAL pg_catalog.aclexplode(",
  "COALESCE(a.attacl,ARRAY[]::aclitem[])) acl",
  "WHERE n.nspname='public' AND c.relname='anti_abuse_events'",
  "AND a.attnum>0 AND NOT a.attisdropped",
  "AND acl.grantee=0 AND acl.privilege_type IN",
  "('INSERT','UPDATE','REFERENCES')) AS public_column_writes,",
  "(SELECT count(*)::integer FROM pg_catalog.pg_default_acl d",
  "LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace",
  "CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl",
  "WHERE (n.nspname='public' OR d.defaclnamespace=0)",
  "AND d.defaclobjtype='r'",
  "AND acl.grantee=0 AND acl.privilege_type IN",
  "('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))",
  "AS public_default_writes",
].join(" ");

const ordinaryWriterQuery = [
  "WITH RECURSIVE reachable(login_oid,role_oid) AS (",
  "SELECT r.oid,r.oid FROM pg_catalog.pg_roles r",
  "WHERE r.rolcanlogin AND NOT r.rolsuper AND r.rolname <> current_user",
  "UNION",
  "SELECT reachable.login_oid,m.roleid FROM reachable",
  "JOIN pg_catalog.pg_auth_members m ON m.member=reachable.role_oid",
  // An ADMIN-capable edge may permit later membership SET escalation.
  "WHERE m.set_option OR m.admin_option)",
  "SELECT count(DISTINCT reachable.login_oid)::integer AS ordinary_writers",
  "FROM reachable JOIN pg_catalog.pg_roles r ON r.oid=reachable.role_oid",
  "WHERE (",
  "pg_catalog.has_any_column_privilege(r.rolname,",
  "'public.anti_abuse_events','INSERT') OR",
  "pg_catalog.has_any_column_privilege(r.rolname,",
  "'public.anti_abuse_events','UPDATE') OR",
  "pg_catalog.has_table_privilege(r.rolname,",
  "'public.anti_abuse_events','DELETE') OR",
  "pg_catalog.has_table_privilege(r.rolname,",
  "'public.anti_abuse_events','TRUNCATE') OR",
  "pg_catalog.has_table_privilege(r.rolname,",
  "'public.anti_abuse_events','TRIGGER') OR",
  "pg_catalog.has_table_privilege(r.rolname,",
  "'public.anti_abuse_events','REFERENCES'))",
].join(" ");

export async function assertAntiAbuseAclRetired(client) {
  const publicAcl = await client.query(publicAclQuery);
  const publicRow = publicAcl.rowCount === 1 ? publicAcl.rows[0] : null;
  if (
    publicRow?.present !== true ||
    publicRow.public_table_writes !== 0 ||
    publicRow.public_column_writes !== 0 ||
    publicRow.public_default_writes !== 0
  ) {
    throw new Error(
      "VAP1 C3 anti-abuse PUBLIC/table/column/default ACL is not retired.",
    );
  }
  const ordinaryAcl = await client.query(ordinaryWriterQuery);
  if (
    ordinaryAcl.rowCount !== 1 ||
    ordinaryAcl.rows[0]?.ordinary_writers !== 0
  ) {
    throw new Error(
      "VAP1 C3 anti-abuse ordinary runtime effective write ACL remains.",
    );
  }
  // The executing migration/admin identity is intentionally excluded. Its
  // historical credentials, connected sessions and future reprovisioning
  // MUST be fenced by independently controlled C3/C4 operator validation.
  return { antiAbusePublicAndOrdinaryWrites: "DENIED_BY_QUERIED_ACL" };
}
