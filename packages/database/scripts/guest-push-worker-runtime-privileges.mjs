import {
  anyColumnPrivilegeMatches,
  columnPrivilegeMatches,
  tablePrivilegeMatches,
} from "./runtime-privilege-verification-helpers.mjs";

const registrationTable = "public.guest_push_registrations";
const intentTable = "public.guest_push_intents";
const deliveryTable = "public.guest_push_deliveries";

const registrationSelectColumns = [
  "id",
  "guest_browser_session_id",
  "valet_session_id",
  "credential_generation",
  "state",
  "updated_at",
  "terminal_at",
  "superseded_by_registration_id",
];

const registrationUpdateColumns = [
  "endpoint",
  "p256dh",
  "auth_secret",
  "state",
  "terminal_at",
  "terminal_reason_class",
  "updated_at",
];

const deliveryUpdateColumns = [
  "state",
  "attempt_count",
  "next_attempt_at",
  "lease_token",
  "lease_expires_at",
  "provider_result_class",
  "provider_reference",
  "provider_accepted_at",
  "terminal_at",
  "updated_at",
];

const workerFunctions = [
  "public.guest_push_resolve_eligible_v1(uuid,uuid,integer)",
  "public.guest_push_reconcile_ended_v1(integer)",
  "public.cleanup_guest_push_v1()",
];

const forbiddenFunctions = [
  "public.guest_push_register_v1(text,text,text,text,text)",
  "public.guest_push_ready_intent_v1(uuid,uuid,uuid,timestamp with time zone)",
  "public.guest_push_registration_guard()",
  "public.guest_push_intent_immutable_guard()",
  "public.guest_push_delivery_guard()",
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

export async function provisionGuestPushWorkerPrivileges(
  client,
  executeFormatted,
  workerRole,
) {
  for (const table of [registrationTable, intentTable, deliveryTable]) {
    await client.query(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON TABLE %s FROM %I", [table, workerRole]);
  }
  for (const table of [intentTable, deliveryTable]) {
    await executeFormatted(client, "GRANT SELECT ON TABLE %s TO %I", [table, workerRole]);
  }
  for (const column of registrationSelectColumns) {
    await executeFormatted(
      client,
      "GRANT SELECT (%I) ON TABLE guest_push_registrations TO %I",
      [column, workerRole],
    );
  }
  for (const column of registrationUpdateColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE guest_push_registrations TO %I",
      [column, workerRole],
    );
  }
  for (const column of deliveryUpdateColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE guest_push_deliveries TO %I",
      [column, workerRole],
    );
  }
  for (const functionName of [...workerFunctions, ...forbiddenFunctions]) {
    await client.query(`REVOKE ALL ON FUNCTION ${functionName} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      workerRole,
    ]);
  }
  for (const functionName of workerFunctions) {
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      functionName,
      workerRole,
    ]);
  }
}

export async function verifyGuestPushWorkerPrivileges(client, workerRole) {
  const tablePolicies = [
    [registrationTable, "SELECT", false],
    [registrationTable, "INSERT", false],
    [registrationTable, "UPDATE", false],
    [registrationTable, "DELETE", false],
    [intentTable, "SELECT", true],
    [intentTable, "INSERT", false],
    [intentTable, "UPDATE", false],
    [intentTable, "DELETE", false],
    [deliveryTable, "SELECT", true],
    [deliveryTable, "INSERT", false],
    [deliveryTable, "UPDATE", false],
    [deliveryTable, "DELETE", false],
  ];
  for (const policy of tablePolicies) {
    if (!(await tablePrivilegeMatches(client, workerRole, policy))) {
      throw new Error("Guest Push worker table privileges are unsafe.");
    }
  }
  for (const policy of [
    [registrationTable, "SELECT", true],
    [registrationTable, "UPDATE", true],
    [intentTable, "UPDATE", false],
    [deliveryTable, "UPDATE", true],
  ]) {
    if (!(await anyColumnPrivilegeMatches(client, workerRole, policy))) {
      throw new Error("Guest Push worker effective privileges are unsafe.");
    }
  }
  for (const column of registrationSelectColumns) {
    const result = await client.query(
      `SELECT has_column_privilege($1,'public.guest_push_registrations',$2,'SELECT') AS allowed`,
      [workerRole, column],
    );
    if (result.rows[0]?.allowed !== true) throw new Error("Worker registration read denied.");
  }
  for (const column of ["endpoint", "p256dh", "auth_secret", "endpoint_hash"]) {
    const result = await client.query(
      `SELECT has_column_privilege($1,'public.guest_push_registrations',$2,'SELECT') AS allowed`,
      [workerRole, column],
    );
    if (result.rows[0]?.allowed !== false) throw new Error("Worker can scan push secrets.");
  }
  for (const policy of [
    ...registrationUpdateColumns.map((column) => [registrationTable, column, true]),
    ...deliveryUpdateColumns.map((column) => [deliveryTable, column, true]),
    [registrationTable, "endpoint_hash", false],
    [deliveryTable, "organization_id", false],
    [deliveryTable, "intent_id", false],
    [deliveryTable, "registration_id", false],
    [deliveryTable, "max_attempts", false],
  ]) {
    if (!(await columnPrivilegeMatches(client, workerRole, policy))) {
      throw new Error("Guest Push worker update privileges are unsafe.");
    }
  }
  for (const functionName of workerFunctions) {
    const security = await functionSecurity(client, workerRole, functionName);
    if (
      security?.allowed !== true ||
      security.security_definer !== true ||
      security.owner_safe !== true ||
      security.search_path_safe !== true ||
      security.public_denied !== true
    ) {
      throw new Error("Guest Push worker function privileges are unsafe.");
    }
  }
  for (const functionName of forbiddenFunctions) {
    const security = await functionSecurity(client, workerRole, functionName);
    if (security?.allowed !== false || security?.public_denied !== true) {
      throw new Error("Guest Push worker has forbidden API authority.");
    }
  }
}
