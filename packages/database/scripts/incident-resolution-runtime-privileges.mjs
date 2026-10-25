const resolutionColumns = [
  "status",
  "resolved_at",
  "resolved_by_membership_id",
  "resolution_notes",
];

export async function provisionIncidentResolutionPrivileges(
  client,
  executeFormatted,
  role,
) {
  for (const column of resolutionColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE incidents TO %I",
      [column, role],
    );
  }
}

export async function verifyIncidentResolutionPrivileges(client, role) {
  const result = await client.query(
    `SELECT column_name, has_column_privilege($1, 'public.incidents', column_name, 'UPDATE') AS allowed
     FROM information_schema.columns WHERE table_schema='public' AND table_name='incidents'`,
    [role],
  );
  if (
    result.rows.length === 0 ||
    result.rows.some(
      (row) => row.allowed !== resolutionColumns.includes(row.column_name),
    )
  ) {
    throw new Error("Unsafe Incident resolution column privileges.");
  }
}
