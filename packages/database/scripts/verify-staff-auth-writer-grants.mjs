import { writerTableColumns } from "./staff-auth-writer-grants.mjs";
import { verifyStaffAuthWriterMembership } from "./staff-auth-writer-membership.mjs";

const deniedTable = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const columnsPrivileges = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];

export async function verifyStaffAuthWriterGrants(client, writer, runtime) {
  const identity = await client.query(
    `SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
            rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1`,
    [writer],
  );
  const role = identity.rows[0];
  if (identity.rowCount !== 1 || role?.rolcanlogin !== true ||
      role.rolinherit !== false || role.rolsuper || role.rolcreatedb ||
      role.rolcreaterole || role.rolreplication || role.rolbypassrls) {
    throw new Error("Staff Auth writer role attributes are unsafe.");
  }
  const authorities = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1))
         OR EXISTS (SELECT 1 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=$1))
         OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname=$1))
         OR EXISTS (SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname=$1))
           AS ownership,
       has_database_privilege($1,current_database(),'CREATE') AS database_create,
       has_database_privilege($1,current_database(),'TEMPORARY') AS database_temp,
       has_schema_privilege($1,'public','CREATE') AS schema_create`,
    [writer],
  );
  const scope = authorities.rows[0];
  if (!scope || Object.values(scope).some((value) => value !== false)) {
    throw new Error("Staff Auth writer has inherited or owner authority.");
  }
  await verifyStaffAuthWriterMembership(client, writer, runtime);
  const externalNamespaces = await client.query(
    `SELECT nspname, has_schema_privilege($1,oid,'USAGE') AS can_use,
            has_schema_privilege($1,oid,'CREATE') AS can_create
       FROM pg_namespace WHERE nspname <> 'public'
         AND nspname NOT IN ('pg_catalog','information_schema')
         AND nspname NOT LIKE 'pg_toast%'
         AND nspname NOT LIKE 'pg_temp_%'`,
    [writer],
  );
  if (externalNamespaces.rows.some((namespace) =>
    namespace.can_use || namespace.can_create)) {
    throw new Error("Staff Auth writer can access an unapproved private schema.");
  }
  const inheritedDefaults = await client.query(
    `SELECT d.defaclobjtype, ns.nspname, acl.privilege_type
       FROM pg_default_acl d
       LEFT JOIN pg_namespace ns ON ns.oid=d.defaclnamespace
       CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
       WHERE (d.defaclnamespace=0 OR ns.nspname='public')
         AND (
           acl.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)
           OR (acl.grantee=0 AND acl.privilege_type IN
             ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','USAGE','CREATE'))
         )`,
    [writer],
  );
  if (inheritedDefaults.rows.length !== 0) {
    throw new Error("Staff Auth writer may inherit prohibited default object grants.");
  }
  const tablePrivileges = await client.query(
    `SELECT cls.relname AS table_name, att.attname AS column_name,
            cls.oid::regclass::text AS relation
       FROM pg_class AS cls
       JOIN pg_namespace AS ns ON ns.oid=cls.relnamespace
       LEFT JOIN pg_attribute AS att ON att.attrelid=cls.oid
         AND att.attnum>0 AND NOT att.attisdropped
       WHERE ns.nspname='public' AND cls.relkind IN ('r','p')
       ORDER BY cls.relname, att.attnum`,
  );
  const foundTables = new Set();
  for (const row of tablePrivileges.rows) {
    foundTables.add(row.table_name);
  }
  for (const table of Object.keys(writerTableColumns)) {
    if (!foundTables.has(table)) throw new Error(`Staff Auth writer missing required table ${table}.`);
  }
  const sequences = await client.query(
    `SELECT cls.oid::regclass::text AS relation FROM pg_class cls
       JOIN pg_namespace ns ON ns.oid=cls.relnamespace
       WHERE ns.nspname='public' AND cls.relkind='S'`,
  );
  for (const sequence of sequences.rows) {
    for (const privilege of ['USAGE','SELECT','UPDATE']) {
      const result = await client.query(
        "SELECT has_sequence_privilege($1,$2,$3) AS allowed",
        [writer, sequence.relation, privilege],
      );
      if (result.rows[0]?.allowed !== false) {
        throw new Error("Staff Auth writer can access an unapproved sequence.");
      }
    }
  }
  for (const table of foundTables) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", ...deniedTable]) {
      const result = await client.query(
        "SELECT has_table_privilege($1,$2,$3) AS allowed",
        [writer, `public.${table}`, privilege],
      );
      if (result.rows[0]?.allowed !== false) {
        throw new Error(`Staff Auth writer table-level ${table} ${privilege} privilege is unsafe.`);
      }
    }
  }
  for (const row of tablePrivileges.rows) {
    if (!row.column_name) continue;
    for (const privilege of columnsPrivileges) {
      const result = await client.query(
        "SELECT has_column_privilege($1,$2,$3,$4) AS allowed",
        [writer, row.relation, row.column_name, privilege],
      );
      const expected = (writerTableColumns[row.table_name]?.[privilege] ?? [])
        .includes(row.column_name);
      if (result.rows[0]?.allowed !== expected) {
        throw new Error(`Staff Auth writer ${row.table_name}.${row.column_name} ${privilege} unsafe.`);
      }
    }
  }
  for (const [table, forbidden] of [
    ["staff_auth_sessions", ["INSERT", "DELETE", "TRUNCATE"]],
    ["staff_refresh_credentials", ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]],
  ]) {
    for (const privilege of forbidden) {
      const result = await client.query(
        "SELECT has_table_privilege($1,$2,$3) AS allowed",
        [runtime, `public.${table}`, privilege],
      );
      if (result.rows[0]?.allowed !== false) {
        throw new Error(`Ordinary runtime retains ${table} ${privilege}.`);
      }
    }
    const rows = tablePrivileges.rows.filter((row) => row.table_name === table);
    for (const row of rows) {
      for (const privilege of ["INSERT", "UPDATE"]) {
        const found = await client.query(
          "SELECT has_column_privilege($1,$2,$3,$4) AS allowed",
          [runtime, row.relation, row.column_name, privilege],
        );
        if (found.rows[0]?.allowed !== false) {
          throw new Error(`Ordinary runtime ${table}.${row.column_name} ${privilege} unsafe.`);
        }
      }
    }
  }
  const publicAccess = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_class cls JOIN pg_namespace ns ON ns.oid=cls.relnamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(cls.relacl,acldefault('r',cls.relowner))) acl
       WHERE ns.nspname='public'
         AND cls.relname IN ('staff_auth_sessions','staff_refresh_credentials')
         AND acl.grantee=0 AND acl.privilege_type IN
           ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
     ) OR EXISTS (
       SELECT 1 FROM pg_attribute att JOIN pg_class cls ON cls.oid=att.attrelid
       CROSS JOIN LATERAL aclexplode(att.attacl) acl
       WHERE cls.relname IN ('staff_auth_sessions','staff_refresh_credentials')
         AND acl.grantee=0 AND acl.privilege_type IN ('INSERT','UPDATE','SELECT','REFERENCES')
     ) AS exposed`,
  );
  if (publicAccess.rows[0]?.exposed !== false) {
    throw new Error("PUBLIC retains Staff Auth bearer privileges.");
  }
  const functions = await client.query(
    `SELECT p.oid::regprocedure::text AS signature FROM pg_proc p
       JOIN pg_namespace ns ON ns.oid=p.pronamespace
       WHERE ns.nspname='public' AND p.prosecdef
         AND p.oid NOT IN (
           'public.staff_onboarding_activate(text,text,text)'::regprocedure,
           'public.s04_staff_login_success(uuid,text)'::regprocedure,
           'public.s04_staff_activation_success(uuid,text,text,text)'::regprocedure
         )
         AND has_function_privilege($1,p.oid,'EXECUTE')`,
    [writer],
  );
  if (functions.rows.length !== 0) {
    throw new Error("Staff Auth writer can execute a privileged security-definer function.");
  }
  const unexpectedDirectFunctions = await client.query(
    `SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         p.proacl, pg_catalog.acldefault('f',p.proowner))) acl
       WHERE ns.nspname='public'
         AND acl.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)
         AND acl.privilege_type='EXECUTE'
         AND p.oid NOT IN (
           'public.staff_onboarding_activate(text,text,text)'::regprocedure,
           'public.s04_staff_login_success(uuid,text)'::regprocedure,
           'public.s04_staff_activation_success(uuid,text,text,text)'::regprocedure
         )
       LIMIT 1`, [writer],
  );
  if (unexpectedDirectFunctions.rowCount !== 0) {
    throw new Error("Staff Auth writer has an unapproved direct function grant.");
  }
  const activationAcl = await client.query(
    `SELECT has_function_privilege($1,
       'public.staff_onboarding_activate(text,text,text)', 'EXECUTE') AS writer,
       has_function_privilege($2,
       'public.staff_onboarding_activate(text,text,text)', 'EXECUTE') AS runtime`,
    [writer, runtime],
  );
  if (activationAcl.rows[0]?.writer !== true ||
      activationAcl.rows[0]?.runtime !== false) {
    throw new Error("Staff activation function authority is unsafe.");
  }
  const limiterAcl = await client.query(
    `SELECT has_function_privilege($1,
       'public.s04_staff_login_success(uuid,text)', 'EXECUTE') AS writer,
       has_function_privilege($2,
       'public.s04_staff_login_success(uuid,text)', 'EXECUTE') AS runtime`,
    [writer, runtime],
  );
  if (limiterAcl.rows[0]?.writer !== true ||
      limiterAcl.rows[0]?.runtime !== false) {
    throw new Error("Signed S04 Staff login finalizer authority is unsafe.");
  }
  const activationLimiterAcl = await client.query(
    `SELECT has_function_privilege($1,
       'public.s04_staff_activation_success(uuid,text,text,text)', 'EXECUTE') AS writer,
       has_function_privilege($2,
       'public.s04_staff_activation_success(uuid,text,text,text)', 'EXECUTE') AS runtime`,
    [writer, runtime],
  );
  if (activationLimiterAcl.rows[0]?.writer !== true ||
      activationLimiterAcl.rows[0]?.runtime !== false) {
    throw new Error("S04 Staff activation finalizer authority is unsafe.");
  }
}
