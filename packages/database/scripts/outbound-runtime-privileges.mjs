const outboundTables = [
  "outbound_provider_bindings", "outbound_messaging_policies",
  "outbound_messaging_control", "outbound_messaging_permissions",
  "outbound_permission_events", "outbound_message_intents",
  "outbound_message_deliveries", "outbound_message_attempts",
  "outbound_message_envelopes", "outbound_message_events",
  "outbound_message_budgets", "outbound_recipient_budgets",
];

const runtimeRead = [
  "outbound_provider_bindings", "outbound_messaging_policies",
  "outbound_messaging_control", "outbound_messaging_permissions",
  "outbound_message_intents", "outbound_message_deliveries",
];

const runtimeInsert = [
  "outbound_provider_bindings", "outbound_messaging_policies",
  "outbound_message_intents", "outbound_message_deliveries",
  "outbound_message_envelopes",
];

const permittedRuntimeFunctions = [
  "public.outbound_permission_change(uuid,text,text,timestamptz,timestamptz,integer,text)",
];

const allFunctions = [
  "public.outbound_claim_due(integer)",
  "public.outbound_release_lease(uuid,uuid,timestamptz)",
  "public.outbound_lease_recipient(uuid,uuid)",
  "public.outbound_dispatch_permit(uuid,uuid,text)",
  "public.outbound_confirm_dispatch(uuid,uuid,uuid,text,text)",
  "public.outbound_finish_attempt(uuid,uuid,uuid,text,text,text)",
  "public.outbound_record_provider_event(uuid,uuid,text,text,text,timestamptz,text,text)",
  "public.outbound_resolve_meta_binding(text,text,text)",
  "public.outbound_purge_expired_envelopes(integer)",
  "public.outbound_cleanup_stale(integer)",
  "public.outbound_recover_expired(integer)",
  ...permittedRuntimeFunctions,
];

export async function provisionOutboundRuntimePrivileges(client, executeFormatted, role) {
  for (const table of outboundTables) {
    await executeFormatted(client, "REVOKE ALL ON TABLE public.%I FROM PUBLIC", [table]);
    await executeFormatted(client, "REVOKE ALL ON TABLE public.%I FROM %I", [table, role]);
  }
  for (const table of runtimeRead) {
    await executeFormatted(client, "GRANT SELECT ON TABLE public.%I TO %I", [table, role]);
  }
  for (const table of runtimeInsert) {
    await executeFormatted(client, "GRANT INSERT ON TABLE public.%I TO %I", [table, role]);
  }
  for (const column of ["enabled","revision","updated_at","config_alias"]) {
    await executeFormatted(client,
      "GRANT UPDATE (%I) ON TABLE public.outbound_provider_bindings TO %I",
      [column, role]);
  }
  for (const column of ["enabled","language","provider_binding_id","template_catalog_version",
    "policy_version","revision","updated_at"]) {
    await executeFormatted(client,
      "GRANT UPDATE (%I) ON TABLE public.outbound_messaging_policies TO %I",
      [column, role]);
  }
  for (const signature of allFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM PUBLIC", [signature]);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [signature, role]);
  }
  for (const signature of permittedRuntimeFunctions) {
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [signature, role]);
  }
}

export async function verifyOutboundRuntimePrivileges(client, role) {
  for (const table of outboundTables) {
    for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const expected = op === "SELECT" && runtimeRead.includes(table)
        || op === "INSERT" && runtimeInsert.includes(table);
      const result = await client.query(
        `SELECT has_table_privilege($1,$2,$3) AS allowed,
          EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(
            COALESCE(c.relacl,acldefault('r',c.relowner))) a
            WHERE c.oid=to_regclass($2) AND a.grantee=0
              AND a.privilege_type=$3) AS public_allowed`,
        [role, `public.${table}`, op],
      );
      if (result.rows[0]?.allowed !== expected || result.rows[0]?.public_allowed !== false) {
        throw new Error(`Outbound API runtime table ACL mismatch: ${table} ${op} expected=${expected} actual=${result.rows[0]?.allowed} public=${result.rows[0]?.public_allowed}`);
      }
    }
  }
  for (const [table, column] of [
    ["outbound_provider_bindings","organization_id"],
    ["outbound_provider_bindings","phone_number_id"],
    ["outbound_messaging_policies","organization_id"],
    ["outbound_messaging_policies","location_id"],
    ["outbound_messaging_control","send_enabled"],
  ]) {
    const result=await client.query(
      "SELECT has_column_privilege($1,$2,$3,'UPDATE') AS allowed",
      [role,`public.${table}`,column],
    );
    if (result.rows[0]?.allowed) throw new Error("Outbound runtime can mutate restricted scope/control.");
  }
  for (const signature of allFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
        EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(
          COALESCE(p.proacl,acldefault('f',p.proowner))) a
          WHERE p.oid=$2::regprocedure AND a.grantee=0
            AND a.privilege_type='EXECUTE') AS public_allowed`,
      [role, signature],
    );
    if (result.rows[0]?.allowed !== permittedRuntimeFunctions.includes(signature)
      || result.rows[0]?.public_allowed !== false) {
      throw new Error("Outbound API runtime function ACL mismatch.");
    }
  }
}
