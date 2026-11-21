// Actual PG17 effective privileges, NOT credential/protocol acceptance.
async function one(client, sql, params, subject) {
  const result = await client.query(sql, params);
  if (result.rowCount !== 1 || !result.rows?.[0]) {
    throw new Error("W26_PG17_" + subject + "_UNVERIFIED");
  }
  return result.rows[0];
}

export async function inspectEffectivePg17Privileges(client, role) {
  const roleFlags = await one(
    client,
    "SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole," +
      "rolbypassrls,rolreplication FROM pg_catalog.pg_roles WHERE rolname=$1",
    [role],
    "ROLE",
  );
  const membership = await one(
    client,
    "SELECT (SELECT count(*)::integer FROM pg_catalog.pg_auth_members m " +
      "JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname=$1) AS outward, " +
      "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m " +
      "JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE r.rolname=$1) AS inbound, " +
      "(SELECT count(*)::integer FROM pg_catalog.pg_stat_activity a " +
      "WHERE a.usename=$1) AS sessions, " +
      "(SELECT count(*)::integer FROM pg_catalog.pg_prepared_xacts p " +
      "WHERE p.owner=$1) AS prepared",
    [role],
    "ROLE_MEMBERSHIP",
  );
  const effective = await one(
    client,
    "SELECT " +
      "pg_catalog.has_schema_privilege($1,'public','USAGE') AS public_schema_usage, " +
      "pg_catalog.has_table_privilege($1,'public.anti_abuse_events','SELECT') AS table_sel, " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','state','UPDATE') AS state_upd, " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','group_key_hash','UPDATE') AS group_upd, " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','scope','INSERT') AS scope_ins, " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','key_hash','INSERT') AS key_ins, " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','state','INSERT') AS state_ins, " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','group_key_hash','INSERT') AS group_ins, " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','request_class','INSERT') AS class_ins, " +
      "pg_catalog.has_table_privilege($1,'public.anti_abuse_events','DELETE') AS del, " +
      "pg_catalog.has_table_privilege($1,'public.anti_abuse_events','TRUNCATE') AS trunc, " +
      "pg_catalog.has_function_privilege($1," +
      "'public.cleanup_expired_anti_abuse_events()','EXECUTE') AS cleanup_execute",
    [role],
    "EFFECTIVE_ACL",
  );
  const publicAcl = await one(
    client,
    "SELECT " +
      "(SELECT count(*)::integer FROM pg_catalog.pg_class c " +
      "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace " +
      "CROSS JOIN LATERAL pg_catalog.aclexplode(" +
      "CASE WHEN COALESCE(pg_catalog.array_length(c.relacl,1),0)>0 " +
      "THEN c.relacl ELSE pg_catalog.acldefault('r',c.relowner) END) a " +
      "WHERE n.nspname='public' AND c.relname='anti_abuse_events' AND " +
      "a.grantee=0 AND a.privilege_type IN " +
      "('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) AS table_writes, " +
      "(SELECT count(*)::integer FROM pg_catalog.pg_attribute p " +
      "JOIN pg_catalog.pg_class c ON c.oid=p.attrelid " +
      "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace " +
      "CROSS JOIN LATERAL pg_catalog.aclexplode(" +
      "CASE WHEN COALESCE(pg_catalog.array_length(p.attacl,1),0)>0 " +
      "THEN p.attacl ELSE pg_catalog.acldefault('c',c.relowner) END) a " +
      "WHERE n.nspname='public' AND c.relname='anti_abuse_events' " +
      "AND p.attnum>0 AND NOT p.attisdropped AND a.grantee=0 " +
      "AND a.privilege_type IN ('INSERT','UPDATE','REFERENCES')) AS column_writes",
    [],
    "PUBLIC_ACL",
  );
  const ordinary = await one(
    client,
    "SELECT count(*)::integer AS login_writers FROM pg_catalog.pg_roles r " +
      "WHERE r.rolcanlogin AND NOT r.rolsuper AND r.rolname<>current_user " +
      "AND (pg_catalog.has_any_column_privilege(r.rolname," +
      "'public.anti_abuse_events','INSERT') OR " +
      "pg_catalog.has_any_column_privilege(r.rolname," +
      "'public.anti_abuse_events','UPDATE') OR " +
      "pg_catalog.has_table_privilege(r.rolname," +
      "'public.anti_abuse_events','DELETE') OR " +
      "pg_catalog.has_table_privilege(r.rolname," +
      "'public.anti_abuse_events','TRUNCATE'))",
    [],
    "OTHER_ORDINARY_ACL",
  );
  for (const value of [
    ...Object.values(roleFlags),
    ...Object.values(membership),
    ...Object.values(effective),
    ...Object.values(publicAcl),
    ...Object.values(ordinary),
  ]) {
    if (value === null || value === undefined) {
      throw new Error("W26_PG17_NULL_ACL_OBSERVATION");
    }
  }
  return {
    roleFlags,
    membership,
    effective,
    publicAcl,
    ordinary,
    // Presence of effective SQL rights is NOT proof of mounted API/Guest
    // functionality, caller identity, or a trusted purpose-bound writer.
    // Staff reserve/count/finalize and Guest classified reserve/read/group
    // binding each require their exact SQL privilege footprint.
    legacyStaffAuthSqlAclPresent: [
      effective.public_schema_usage,
      effective.table_sel,
      effective.scope_ins,
      effective.key_ins,
      effective.state_ins,
      effective.state_upd,
    ].every((right) => right === true),
    legacyGuestClassifiedSqlAclPresent: [
      effective.public_schema_usage,
      effective.table_sel,
      effective.scope_ins,
      effective.key_ins,
      effective.state_ins,
      effective.class_ins,
      effective.group_ins,
      effective.group_upd,
      effective.state_upd,
    ].every((right) => right === true),
    legacyRuntimeReadinessSqlAclPresent: [
      effective.public_schema_usage,
      effective.table_sel,
      effective.scope_ins,
      effective.key_ins,
      effective.state_ins,
      effective.class_ins,
      effective.group_ins,
      effective.state_upd,
      effective.group_upd,
      effective.cleanup_execute,
    ].every((right) => right === true),
    mountedFunctionalityVerified: false,
    trustedWriterVerified: false,
  };
}
