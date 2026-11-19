const sessionLockOwner = "vaylet_staff_session_lock_owner";

interface CatalogClient {
  query(sql: string, values: string[]): Promise<{ rows: { approved: boolean }[] }>;
}

export async function fixtureSessionLockRoles(
  client: CatalogClient,
  bootstrapUrl: string,
  env = process.env,
): Promise<string[]> {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_JOB !== "postgres") {
    return [sessionLockOwner];
  }
  if (env.VAYLET_CI_POSTGRES_BOOTSTRAP_URL !== bootstrapUrl) {
    throw new Error("Staff Auth fixture is outside the PostgreSQL CI bootstrap.");
  }

  const { rows } = await client.query(
    `SELECT NOT (owner.rolcanlogin OR owner.rolinherit OR owner.rolsuper OR
                owner.rolcreatedb OR owner.rolcreaterole OR owner.rolreplication OR
                owner.rolbypassrls)
            AND NOT runner.rolsuper AND NOT runner.rolinherit
            AND EXISTS (
              SELECT 1 FROM pg_catalog.pg_auth_members membership
              WHERE membership.roleid = owner.oid AND membership.member = runner.oid
                AND membership.admin_option AND NOT membership.inherit_option
                AND NOT membership.set_option
            ) AND NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_auth_members membership
              WHERE membership.member = owner.oid OR
                (membership.roleid = owner.oid AND
                 (membership.member <> runner.oid OR membership.inherit_option OR
                  membership.admin_option = membership.set_option))
            ) AS approved
       FROM pg_catalog.pg_roles owner, pg_catalog.pg_roles runner
      WHERE owner.rolname = $1 AND runner.rolname = session_user`,
    [sessionLockOwner],
  );
  if (rows.length !== 1 || rows[0]?.approved !== true) {
    throw new Error("Staff Auth fixture requires the CI-owned session lock role.");
  }
  // Its lifecycle belongs to the disposable CI service, including migration
  // membership changes. A scratch fixture must neither snapshot nor undo it.
  return [];
}
