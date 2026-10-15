import type { PostgresPool } from "../../../common/database/postgres";

const requiredFunctions = [
  "public.outbound_claim_due(integer)",
  "public.outbound_lease_recipient(uuid,uuid)",
  "public.outbound_dispatch_permit(uuid,uuid,text)",
  "public.outbound_confirm_dispatch(uuid,uuid,uuid,text,text)",
  "public.outbound_finish_attempt(uuid,uuid,uuid,text,text,text)",
  "public.outbound_cleanup_stale(integer)",
  "public.outbound_purge_expired_envelopes(integer)",
] as const;

const protectedTables = [
  "valet_sessions", "customers", "guest_browser_sessions", "audit_events",
  "outbound_message_deliveries", "outbound_message_attempts",
  "outbound_message_envelopes", "outbound_message_intents",
  "outbound_provider_bindings", "outbound_messaging_permissions",
  "outbound_messaging_control", "outbound_messaging_policies",
  "outbound_message_budgets", "outbound_recipient_budgets",
] as const;

interface SenderRoleRow {
  readonly rolsuper: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolreplication: boolean;
  readonly rolbypassrls: boolean;
  readonly rolinherit: boolean;
  readonly owns_database: boolean;
  readonly role_member_count: number;
  readonly can_create: boolean;
  readonly owns_public_objects: boolean;
}

/** Refuse sender startup if its actual DB principal can affect custody or outbox SQL. */
export async function assertOutboundSenderPrivileges(
  pool: Pick<PostgresPool, "query">,
): Promise<void> {
  const result = await pool.query<SenderRoleRow>(`
    SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
      r.rolbypassrls,r.rolinherit,
      d.datdba=r.oid AS owns_database,
      (SELECT count(*)::integer FROM pg_auth_members m WHERE m.member=r.oid) AS role_member_count,
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relowner=r.oid)
        OR EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
          WHERE n.nspname='public' AND f.proowner=r.oid) AS owns_public_objects,
      has_database_privilege(current_user,current_database(),'CREATE')
        OR has_schema_privilege(current_user,'public','CREATE') AS can_create
    FROM pg_roles r JOIN pg_database d ON d.datname=current_database()
    WHERE r.rolname=current_user`);
  const r = result.rows[0];
  if (
    result.rowCount !== 1 || !r || r.rolsuper || r.rolcreatedb ||
    r.rolcreaterole || r.rolreplication || r.rolbypassrls || r.rolinherit ||
    r.owns_database || r.owns_public_objects || r.role_member_count !== 0 || r.can_create
  ) throw new Error("OUTBOUND_SENDER_ROLE_UNSAFE");

  for (const signature of requiredFunctions) {
    const check = await pool.query<{ readonly allowed: boolean }>(
      "SELECT has_function_privilege(current_user,$1,'EXECUTE') AS allowed",
      [signature],
    );
    if (check.rows[0]?.allowed !== true) {
      throw new Error("OUTBOUND_SENDER_FUNCTION_NOT_READY");
    }
  }
  for (const table of protectedTables) {
    const check = await pool.query<{ readonly unsafe: boolean }>(`
      SELECT has_table_privilege(current_user,$1,'SELECT') OR
        has_table_privilege(current_user,$1,'INSERT') OR
        has_table_privilege(current_user,$1,'UPDATE') OR
        has_table_privilege(current_user,$1,'DELETE') OR
        has_table_privilege(current_user,$1,'TRUNCATE') OR
        has_table_privilege(current_user,$1,'TRIGGER') AS unsafe`,
      [`public.${table}`],
    );
    if (check.rows[0]?.unsafe !== false) {
      throw new Error("OUTBOUND_SENDER_TABLE_PRIVILEGES_UNSAFE");
    }
  }
}
