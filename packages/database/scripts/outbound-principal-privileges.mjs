const senderFunctions = [
  "public.outbound_claim_due(integer)",
  "public.outbound_lease_recipient(uuid,uuid)",
  "public.outbound_dispatch_permit(uuid,uuid,text)",
  "public.outbound_confirm_dispatch(uuid,uuid,uuid,text,text)",
  "public.outbound_release_lease(uuid,uuid,timestamptz)",
  "public.outbound_finish_attempt(uuid,uuid,uuid,text,text,text)",
  "public.outbound_purge_expired_envelopes(integer)",
  "public.outbound_cleanup_stale(integer)",
  "public.outbound_recover_expired(integer)",
];
const webhookFunctions = [
  "public.outbound_resolve_meta_binding(text,text,text)",
  "public.outbound_record_provider_event(uuid,uuid,text,text,text,timestamptz,text,text)",
];

const outboundTables = [
  "outbound_provider_bindings", "outbound_messaging_policies",
  "outbound_messaging_control", "outbound_messaging_permissions",
  "outbound_permission_events", "outbound_message_intents",
  "outbound_message_deliveries", "outbound_message_attempts",
  "outbound_message_envelopes", "outbound_message_events",
  "outbound_message_budgets", "outbound_recipient_budgets",
];

async function sqlFormat(client, format, values) {
  const placeholders = values.map((_, index) => `$${index + 2}::text`).join(", ");
  const result = await client.query(`SELECT format($1,${placeholders}) AS statement`, [format, ...values]);
  return result.rows[0].statement;
}

async function formatted(client, format, values) {
  await client.query(await sqlFormat(client, format, values));
}

function approved(kind) {
  if (kind === "sender") return senderFunctions;
  if (kind === "webhook") return webhookFunctions;
  throw new Error("Unknown outbound database principal kind.");
}

export async function provisionOutboundPrincipal(client, kind, role, database) {
  const profile = await client.query(
    `SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit
       FROM pg_roles WHERE rolname=$1`, [role],
  );
  const p = profile.rows[0];
  if (!p?.rolcanlogin || p.rolsuper || p.rolcreatedb || p.rolcreaterole
    || p.rolreplication || p.rolbypassrls || p.rolinherit) {
    throw new Error("Outbound database principal has unsafe role attributes.");
  }
  const membership = await client.query(
    "SELECT count(*)::int AS count FROM pg_auth_members WHERE member=$1::regrole", [role],
  );
  if (membership.rows[0]?.count !== 0) {
    throw new Error("Outbound principal must have no inherited or SET ROLE memberships.");
  }
  const owner = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relowner=$1::regrole
    ) OR EXISTS (
      SELECT 1 FROM pg_namespace n WHERE n.nspowner=$1::regrole
    ) AS unsafe`, [role]);
  if (owner.rows[0]?.unsafe) throw new Error("Outbound principal must not own database objects.");
  await formatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [database, role]);
  await formatted(client, "REVOKE CREATE,TEMPORARY ON DATABASE %I FROM %I", [database, role]);
  await formatted(client, "REVOKE ALL ON SCHEMA public FROM %I", [role]);
  await formatted(client, "GRANT USAGE ON SCHEMA public TO %I", [role]);
  for (const type of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
    await formatted(client, `REVOKE ALL ON ALL ${type} IN SCHEMA public FROM %I`, [role]);
  }
  for (const signature of approved(kind)) {
    await formatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [signature, role]);
  }
  await verifyOutboundPrincipal(client, kind, role);
}

export async function verifyOutboundPrincipal(client, kind, role) {
  const permitted = new Set(approved(kind));
  for (const table of outboundTables) {
    for (const operation of ["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER"]) {
      const result = await client.query(
        "SELECT has_table_privilege($1,$2,$3) AS allowed",
        [role, `public.${table}`, operation],
      );
      if (result.rows[0]?.allowed) throw new Error("Outbound principal has unsafe table privileges.");
    }
  }
  for (const signature of [...senderFunctions,...webhookFunctions]) {
    const result = await client.query(
      "SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",
      [role, signature],
    );
    if (result.rows[0]?.allowed !== permitted.has(signature)) {
      throw new Error("Outbound principal function access mismatch.");
    }
  }
  for (const table of ["valet_sessions","customers","guest_browser_sessions","audit_events"]) {
    for (const operation of ["UPDATE","DELETE","INSERT"]) {
      const result = await client.query(
        "SELECT has_table_privilege($1,$2,$3) AS allowed",
        [role, `public.${table}`, operation],
      );
      if (result.rows[0]?.allowed) throw new Error("Outbound principal can mutate custody/Guest data.");
    }
  }
}
