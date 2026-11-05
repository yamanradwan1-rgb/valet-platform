const privateTables = [
  "ocr_platform_control",
  "ocr_organization_control",
  "ocr_budget_periods",
  "ocr_organization_allocations",
  "ocr_attempts",
  "ocr_control_history",
];

const featureFunctions = [
  ["ocr_admit", "public.ocr_admit(uuid,uuid,uuid,integer)", true],
  ["ocr_settle", "public.ocr_settle(uuid,uuid,uuid,uuid,uuid,text,uuid,bigint,text,text,text,text,integer)", true],
  ["ocr_detect_expired", "public.ocr_detect_expired(integer)", false],
];

/** Real PG catalogs; never execute an admission, unknown release or write. */
export async function observeIssue429RuntimeAcl(runtimeClient, adminClient) {
  const role = (await runtimeClient.query(
    "SELECT current_user AS name"
  )).rows[0]?.name;
  if (typeof role !== "string" || !role) {
    throw new Error("Runtime database role was not authenticated.");
  }
  const tablePrivileges = [];
  for (const name of privateTables) {
    const result = await adminClient.query(
      `SELECT to_regclass($1) IS NOT NULL AS exists,
        has_table_privilege($2, $1, 'SELECT') AS can_select,
        has_table_privilege($2, $1, 'INSERT') AS can_insert,
        has_table_privilege($2, $1, 'UPDATE') AS can_update,
        has_table_privilege($2, $1, 'DELETE') AS can_delete,
        has_table_privilege($2, $1, 'TRUNCATE') AS can_truncate`,
      [`public.${name}`, role],
    );
    tablePrivileges.push({ table: name, ...result.rows[0] });
  }
  const functions = [];
  for (const [name, signature, expectedRuntimeExecute] of featureFunctions) {
    const result = await adminClient.query(
      `WITH target AS (SELECT to_regprocedure($1) AS oid)
       SELECT target.oid IS NOT NULL AS exists,
         COALESCE(has_function_privilege($2, target.oid, 'EXECUTE'), FALSE) AS runtime_execute,
         COALESCE(p.prosecdef, FALSE) AS security_definer,
         COALESCE(p.proconfig, ARRAY[]::text[]) AS settings,
         COALESCE(EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(p.proacl,
             acldefault('f',p.proowner))) AS acl
           WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
         ), FALSE) AS public_execute,
         COALESCE(EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(p.proacl,
             acldefault('f',p.proowner))) AS acl
           WHERE acl.grantee<>p.proowner AND acl.is_grantable
         ), FALSE) AS grant_option
       FROM target LEFT JOIN pg_proc AS p ON p.oid=target.oid`,
      [signature, role],
    );
    functions.push({ function: name, expectedRuntimeExecute,
      ...result.rows[0] });
  }
  return { roleVerified: true, tablePrivileges, functions };
}

export function verifyIssue429AclSnapshot(snapshot) {
  const failures = [];
  const tableNames = new Set();
  for (const row of snapshot.tablePrivileges ?? []) {
    if (!privateTables.includes(row.table) || tableNames.has(row.table)) {
      failures.push("unexpected-or-duplicate-private-table");
    }
    tableNames.add(row.table);
    if (row.exists !== true) failures.push(`${row.table}:missing`);
    for (const action of ["can_insert", "can_update", "can_delete", "can_truncate"]) {
      if (row[action] !== false) failures.push(`${row.table}:${action}`);
    }
    if (row.table === "ocr_attempts" || row.table === "ocr_control_history") {
      if (row.can_select !== false) failures.push(`${row.table}:can_select`);
    }
  }
  if (tableNames.size !== privateTables.length ||
      snapshot.tablePrivileges?.length !== privateTables.length) {
    failures.push("private-table-inventory-incomplete");
  }
  const functionNames = new Set();
  for (const row of snapshot.functions ?? []) {
    const contract = featureFunctions.find(([name]) => row.function === name);
    if (!contract || functionNames.has(row.function) ||
        row.expectedRuntimeExecute !== contract[2]) {
      failures.push("unexpected-or-duplicate-function");
    }
    functionNames.add(row.function);
    if (row.exists !== true ||
        row.runtime_execute !== row.expectedRuntimeExecute ||
        row.public_execute !== false ||
        row.grant_option !== false ||
        row.security_definer !== true ||
        !Array.isArray(row.settings) ||
        !row.settings.some((setting) => /^search_path=pg_catalog, ?public$/.test(setting))) {
      failures.push(`${row.function}:privilege-or-function-policy`);
    }
  }
  if (functionNames.size !== featureFunctions.length ||
      snapshot.functions?.length !== featureFunctions.length ||
      snapshot.roleVerified !== true) {
    failures.push("runtime-function-inventory-or-identity-incomplete");
  }
  return { status: failures.length ? "FAIL" : "PASS", failures };
}
