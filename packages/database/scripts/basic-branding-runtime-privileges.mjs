const runtimeBasicBrandingFunctions = [
  "public.location_branding_set_display_name_override(uuid,uuid,text,timestamp with time zone)",
  "public.location_branding_set_primary_color_override(uuid,uuid,text,timestamp with time zone)",
  "public.location_branding_clear_display_name_override(uuid,uuid,timestamp with time zone)",
  "public.location_branding_clear_primary_color_override(uuid,uuid,timestamp with time zone)",
];

const privateBasicBrandingFunctions = [
  "public.location_branding_authorized_organization(uuid,uuid)",
  "public.location_branding_setting_state(uuid,text)",
  "public.location_branding_append_audit(uuid,uuid,uuid,text,text,boolean,text,text,boolean,text,text)",
];

export const organizationSubscriptionTablePolicies = [
  ["public.organization_subscriptions", "SELECT", true],
  ["public.organization_subscriptions", "INSERT", false],
  ["public.organization_subscriptions", "UPDATE", false],
  ["public.organization_subscriptions", "DELETE", false],
  ["public.organization_subscriptions", "TRUNCATE", false],
  ["public.organization_subscriptions", "REFERENCES", false],
  ["public.organization_subscriptions", "TRIGGER", false],
];

export async function provisionBasicBrandingPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    "REVOKE ALL ON TABLE organization_subscriptions FROM PUBLIC",
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON TABLE organization_subscriptions FROM %I",
    [runtimeRole],
  );
  await executeFormatted(client, "GRANT SELECT ON TABLE %I TO %I", [
    "organization_subscriptions",
    runtimeRole,
  ]);
  for (const functionName of runtimeBasicBrandingFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      functionName,
      runtimeRole,
    ]);
  }
}

async function assertFunctionFlags(client, runtimeRole, functionName) {
  const result = await client.query(
    `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
            function.prosecdef AS security_definer,
            owner.rolname <> $1 AS owner_safe,
            function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
              AS search_path_safe,
            NOT EXISTS (
              SELECT 1
              FROM pg_proc AS candidate
              CROSS JOIN LATERAL aclexplode(
                COALESCE(candidate.proacl,
                         acldefault('f', candidate.proowner))
              ) AS privilege
              WHERE candidate.oid = to_regprocedure($2)
                AND privilege.grantee = 0
                AND privilege.privilege_type = 'EXECUTE'
            ) AS public_denied
     FROM pg_proc AS function
     INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
     WHERE function.oid = to_regprocedure($2)`,
    [runtimeRole, functionName],
  );
  return result.rows[0];
}

export async function verifyBasicBrandingPrivileges(client, runtimeRole) {
  const subscriptionExpectations = [
    ["SELECT", true],
    ["INSERT", false],
    ["UPDATE", false],
    ["DELETE", false],
    ["TRUNCATE", false],
    ["REFERENCES", false],
    ["TRIGGER", false],
  ];
  for (const [privilege, expected] of subscriptionExpectations) {
    const result = await client.query(
      `SELECT has_table_privilege($1, 'public.organization_subscriptions', $2)
         AS allowed`,
      [runtimeRole, privilege],
    );
    if ((result.rows[0]?.allowed === true) !== expected) {
      throw new Error(
        "Runtime organization_subscriptions table privileges are unsafe.",
      );
    }
  }
  for (const functionName of runtimeBasicBrandingFunctions) {
    const row = await assertFunctionFlags(client, runtimeRole, functionName);
    if (
      row?.runtime_allowed !== true ||
      row.security_definer !== true ||
      row.owner_safe !== true ||
      row.search_path_safe !== true ||
      row.public_denied !== true
    ) {
      throw new Error(
        "Runtime basic branding function privileges are unsafe.",
      );
    }
  }
  for (const functionName of privateBasicBrandingFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed`,
      [runtimeRole, functionName],
    );
    if (result.rows[0]?.runtime_allowed !== false) {
      throw new Error(
        "Runtime basic branding helper privileges are unsafe.",
      );
    }
  }
}
