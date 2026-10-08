import {
  anyColumnPrivilegeMatches,
  tablePrivilegeMatches,
} from "./runtime-privilege-verification-helpers.mjs";

const tables = [
  "public.guest_push_registrations",
  "public.guest_push_intents",
  "public.guest_push_deliveries",
];

const apiFunctions = [
  "public.guest_push_register_v1(text,text,text,text,text)",
  "public.guest_push_ready_intent_v1(uuid,uuid,uuid,timestamp with time zone)",
];

const workerFunctions = [
  "public.guest_push_resolve_eligible_v1(uuid,uuid,integer)",
  "public.guest_push_reconcile_ended_v1(integer)",
  "public.cleanup_guest_push_v1()",
];

const privateFunctions = [
  "public.guest_push_registration_guard()",
  "public.guest_push_intent_immutable_guard()",
  "public.guest_push_delivery_guard()",
];

const legacyColumnRevokes = [
  ["guest_push_registrations", "SELECT", "id"],
  ["guest_push_registrations", "SELECT", "guest_browser_session_id"],
  ["guest_push_registrations", "SELECT", "valet_session_id"],
  ["guest_push_registrations", "SELECT", "credential_generation"],
  ["guest_push_registrations", "SELECT", "state"],
  ["guest_push_registrations", "SELECT", "updated_at"],
  ["guest_push_registrations", "SELECT", "terminal_at"],
  ["guest_push_registrations", "SELECT", "superseded_by_registration_id"],
  ["guest_push_registrations", "UPDATE", "endpoint"],
  ["guest_push_registrations", "UPDATE", "p256dh"],
  ["guest_push_registrations", "UPDATE", "auth_secret"],
  ["guest_push_registrations", "UPDATE", "state"],
  ["guest_push_registrations", "UPDATE", "terminal_at"],
  ["guest_push_registrations", "UPDATE", "terminal_reason_class"],
  ["guest_push_registrations", "UPDATE", "updated_at"],
  ["guest_push_deliveries", "UPDATE", "state"],
  ["guest_push_deliveries", "UPDATE", "attempt_count"],
  ["guest_push_deliveries", "UPDATE", "next_attempt_at"],
  ["guest_push_deliveries", "UPDATE", "lease_token"],
  ["guest_push_deliveries", "UPDATE", "lease_expires_at"],
  ["guest_push_deliveries", "UPDATE", "provider_result_class"],
  ["guest_push_deliveries", "UPDATE", "provider_reference"],
  ["guest_push_deliveries", "UPDATE", "provider_accepted_at"],
  ["guest_push_deliveries", "UPDATE", "terminal_at"],
  ["guest_push_deliveries", "UPDATE", "updated_at"],
];

async function functionSecurity(client, role, functionName) {
  const result = await client.query(
    `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
            function.prosecdef AS security_definer,
            owner.rolname <> $1 AS owner_safe,
            function.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
            NOT EXISTS (
              SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) privilege
              WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
            ) AS public_denied
       FROM pg_proc function
       INNER JOIN pg_roles owner ON owner.oid=function.proowner
      WHERE function.oid=to_regprocedure($2)`,
    [role, functionName],
  );
  return result.rows[0];
}

export async function provisionGuestPushPrivileges(client, executeFormatted, apiRole) {
  for (const table of tables) {
    await client.query(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON TABLE %s FROM %I", [table, apiRole]);
  }
  for (const [table, privilege, column] of legacyColumnRevokes) {
    await executeFormatted(client, `REVOKE ${privilege} (%I) ON TABLE %I FROM %I`, [
      column,
      table,
      apiRole,
    ]);
  }
  for (const functionName of [...apiFunctions, ...workerFunctions, ...privateFunctions]) {
    await client.query(`REVOKE ALL ON FUNCTION ${functionName} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      apiRole,
    ]);
  }
  for (const functionName of apiFunctions) {
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      functionName,
      apiRole,
    ]);
  }
}

export async function verifyGuestPushPrivileges(client, apiRole) {
  for (const table of tables) {
    for (const privilege of [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ]) {
      if (!(await tablePrivilegeMatches(client, apiRole, [table, privilege, false]))) {
        throw new Error("API runtime Guest Push table privileges are unsafe.");
      }
    }
    for (const privilege of ["SELECT", "UPDATE"]) {
      if (!(await anyColumnPrivilegeMatches(client, apiRole, [table, privilege, false]))) {
        throw new Error("API runtime Guest Push column privileges are unsafe.");
      }
    }
  }
  for (const functionName of apiFunctions) {
    const security = await functionSecurity(client, apiRole, functionName);
    if (
      security?.allowed !== true ||
      security.security_definer !== true ||
      security.owner_safe !== true ||
      security.search_path_safe !== true ||
      security.public_denied !== true
    ) {
      throw new Error("API runtime Guest Push function privileges are unsafe.");
    }
  }
  for (const functionName of [...workerFunctions, ...privateFunctions]) {
    const security = await functionSecurity(client, apiRole, functionName);
    if (security?.allowed !== false || security?.public_denied !== true) {
      throw new Error("API runtime has Guest Push worker-only authority.");
    }
  }
}
