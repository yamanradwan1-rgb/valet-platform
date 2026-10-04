export const shiftPresenceUpdates = {
  shift_presence_management_results: [],
  shift_presence_zones: [
    "code",
    "label",
    "latitude",
    "longitude",
    "radius_meters",
    "state",
    "revision",
  ],
  shift_presence_operations: [
    "request_fingerprint",
    "request_policy_fingerprint",
    "denial_reason",
    "denial_classification",
    "denial_measurement_reason",
    "status",
    "terminal_at",
    "result_shift_id",
    "result_decision_id",
    "completion_basis",
  ],
  shift_presence_challenges: ["consumed_at", "decision_id"],
  shift_presence_decisions: [],
  shift_presence_exceptions: [
    "status",
    "revision",
    "reviewed_at",
    "reviewer_membership_id",
    "reviewer_user_id",
    "terminal_at",
    "consumed_decision_id",
  ],
};

export async function provisionShiftPresencePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const [table, columns] of Object.entries(shiftPresenceUpdates)) {
    await client.query(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON TABLE public.%I FROM %I", [
      table,
      runtimeRole,
    ]);
    // Reconcile stale column privileges too; table-level REVOKE alone is insufficient.
    const result = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1`,
      [table],
    );
    for (const { column_name: column } of result.rows) {
      await executeFormatted(
        client,
        "REVOKE UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM PUBLIC",
        [column, column, table],
      );
      await executeFormatted(
        client,
        "REVOKE UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM %I",
        [column, column, table, runtimeRole],
      );
    }
    await executeFormatted(
      client,
      "GRANT SELECT, INSERT ON TABLE public.%I TO %I",
      [table, runtimeRole],
    );
    for (const column of columns) {
      await executeFormatted(
        client,
        "GRANT UPDATE (%I) ON TABLE public.%I TO %I",
        [column, table, runtimeRole],
      );
    }
  }
  await executeFormatted(
    client,
    "GRANT EXECUTE ON FUNCTION public.shift_presence_expire_revoked_approval(uuid,uuid,uuid,uuid,text,text,text) TO %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT EXECUTE ON FUNCTION public.shift_presence_set_policy(uuid,uuid,uuid,text,uuid,uuid,text,text,boolean,integer,integer,uuid) TO %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT EXECUTE ON FUNCTION public.shift_presence_lock_management_entitlement(uuid,uuid,text,uuid) TO %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON FUNCTION public.shift_presence_maintain(integer) FROM %I",
    [runtimeRole],
  );
  for (const functionName of [
    "shift_presence_guard_policy",
    "shift_presence_guard_history",
    "shift_presence_guard_linkage",
    "shift_presence_guard_denial",
    "shift_presence_guard_management_result",
    "shift_presence_guard_completion",
  ]) {
    await executeFormatted(
      client,
      "REVOKE ALL ON FUNCTION public.%I() FROM %I",
      [functionName, runtimeRole],
    );
  }
  await verifyShiftPresencePrivileges(client, runtimeRole);
}

export async function verifyShiftPresencePrivileges(client, runtimeRole) {
  const functions = [
    [
      "public.shift_presence_expire_revoked_approval(uuid,uuid,uuid,uuid,text,text,text)",
      true,
    ],
    [
      "public.shift_presence_set_policy(uuid,uuid,uuid,text,uuid,uuid,text,text,boolean,integer,integer,uuid)",
      true,
    ],
    [
      "public.shift_presence_lock_management_entitlement(uuid,uuid,text,uuid)",
      true,
    ],
    ["public.shift_presence_maintain(integer)", false],
  ];
  for (const [signature, allowed] of functions) {
    const result = await client.query(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
      p.prosecdef AND p.proowner<>r.oid AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS safe,
      NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS private
      FROM pg_proc p CROSS JOIN pg_roles r WHERE p.oid=$2::regprocedure AND r.rolname=$1`,
      [runtimeRole, signature],
    );
    const row = result.rows[0];
    if (row?.allowed !== allowed || row.safe !== true || row.private !== true)
      throw new Error("Presence function boundary is unsafe.");
  }
  for (const [table, mutableColumns] of Object.entries(shiftPresenceUpdates)) {
    for (const privilege of [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ]) {
      const result = await client.query(
        `SELECT has_table_privilege($1,$2,$3) AS allowed`,
        [runtimeRole, `public.${table}`, privilege],
      );
      if (result.rows[0].allowed !== ["SELECT", "INSERT"].includes(privilege)) {
        throw new Error("Shift Presence runtime table grants are unsafe.");
      }
    }
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [table],
    );
    for (const { column_name: column } of columns.rows) {
      const result = await client.query(
        `SELECT has_column_privilege($1,$2,$3,'UPDATE') AS allowed`,
        [runtimeRole, `public.${table}`, column],
      );
      if (result.rows[0].allowed !== mutableColumns.includes(column)) {
        throw new Error("Shift Presence runtime column grants are unsafe.");
      }
    }
  }
  for (const functionName of [
    "shift_presence_guard_policy",
    "shift_presence_guard_history",
    "shift_presence_guard_linkage",
    "shift_presence_guard_denial",
    "shift_presence_guard_management_result",
    "shift_presence_guard_completion",
  ]) {
    const result = await client.query(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`,
      [runtimeRole, `public.${functionName}()`],
    );
    if (result.rows[0].allowed)
      throw new Error("Runtime must not execute Presence trigger helpers.");
  }
}
