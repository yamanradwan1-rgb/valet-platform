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
}
