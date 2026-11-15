import { verifyS04RuntimePrivileges } from "./s04-runtime-privileges.mjs";
import { assertOptionCRevocationIsMonotonic } from "./option-c-protected-cutover-revocation.mjs";
import { verifyManagementWriterPrivileges } from "./management-writer-privileges.mjs";
import { verifyOptionCManagementBodies } from "./option-c-protected-cutover-management-bodies.mjs";
import { revokeUnexpectedFunctionExecutors } from "./option-c-protected-cutover-executor-revocation.mjs";
import { verifyOptionCRoleIsolation } from "./option-c-protected-cutover-roles.mjs";
import { optionCRoles } from "./option-c-protected-cutover-state.mjs";

const tableMutationContract = Object.freeze({
  staff_auth_sessions: { INSERT: [], UPDATE: ["revoked_at"] },
  staff_refresh_credentials: { INSERT: [], UPDATE: [] },
  user_mfa_totp_factors: { INSERT: [], UPDATE: [] },
  mfa_recovery_codes: { INSERT: [], UPDATE: [] },
  anti_abuse_events: { INSERT: [], UPDATE: [] },
});

export const optionCFunctionContract = Object.freeze({
  staffAuth: [
    "public.staff_onboarding_activate(text,text,text)",
    "public.s04_staff_login_success(uuid,text)",
    "public.s04_staff_activation_success(uuid,text,text,text)",
  ],
  mfa: ["public.s04_mfa_success(uuid,text,text)"],
  management: [
    "public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_role)",
    "public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_status)",
    "public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean)",
    "public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text)",
    "public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text)",
  ],
  retiredManagement: [
    "public.staff_management_set_role(uuid,uuid,uuid,integer,public.membership_role)",
    "public.staff_management_set_status(uuid,uuid,uuid,integer,public.membership_status)",
    "public.staff_management_set_location_access(uuid,uuid,uuid,integer,uuid[],boolean)",
    "public.staff_onboarding_create(uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text)",
    "public.staff_onboarding_resend(uuid,uuid,uuid,uuid,text,text)",
  ],
  mfaActivity:
    "mfa_activity_private.touch_admin_activity(uuid,uuid,text,uuid,integer,text,bigint,bytea)",
});

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table],
  );
  if (result.rowCount === 0) throw new Error(`Option C required table ${table} is missing.`);
  return result.rows.map(({ column_name }) => column_name);
}

async function revokeColumn(client, formatted, role, table, privilege, column) {
  const format = role === "PUBLIC"
    ? `REVOKE ${privilege} (%I) ON TABLE public.%I FROM PUBLIC`
    : `REVOKE ${privilege} (%I) ON TABLE public.%I FROM %I`;
  const values = role === "PUBLIC" ? [column, table] : [column, table, role];
  await formatted(client, format, values);
}

export async function retireOptionCLegacyAcl(client, formatted, runtimeRole) {
  for (const [table, contract] of Object.entries(tableMutationContract)) {
    const columns = await tableColumns(client, table);
    for (const role of ["PUBLIC", runtimeRole]) {
      const suffix = role === "PUBLIC" ? "PUBLIC" : "%I";
      const values = role === "PUBLIC" ? [table] : [table, role];
      await formatted(client,
        `REVOKE INSERT, UPDATE ON TABLE public.%I FROM ${suffix}`, values);
      for (const privilege of ["INSERT", "UPDATE"]) {
        const allowed = role === runtimeRole ? new Set(contract[privilege]) : new Set();
        for (const column of columns) {
          if (!allowed.has(column)) {
            await revokeColumn(client, formatted, role, table, privilege, column);
          }
        }
      }
    }
  }

  const allProtectedRoles = [
    runtimeRole, optionCRoles.staffAuthWriter, optionCRoles.mfaWriter,
    optionCRoles.managementWriter,
  ];
  const exclusiveFunctions = [
    [optionCFunctionContract.staffAuth[0], optionCRoles.staffAuthWriter],
    [optionCFunctionContract.staffAuth[1], optionCRoles.staffAuthWriter],
    [optionCFunctionContract.staffAuth[2], optionCRoles.staffAuthWriter],
    [optionCFunctionContract.mfa[0], optionCRoles.mfaWriter],
    ...optionCFunctionContract.management.map((name) =>
      [name, optionCRoles.managementWriter]),
    [optionCFunctionContract.mfaActivity, runtimeRole],
  ];
  for (const [signature, allowedRole] of exclusiveFunctions) {
    await client.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    await revokeUnexpectedFunctionExecutors(client, formatted, signature, allowedRole);
    for (const role of allProtectedRoles) {
      if (role !== allowedRole) {
        await formatted(client, `REVOKE ALL ON FUNCTION ${signature} FROM %I`, [role]);
      }
    }
  }
  for (const signature of optionCFunctionContract.retiredManagement) {
    await client.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    await revokeUnexpectedFunctionExecutors(client, formatted, signature, null);
    for (const role of allProtectedRoles) {
      await formatted(client, `REVOKE ALL ON FUNCTION ${signature} FROM %I`, [role]);
    }
  }
}

async function assertExactMutationColumns(client, role, table, expected) {
  const columns = await tableColumns(client, table);
  for (const privilege of ["INSERT", "UPDATE"]) {
    const tableAcl = await client.query(
      "SELECT has_table_privilege($1,$2,$3) AS allowed",
      [role, `public.${table}`, privilege],
    );
    if (tableAcl.rows[0]?.allowed !== false) {
      throw new Error(`Option C ${role} has table-level ${table} ${privilege}.`);
    }
    const allowed = new Set(expected[privilege] ?? []);
    for (const column of columns) {
      const found = await client.query(
        "SELECT has_column_privilege($1,$2,$3,$4) AS allowed",
        [role, `public.${table}`, column, privilege],
      );
      if (found.rows[0]?.allowed !== allowed.has(column)) {
        throw new Error(`Option C ${role} ${table}.${column} ${privilege} is unsafe.`);
      }
    }
  }
}

async function assertPublicMutationDenied(client) {
  const result = await client.query(
    `SELECT 1 FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
       LEFT JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid=relation.oid
         AND attribute.attnum>0 AND NOT attribute.attisdropped
       LEFT JOIN LATERAL pg_catalog.aclexplode(relation.relacl) table_acl ON true
       LEFT JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) column_acl ON true
       WHERE namespace.nspname='public' AND relation.relname=ANY($1::text[])
         AND ((table_acl.grantee=0 AND table_acl.privilege_type IN
           ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) OR
              (column_acl.grantee=0 AND column_acl.privilege_type IN
           ('INSERT','UPDATE','REFERENCES')))
       LIMIT 1`, [Object.keys(tableMutationContract)],
  );
  if (result.rowCount !== 0) throw new Error("PUBLIC retains Option C sensitive authority.");
}

async function assertNoDestructiveTablePrivileges(client, roles) {
  for (const role of roles) {
    for (const table of Object.keys(tableMutationContract)) {
      const result = await client.query(
        `SELECT has_table_privilege($1,$2,'DELETE') AS can_delete,
                has_table_privilege($1,$2,'TRUNCATE') AS can_truncate,
                has_table_privilege($1,$2,'REFERENCES') AS can_reference,
                has_table_privilege($1,$2,'TRIGGER') AS can_trigger`,
        [role, `public.${table}`],
      );
      if (!result.rows[0] || Object.values(result.rows[0]).some(Boolean)) {
        throw new Error(`Option C ${role} has destructive ${table} authority.`);
      }
    }
  }
}

async function assertFunction(client, signature, allowedRole, deniedRoles, path) {
  const metadata = await client.query(
    `SELECT function.prosecdef,owner.rolname AS owner,function.proconfig,
            NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
              COALESCE(function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_denied,
            NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
              COALESCE(function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner
                AND acl.is_grantable) AS grant_option_denied,
            NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
              COALESCE(function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner
                AND acl.grantee<>0 AND ($2::text IS NULL OR acl.grantee <>
                  (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2))) AS other_roles_denied
       FROM pg_catalog.pg_proc function JOIN pg_catalog.pg_roles owner
         ON owner.oid=function.proowner WHERE function.oid=pg_catalog.to_regprocedure($1)`,
    [signature, allowedRole],
  );
  const row = metadata.rows[0];
  if (metadata.rowCount !== 1 || row?.prosecdef !== true || row.public_denied !== true ||
      row.grant_option_denied !== true || row.other_roles_denied !== true ||
      deniedRoles.includes(row.owner) || !Array.isArray(row.proconfig) ||
      !row.proconfig.includes(path)) {
    throw new Error(`Option C protected function ${signature} metadata is unsafe.`);
  }
  const checkedRoles = allowedRole === null
    ? deniedRoles
    : [allowedRole, ...deniedRoles];
  for (const role of checkedRoles) {
    const access = await client.query(
      "SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [role, signature],
    );
    if (access.rows[0]?.allowed !== (allowedRole !== null && role === allowedRole)) {
      throw new Error(`Option C protected function ${signature} ACL is unsafe.`);
    }
  }
}

export async function verifyOptionCProtectedAcl(client, runtimeRole, migrationRole) {
  await verifyOptionCManagementBodies(client);
  await assertOptionCRevocationIsMonotonic(client, runtimeRole);
  const roles = await verifyOptionCRoleIsolation(client, runtimeRole, migrationRole);
  await verifyManagementWriterPrivileges(client, optionCRoles.managementWriter, runtimeRole);
  await assertPublicMutationDenied(client);
  await assertNoDestructiveTablePrivileges(client, roles);
  for (const [table, expected] of Object.entries(tableMutationContract)) {
    await assertExactMutationColumns(client, runtimeRole, table, expected);
  }

  await assertExactMutationColumns(client, optionCRoles.staffAuthWriter,
    "staff_auth_sessions", {
      INSERT: ["id","user_id","current_access_token_hash","access_expires_at",
        "absolute_expires_at","created_at","last_rotated_at"],
      UPDATE: ["current_access_token_hash","access_expires_at","last_rotated_at","revoked_at"],
    });
  await assertExactMutationColumns(client, optionCRoles.staffAuthWriter,
    "staff_refresh_credentials", {
      INSERT: ["id","session_id","token_hash","generation","created_at","expires_at"],
      UPDATE: ["consumed_at","replaced_by_credential_id"],
    });
  await assertExactMutationColumns(client, optionCRoles.mfaWriter,
    "staff_auth_sessions", {
      INSERT: [], UPDATE: ["mfa_authenticated_at","mfa_factor_id","last_admin_activity_at"],
    });
  await assertExactMutationColumns(client, optionCRoles.mfaWriter,
    "user_mfa_totp_factors", {
      INSERT: ["id","user_id","state","protected_secret","pending_enrollment_session_id"],
      UPDATE: ["state","last_accepted_step","recovery_set_generation","activated_at","retired_at"],
    });
  await assertExactMutationColumns(client, optionCRoles.mfaWriter,
    "mfa_recovery_codes", {
      INSERT: ["id","factor_id","set_generation","slot","selector","verifier"],
      UPDATE: ["consumed_at"],
    });

  const denied = roles.filter((role) => role !== optionCRoles.staffAuthWriter);
  await assertFunction(client, optionCFunctionContract.staffAuth[0],
    optionCRoles.staffAuthWriter, denied, "search_path=pg_catalog, public");
  await assertFunction(client, optionCFunctionContract.staffAuth[1],
    optionCRoles.staffAuthWriter, denied, "search_path=pg_catalog");
  await assertFunction(client, optionCFunctionContract.staffAuth[2],
    optionCRoles.staffAuthWriter, denied, "search_path=pg_catalog");
  await assertFunction(client, optionCFunctionContract.mfa[0], optionCRoles.mfaWriter,
    roles.filter((role) => role !== optionCRoles.mfaWriter), "search_path=pg_catalog");
  for (const signature of optionCFunctionContract.management) {
    await assertFunction(client, signature, optionCRoles.managementWriter,
      roles.filter((role) => role !== optionCRoles.managementWriter),
      "search_path=pg_catalog, public");
  }
  for (const signature of optionCFunctionContract.retiredManagement) {
    await assertFunction(client, signature, null, roles, "search_path=pg_catalog, public");
  }
  await assertFunction(client, optionCFunctionContract.mfaActivity, runtimeRole,
    roles.filter((role) => role !== runtimeRole), "search_path=pg_catalog");
  for (const table of ["mfa_activity_private.key_root", "mfa_activity_private.consumed_nonce"]) {
    for (const privilege of ["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER"]) {
      const result = await client.query(
        "SELECT has_table_privilege($1,$2,$3) AS allowed", [runtimeRole, table, privilege],
      );
      if (result.rows[0]?.allowed !== false) {
        throw new Error("Ordinary runtime can access MFA activity private tables.");
      }
    }
  }
  await verifyS04RuntimePrivileges(client, runtimeRole);
}
