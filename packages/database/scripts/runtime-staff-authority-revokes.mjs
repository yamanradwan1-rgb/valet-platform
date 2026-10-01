const authorityColumnRevokes = [
  `REVOKE INSERT (id, email, phone, password_hash, status, created_at,
                  updated_at, last_login_at),
          UPDATE (id, email, phone, password_hash, status, created_at,
                  updated_at, last_login_at)
   ON TABLE users FROM %I`,
  `REVOKE INSERT (id, organization_id, user_id, role, status, version, created_at,
                  updated_at),
          UPDATE (id, organization_id, user_id, role, status, version, created_at,
                  updated_at)
   ON TABLE organization_memberships FROM %I`,
  `REVOKE INSERT (organization_id, membership_id, location_id, created_at),
          UPDATE (organization_id, membership_id, location_id, created_at)
   ON TABLE membership_location_access FROM %I`,
];

export async function revokeRuntimeStaffAuthority(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE
     ON TABLE users, organization_memberships, membership_location_access
     FROM PUBLIC`,
  );
  for (const statement of authorityColumnRevokes) {
    await client.query(statement.replace("%I", "PUBLIC"));
  }
  await executeFormatted(
    client,
    "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE users, organization_memberships, membership_location_access FROM %I",
    [runtimeRole],
  );
  for (const statement of authorityColumnRevokes) {
    await executeFormatted(client, statement, [runtimeRole]);
  }
}
