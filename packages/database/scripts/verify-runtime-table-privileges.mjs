const tablePrivileges = [
  ["public.users", "SELECT", true],
  ["public.users", "INSERT", false],
  ["public.users", "DELETE", false],
  ["public.users", "TRUNCATE", false],
  ["public.users", "UPDATE", false],
  ["public.organization_memberships", "SELECT", true],
  ["public.organization_memberships", "INSERT", false],
  ["public.organization_memberships", "DELETE", false],
  ["public.organization_memberships", "TRUNCATE", false],
  ["public.organization_memberships", "UPDATE", false],
  ["public.membership_location_access", "SELECT", true],
  ["public.membership_location_access", "INSERT", false],
  ["public.membership_location_access", "DELETE", false],
  ["public.membership_location_access", "TRUNCATE", false],
  ["public.membership_location_access", "UPDATE", false],
  ["public.retrieval_requests", "SELECT", true],
  ["public.retrieval_requests", "INSERT", true],
  ["public.retrieval_requests", "UPDATE", true],
  ["public.retrieval_requests", "DELETE", false],
  ["public.retrieval_requests", "TRUNCATE", false],
  ["public.retrieval_requests", "REFERENCES", false],
  ["public.retrieval_requests", "TRIGGER", false],
  ["public.handoff_verifications", "SELECT", true],
  ["public.handoff_verifications", "INSERT", true],
  ["public.handoff_verifications", "UPDATE", true],
  ["public.handoff_verifications", "DELETE", false],
  ["public.handoff_verifications", "TRUNCATE", false],
  ["public.handoff_verifications", "REFERENCES", false],
  ["public.handoff_verifications", "TRIGGER", false],
  ["public.location_map_points", "SELECT", true],
  ["public.location_map_points", "INSERT", false],
  ["public.location_map_points", "UPDATE", false],
  ["public.location_map_points", "DELETE", false],
  ["public.location_map_points", "TRUNCATE", false],
  ["public.location_map_points", "REFERENCES", false],
  ["public.location_map_points", "TRIGGER", false],
  ["public.location_map_areas", "SELECT", true],
  ["public.location_map_areas", "INSERT", false],
  ["public.location_map_areas", "UPDATE", false],
  ["public.location_map_areas", "DELETE", false],
  ["public.location_map_areas", "TRUNCATE", false],
  ["public.location_map_areas", "REFERENCES", false],
  ["public.location_map_areas", "TRIGGER", false],
  ["public.location_map_area_vertices", "SELECT", true],
  ["public.location_map_area_vertices", "INSERT", false],
  ["public.location_map_area_vertices", "UPDATE", false],
  ["public.location_map_area_vertices", "DELETE", false],
  ["public.location_map_area_vertices", "TRUNCATE", false],
  ["public.location_map_area_vertices", "REFERENCES", false],
  ["public.location_map_area_vertices", "TRIGGER", false],
  ["public.task_tracking_sessions", "SELECT", true],
  ["public.task_tracking_sessions", "INSERT", true],
  ["public.task_tracking_sessions", "UPDATE", false],
  ["public.task_tracking_sessions", "DELETE", false],
  ["public.task_tracking_sessions", "TRUNCATE", false],
  ["public.raw_gps_samples", "SELECT", true],
  ["public.raw_gps_samples", "INSERT", true],
  ["public.raw_gps_samples", "UPDATE", false],
  ["public.raw_gps_samples", "DELETE", false],
  ["public.raw_gps_samples", "TRUNCATE", false],
  ["public.geofence_events", "SELECT", true],
  ["public.geofence_events", "INSERT", true],
  ["public.geofence_events", "UPDATE", false],
  ["public.geofence_events", "DELETE", false],
  ["public.geofence_events", "TRUNCATE", false],
  ["public._prisma_migrations", "SELECT", false],
  ["public._prisma_migrations", "INSERT", false],
  ["public._prisma_migrations", "UPDATE", false],
  ["public._prisma_migrations", "DELETE", false],
  ["public._prisma_migrations", "TRUNCATE", false],
  ["public._prisma_migrations", "REFERENCES", false],
  ["public._prisma_migrations", "TRIGGER", false],
];

const columnPrivileges = [
  ["public.users", "password_hash", false],
  ["public.users", "status", false],
  ["public.users", "last_login_at", true],
  ["public.users", "updated_at", true],
  ["public.organization_memberships", "role", false],
  ["public.organization_memberships", "status", false],
  ["public.organization_memberships", "organization_id", false],
  ["public.organization_memberships", "user_id", false],
  ["public.organization_memberships", "updated_at", true],
  ["public.membership_location_access", "organization_id", false],
  ["public.membership_location_access", "membership_id", false],
  ["public.membership_location_access", "location_id", false],
  ["public.membership_location_access", "created_at", true],
  ["public.task_tracking_sessions", "ended_at", true],
  ["public.task_tracking_sessions", "started_at", false],
];

const anyColumnPrivileges = [
  ["public.users", "INSERT", false],
  ["public.organization_memberships", "INSERT", false],
  ["public.membership_location_access", "INSERT", false],
  ["public._prisma_migrations", "SELECT", false],
  ["public._prisma_migrations", "INSERT", false],
  ["public._prisma_migrations", "UPDATE", false],
  ["public._prisma_migrations", "REFERENCES", false],
];

const mapSetupFunctions = [
  "public.map_setup_create_point(uuid,uuid,uuid,location_map_point_kind,text,text,numeric,numeric,text,boolean)",
  "public.map_setup_update_point(uuid,uuid,uuid,location_map_point_kind,text,text,numeric,numeric,text,boolean,timestamp with time zone)",
  "public.map_setup_create_area(uuid,uuid,uuid,location_map_area_purpose,text,text,text,boolean,uuid,numeric[],numeric[])",
  "public.map_setup_update_area(uuid,uuid,uuid,location_map_area_purpose,text,text,text,boolean,uuid,timestamp with time zone)",
  "public.map_setup_replace_area_vertices(uuid,uuid,uuid,numeric[],numeric[])",
];

const privateMapSetupFunctions = [
  "public.map_setup_authorized_organization(uuid,uuid)",
  "public.map_setup_validate_labels(text,text,text)",
  "public.map_setup_append_audit(uuid,uuid,uuid,text,text,uuid,text,boolean,boolean)",
];

const maintenanceFunctions = [
  "public.cleanup_expired_raw_gps_samples(integer)",
];

async function tablePrivilegeMatches(client, runtimeRole, policy) {
  const [table, privilege, expected] = policy;
  const result = await client.query(
    `SELECT has_table_privilege($1, $2, $3) AS allowed`,
    [runtimeRole, table, privilege],
  );
  return result.rows[0]?.allowed === expected;
}

async function columnPrivilegeMatches(client, runtimeRole, policy) {
  const [table, column, expected] = policy;
  const result = await client.query(
    `SELECT has_column_privilege($1, $2, $3, 'UPDATE') AS allowed`,
    [runtimeRole, table, column],
  );
  return result.rows[0]?.allowed === expected;
}

async function anyColumnPrivilegeMatches(client, runtimeRole, policy) {
  const [table, privilege, expected] = policy;
  const result = await client.query(
    `SELECT has_any_column_privilege($1, $2, $3) AS allowed`,
    [runtimeRole, table, privilege],
  );
  return result.rows[0]?.allowed === expected;
}

export async function verifyRuntimeTablePrivileges(client, runtimeRole) {
  for (const policy of tablePrivileges) {
    if (!(await tablePrivilegeMatches(client, runtimeRole, policy))) {
      throw new Error("Runtime database role effective privileges are unsafe.");
    }
  }
  for (const policy of columnPrivileges) {
    if (!(await columnPrivilegeMatches(client, runtimeRole, policy))) {
      throw new Error("Runtime database role effective privileges are unsafe.");
    }
  }
  for (const policy of anyColumnPrivileges) {
    if (!(await anyColumnPrivilegeMatches(client, runtimeRole, policy))) {
      throw new Error("Runtime database role effective privileges are unsafe.");
    }
  }
  for (const functionName of mapSetupFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
              function.prosecdef AS security_definer,
              owner.rolname <> $1 AS owner_safe,
              function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
                AS search_path_safe,
              NOT EXISTS (
                SELECT 1
                FROM pg_proc AS function
                CROSS JOIN LATERAL aclexplode(
                  COALESCE(function.proacl,
                           acldefault('f', function.proowner))
                ) AS privilege
                WHERE function.oid = to_regprocedure($2)
                  AND privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_proc AS function
       INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
       WHERE function.oid = to_regprocedure($2)`,
      [runtimeRole, functionName],
    );
    if (
      result.rows[0]?.runtime_allowed !== true ||
      result.rows[0]?.security_definer !== true ||
      result.rows[0]?.owner_safe !== true ||
      result.rows[0]?.search_path_safe !== true ||
      result.rows[0]?.public_denied !== true
    ) {
      throw new Error("Runtime map-setup function privileges are unsafe.");
    }
  }
  for (const functionName of privateMapSetupFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed`,
      [runtimeRole, functionName],
    );
    if (result.rows[0]?.runtime_allowed !== false) {
      throw new Error("Runtime map-setup helper privileges are unsafe.");
    }
  }
  for (const functionName of maintenanceFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
              function.prosecdef AS security_definer,
              owner.rolname <> $1 AS owner_safe,
              function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
                AS search_path_safe,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(
                  COALESCE(function.proacl, acldefault('f', function.proowner))
                ) AS privilege
                WHERE privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_proc AS function
       INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
       WHERE function.oid = to_regprocedure($2)`,
      [runtimeRole, functionName],
    );
    const row = result.rows[0];
    if (
      row?.runtime_allowed !== true || row.security_definer !== true ||
      row.owner_safe !== true || row.search_path_safe !== true ||
      row.public_denied !== true
    ) {
      throw new Error("Runtime maintenance function privileges are unsafe.");
    }
  }
}
