import {
  runtimeSessionSelectColumns,
  staffSessionLockFunction,
  staffSessionLockOwner,
  staffSessionLockOwnerColumns,
} from "./option-c-staff-session-lock-contract.mjs";
import { trustedCreatorAdmin } from "./option-c-bootstrap-creator-admin.mjs";

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
  if (result.rowCount === 0)
    throw new Error(`Staff session lock table ${table} is missing.`);
  return result.rows.map(({ column_name }) => column_name);
}

async function assertOwnerRole(
  client,
  runtimeRole,
  migrationRole,
  protectedRoles,
) {
  const metadata = await client.query(
    `SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
            rolreplication,rolbypassrls
       FROM pg_catalog.pg_roles WHERE rolname=$1`,
    [staffSessionLockOwner],
  );
  const role = metadata.rows[0];
  if (
    metadata.rowCount !== 1 ||
    !role ||
    role.rolcanlogin ||
    role.rolinherit ||
    role.rolsuper ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    role.rolbypassrls
  ) {
    throw new Error("Staff session lock owner attributes are unsafe.");
  }
  const database = await client.query(
    `SELECT owner.rolname AS database_owner
       FROM pg_catalog.pg_database database
       JOIN pg_catalog.pg_roles owner ON owner.oid=database.datdba
       WHERE database.datname=pg_catalog.current_database()`,
  );
  const databaseOwner = database.rows[0]?.database_owner;
  const authority = await client.query(
    `SELECT has_database_privilege($1,current_database(),'CREATE') AS db_create,
            has_database_privilege($1,current_database(),'TEMPORARY') AS db_temp,
            has_schema_privilege($1,'public','USAGE') AS schema_usage,
            has_schema_privilege($1,'public','CREATE') AS schema_create,
            EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba=
              (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)) AS owns_database`,
    [staffSessionLockOwner],
  );
  const capability = authority.rows[0];
  if (
    !capability ||
    capability.db_create ||
    capability.db_temp ||
    capability.schema_usage !== true ||
    capability.schema_create ||
    capability.owns_database
  ) {
    throw new Error(
      "Staff session lock owner CREATE/ownership authority is unsafe.",
    );
  }
  const memberships = await client.query(
    `SELECT parent.rolname AS parent,member.rolname AS member,
            grantor.rolname AS grantor,grantor.rolsuper AS grantor_superuser,
            membership.inherit_option,
            membership.set_option,membership.admin_option
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid=membership.member
       JOIN pg_catalog.pg_roles grantor ON grantor.oid=membership.grantor
       WHERE parent.rolname=$1 OR member.rolname=$1`,
    [staffSessionLockOwner],
  );
  const seen = new Set();
  for (const row of memberships.rows) {
    const migratorSet =
      row.parent === staffSessionLockOwner &&
      row.member === migrationRole &&
      row.inherit_option === false &&
      row.set_option === true &&
      row.admin_option === false &&
      [migrationRole, databaseOwner].includes(row.grantor);
    const ownerAdmin = trustedCreatorAdmin(row, {
      parent: staffSessionLockOwner,
      migrationRole,
      databaseOwner,
    });
    const key = `${row.parent}|${row.member}|${row.grantor}`;
    if ((!migratorSet && !ownerAdmin) || seen.has(key)) {
      throw new Error(
        "Staff session lock owner membership inventory is unsafe.",
      );
    }
    seen.add(key);
  }
  for (const roleName of protectedRoles) {
    const access = await client.query(
      `SELECT pg_catalog.pg_has_role($1,$2,'SET') AS can_set,
              pg_catalog.pg_has_role($1,$2,'USAGE') AS can_inherit`,
      [roleName, staffSessionLockOwner],
    );
    if (access.rows[0]?.can_set || access.rows[0]?.can_inherit) {
      throw new Error(
        `Option C role ${roleName} can assume the session lock owner.`,
      );
    }
  }
  if (!protectedRoles.includes(runtimeRole)) {
    throw new Error("Runtime is missing from the protected role inventory.");
  }
}

export async function assertOwnerObjects(client) {
  const objects = await client.query(
    `SELECT 'function' AS kind,namespace.nspname AS schema,function.proname AS name,
            function.oid=pg_catalog.to_regprocedure($2) AS exact_signature
       FROM pg_catalog.pg_proc function
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid=function.pronamespace
       WHERE function.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)
       UNION ALL
       SELECT 'relation',namespace.nspname,relation.relname,false
       FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
       WHERE relation.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)
       UNION ALL
       SELECT 'schema',namespace.nspname,namespace.nspname,false
       FROM pg_catalog.pg_namespace namespace
       WHERE namespace.nspowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)`,
    [staffSessionLockOwner, staffSessionLockFunction],
  );
  const exact =
    objects.rows.length === 1 &&
    objects.rows[0]?.kind === "function" &&
    objects.rows[0]?.schema === "public" &&
    objects.rows[0]?.name === "staff_auth_lock_current_session" &&
    objects.rows[0]?.exact_signature === true;
  if (!exact)
    throw new Error("Staff session lock owner object inventory is unsafe.");
}

async function assertExactColumns(client, role, table, expected) {
  const columns = await tableColumns(client, table);
  for (const privilege of ["SELECT", "UPDATE", "INSERT", "REFERENCES"]) {
    const tableLevel = await client.query(
      "SELECT has_table_privilege($1,$2,$3) AS allowed",
      [role, `public.${table}`, privilege],
    );
    if (tableLevel.rows[0]?.allowed !== false) {
      throw new Error(`${role} has table-level ${table} ${privilege}.`);
    }
    const allowed = new Set(expected[privilege] ?? []);
    for (const column of columns) {
      const access = await client.query(
        "SELECT has_column_privilege($1,$2,$3,$4) AS allowed",
        [role, `public.${table}`, column, privilege],
      );
      if (access.rows[0]?.allowed !== allowed.has(column)) {
        throw new Error(`${role} ${table}.${column} ${privilege} is unsafe.`);
      }
    }
  }
  const maintain = await client.query(
    "SELECT has_table_privilege($1,$2,'MAINTAIN') AS allowed",
    [role, `public.${table}`],
  );
  if (maintain.rows[0]?.allowed !== false) {
    throw new Error(`${role} has table-level ${table} MAINTAIN.`);
  }
}

export async function assertFunctionAcl(
  client,
  runtimeRole,
  protectedRoles,
  { requireRuntimeExecute = true,allowFeedbackReaderExecutor = false } = {},
) {
  const metadata = await client.query(
    `SELECT function.prosecdef,owner.rolname AS owner,function.proconfig,
            NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
              function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_denied
       FROM pg_catalog.pg_proc function JOIN pg_catalog.pg_roles owner
         ON owner.oid=function.proowner
       WHERE function.oid=pg_catalog.to_regprocedure($1)`,
    [staffSessionLockFunction],
  );
  const row = metadata.rows[0];
  if (
    metadata.rowCount !== 1 ||
    row?.prosecdef !== true ||
    row.owner !== staffSessionLockOwner ||
    row.public_denied !== true ||
    !Array.isArray(row.proconfig) ||
    row.proconfig.length !== 1 ||
    row.proconfig[0] !== "search_path=pg_catalog"
  ) {
    throw new Error("Staff session lock function metadata is unsafe.");
  }
  const acl = await client.query(
    `SELECT COALESCE(grantee.rolname,'PUBLIC') AS grantee,entry.is_grantable
       FROM pg_catalog.pg_proc function
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         function.proacl,pg_catalog.acldefault('f',function.proowner))) entry
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=entry.grantee
       WHERE function.oid=pg_catalog.to_regprocedure($1)
         AND entry.privilege_type='EXECUTE'`,
    [staffSessionLockFunction],
  );
  const explicitRuntime = acl.rows.filter(
    ({ grantee }) => grantee === runtimeRole,
  );
  const runtimeInventorySafe = requireRuntimeExecute
    ? explicitRuntime.length === 1 && explicitRuntime[0]?.is_grantable === false
    : explicitRuntime.length === 0 ||
      (explicitRuntime.length === 1 &&
        explicitRuntime[0]?.is_grantable === false);
  const feedbackReader = "vaylet_rating_feedback_reader_owner";
  const explicitFeedback = acl.rows.filter(
    ({grantee})=>grantee===feedbackReader,
  );
  const feedbackInventorySafe = allowFeedbackReaderExecutor
    ? explicitFeedback.length===1 &&
      explicitFeedback[0]?.is_grantable===false
    : explicitFeedback.length===0;
  if (
    !runtimeInventorySafe ||
    !feedbackInventorySafe ||
    acl.rows.some(
      ({ grantee }) =>
        grantee !== runtimeRole && grantee !== staffSessionLockOwner &&
        grantee !== feedbackReader,
    )
  ) {
    throw new Error("Staff session lock EXECUTE inventory is unsafe.");
  }
  if(allowFeedbackReaderExecutor){
    const access=await client.query(
      "SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",
      [feedbackReader,staffSessionLockFunction],
    );
    if(access.rowCount!==1||access.rows[0]?.allowed!==true)
      throw new Error("Staff session lock feedback reader EXECUTE is unsafe.");
  }
  for (const role of protectedRoles) {
    const access = await client.query(
      "SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",
      [role, staffSessionLockFunction],
    );
    const expected =
      role === runtimeRole
        ? requireRuntimeExecute || explicitRuntime.length === 1
        : false;
    if (access.rows[0]?.allowed !== expected) {
      throw new Error(`Staff session lock EXECUTE is unsafe for ${role}.`);
    }
  }
}

export async function verifyStaffSessionLockAcl(
  client,
  runtimeRole,
  migrationRole,
  protectedRoles,
  options = {},
) {
  await assertOwnerRole(client, runtimeRole, migrationRole, protectedRoles);
  await assertOwnerObjects(client);
  for (const [table, expected] of Object.entries(
    staffSessionLockOwnerColumns,
  )) {
    await assertExactColumns(client, staffSessionLockOwner, table, expected);
  }
  await assertExactColumns(client, runtimeRole, "staff_auth_sessions", {
    SELECT: runtimeSessionSelectColumns,
    UPDATE: [],
  });
  await assertFunctionAcl(client, runtimeRole, protectedRoles, options);
}
