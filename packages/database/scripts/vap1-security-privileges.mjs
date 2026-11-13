// Option A C3/C4 security-only provisioner. NEVER run while legacy traffic is live.
// Old v9 ACLs remain until the operator deliberately changes the private phase.
import { runtimeStaffManagementFunctions } from "./staff-management-runtime-privileges.mjs";
import { runtimeStaffOnboardingFunctions } from "./staff-onboarding-runtime-privileges.mjs";
import { runtimeLocationLifecycleFunctions } from "./location-lifecycle-runtime-privileges.mjs";
import { runtimeManagementSettingsFunctions } from "./management-settings-runtime-privileges.mjs";
import { runtimeShiftForceEndFunction } from "./shift-force-end-runtime-privileges.mjs";

const legacyFunctions = [
  ...runtimeStaffManagementFunctions,
  ...runtimeStaffOnboardingFunctions,
  ...runtimeLocationLifecycleFunctions,
  ...runtimeManagementSettingsFunctions,
  runtimeShiftForceEndFunction,
  "public.shift_presence_set_policy(uuid,uuid,uuid,text,uuid,uuid,text,text,boolean,integer,integer,uuid)",
  "public.append_runtime_account_security_audit_event(uuid,text,uuid,account_security_actor_type,uuid,timestamp with time zone)",
  "public.cleanup_staff_push_v1()",
  "public.cleanup_expired_anti_abuse_events()",
];

const protectedTables = [
  "anti_abuse_events",
  "users",
  "organizations",
  "locations",
  "organization_memberships",
  "membership_location_access",
  "staff_auth_sessions",
  "staff_refresh_credentials",
  "user_mfa_totp_factors",
  "mfa_recovery_codes",
  "staff_onboarding_invitations",
  "staff_push_registrations",
];

async function revokeEveryColumnWrite(client, executeFormatted, role, table) {
  const columns = await client.query(
    `SELECT pg_catalog.quote_ident(attname) AS column_sql
       FROM pg_catalog.pg_attribute
       WHERE attrelid = $1::pg_catalog.regclass AND attnum > 0
         AND NOT attisdropped ORDER BY attnum`,
    [`public.${table}`],
  );
  if (columns.rowCount === 0) {
    throw new Error(`VAP1 expected protected table missing: ${table}`);
  }
  const names = columns.rows.map(({ column_sql }) => column_sql).join(",");
  // REVOKE table grants does NOT revoke PostgreSQL per-column grants.
  if (role === "PUBLIC") {
    await executeFormatted(
      client,
      "REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE %I FROM PUBLIC",
      [names, names, names, table],
    );
  } else {
    await executeFormatted(
      client,
      "REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE %I FROM %I",
      [names, names, names, table, role],
    );
  }
}

export async function assertLegacyRuntimeProvisioningAllowed(client) {
  const exists = await client.query(
    "SELECT pg_catalog.to_regclass('auth_proof_private.security_boundary') AS relation",
  );
  if (exists.rows[0]?.relation === null) return;
  // Hold the SAME boundary row lock until the provisioning transaction COMMIT.
  // Otherwise LEGACY_COMPAT preflight could race a C3 DRAINED transition,
  // regranting old auth SQL authority *after* the operator's REVOKEs.
  // Operator promotion UPDATE blocks on our FOR SHARE and must retire grants
  // only after this transaction has completed.
  const result = await client.query(
    "SELECT phase FROM auth_proof_private.security_boundary WHERE singleton FOR SHARE",
  );
  if (result.rowCount !== 1 || result.rows[0].phase !== "LEGACY_COMPAT") {
    throw new Error(
      "VAP1 protected/drained phase: legacy runtime provisioner may restore authority grants; run only the reviewed protected provisioner.",
    );
  }
}

export async function retireLegacyVap1Grants(
  client,
  executeFormatted,
  runtimeRole,
) {
  const phase = await client.query(
    "SELECT phase FROM auth_proof_private.security_boundary WHERE singleton FOR SHARE",
  );
  if (
    phase.rowCount !== 1 ||
    !["DRAINED", "PROTECTED"].includes(phase.rows[0].phase)
  ) {
    throw new Error(
      "VAP1 ACL retirement requires independently attested DRAINED/PROTECTED boundary.",
    );
  }
  const role = await client.query(
    "SELECT rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=$1",
    [runtimeRole],
  );
  const flags = role.rows[0];
  if (
    role.rowCount !== 1 ||
    !flags.rolcanlogin ||
    flags.rolinherit ||
    flags.rolsuper ||
    flags.rolcreaterole ||
    flags.rolbypassrls
  ) {
    throw new Error("VAP1 runtime principal has unsafe attributes.");
  }

  for (const table of protectedTables) {
    await executeFormatted(
      client,
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM %I",
      [table, runtimeRole],
    );
    await revokeEveryColumnWrite(client, executeFormatted, runtimeRole, table);
    await client.query(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
       ON TABLE public."${table}" FROM PUBLIC`,
    );
    await revokeEveryColumnWrite(client, executeFormatted, "PUBLIC", table);
  }

  // The future replacement handlers need only explicit, individually
  // audited EXECUTE grants. No generic privileged function is granted here.
  for (const functionName of legacyFunctions) {
    const found = await client.query(
      "SELECT pg_catalog.to_regprocedure($1) AS function_oid",
      [functionName],
    );
    if (found.rows[0]?.function_oid === null) {
      throw new Error(`VAP1 legacy callable overload not inventoried: ${functionName}`);
    }
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
    await client.query(`REVOKE ALL ON FUNCTION ${functionName} FROM PUBLIC`);
  }
  // Private key, challenge, admission and receipt objects have no runtime
  // grants even if a prior operator accidentally attempted to grant one.
  await executeFormatted(
    client,
    "REVOKE ALL ON SCHEMA auth_proof_private FROM %I",
    [runtimeRole],
  );
  await client.query("REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC");
  await executeFormatted(
    client,
    "REVOKE ALL ON ALL TABLES IN SCHEMA auth_proof_private FROM %I",
    [runtimeRole],
  );
  await client.query(
    "REVOKE ALL ON ALL TABLES IN SCHEMA auth_proof_private FROM PUBLIC",
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_proof_private FROM %I",
    [runtimeRole],
  );
  await client.query(
    "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_proof_private FROM PUBLIC",
  );
}

export const vap1LegacyFunctionSignatures = Object.freeze(legacyFunctions);
export const vap1ProtectedTables = Object.freeze(protectedTables);
