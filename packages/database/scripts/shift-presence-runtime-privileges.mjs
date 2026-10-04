export const shiftPresenceUpdates = {
  shift_presence_zones: ["code", "label", "latitude", "longitude", "radius_meters", "state", "revision"],
  shift_presence_operations: ["request_fingerprint", "status", "terminal_at", "result_shift_id", "result_decision_id"],
  shift_presence_challenges: ["consumed_at", "decision_id"],
  shift_presence_decisions: [],
  shift_presence_exceptions: ["status", "revision", "reviewed_at", "reviewer_membership_id", "reviewer_user_id", "terminal_at", "consumed_decision_id"],
};

export async function provisionShiftPresencePrivileges(client, executeFormatted, runtimeRole) {
  for (const [table, columns] of Object.entries(shiftPresenceUpdates)) {
    await client.query(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON TABLE public.%I FROM %I", [table, runtimeRole]);
    // Reconcile stale column privileges too; table-level REVOKE alone is insufficient.
    const result = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1`, [table],
    );
    for (const { column_name: column } of result.rows) {
      await executeFormatted(client, "REVOKE UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM PUBLIC", [column, column, table]);
      await executeFormatted(client, "REVOKE UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM %I", [column, column, table, runtimeRole]);
    }
    await executeFormatted(client, "GRANT SELECT, INSERT ON TABLE public.%I TO %I", [table, runtimeRole]);
    for (const column of columns) {
      await executeFormatted(client, "GRANT UPDATE (%I) ON TABLE public.%I TO %I", [column, table, runtimeRole]);
    }
  }
  for (const functionName of ["shift_presence_guard_policy", "shift_presence_guard_history", "shift_presence_guard_linkage"]) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION public.%I() FROM %I", [functionName, runtimeRole]);
  }
  await verifyShiftPresencePrivileges(client, runtimeRole);
}

export async function verifyShiftPresencePrivileges(client, runtimeRole) {
  for (const [table, mutableColumns] of Object.entries(shiftPresenceUpdates)) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const result = await client.query(`SELECT has_table_privilege($1,$2,$3) AS allowed`, [runtimeRole, `public.${table}`, privilege]);
      if (result.rows[0].allowed !== ["SELECT", "INSERT"].includes(privilege)) {
        throw new Error("Shift Presence runtime table grants are unsafe.");
      }
    }
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table],
    );
    for (const { column_name: column } of columns.rows) {
      const result = await client.query(`SELECT has_column_privilege($1,$2,$3,'UPDATE') AS allowed`, [runtimeRole, `public.${table}`, column]);
      if (result.rows[0].allowed !== mutableColumns.includes(column)) {
        throw new Error("Shift Presence runtime column grants are unsafe.");
      }
    }
  }
  for (const functionName of ["shift_presence_guard_policy", "shift_presence_guard_history", "shift_presence_guard_linkage"]) {
    const result = await client.query(`SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`, [runtimeRole, `public.${functionName}()`]);
    if (result.rows[0].allowed) throw new Error("Runtime must not execute Presence trigger helpers.");
  }
}
