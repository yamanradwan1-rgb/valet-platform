import type { PostgresTransaction } from "../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "./security/audit-investigation-authorization";
import { isU05R2IndirectHttpProofCandidate } from "./audit-investigation-u05-gate";
import {
  readR2ProofAttestation,
  r2ProofCoversScope,
} from "./audit-investigation-u05-proof-attestation";

/** A signed pg_snapshot does NOT freeze an Audit row's indirect Task/Incident
 * Session relationship. Neither Task nor its key columns have an approved
 * database-owned birth/revision epoch, so a parent inserted/relinked after S0
 * could make an OLD Audit row qualify only on page 2. Fail closed even if the
 * old Audit row currently has no resolvable Session relationship. This check
 * intentionally spans the whole Location for Timeline (the missing Session
 * relationship cannot safely be scoped to a Session before it is resolved).
 */
export async function requireU05StableIndirectCohort(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  snapshot: { readonly now: Date; readonly database: string },
  window?: { readonly from: string; readonly to: string },
): Promise<void> {
  if (isU05R2IndirectHttpProofCandidate()) {
    // The independently issued certificate permits ONLY this precise scope /
    // discovery window. No other Location/cohort can bypass the conservative
    // veto. The source/parent XID fences and fresh authorization still apply.
    if (!r2ProofCoversScope(scope.organizationId, scope.locationId, window))
      throw new U05IndirectCohortNotStable();
    const proof = readR2ProofAttestation();
    if (!proof) throw new U05IndirectCohortNotStable();
    const attested = await tx.query<{ readonly valid: boolean }>(
      `WITH birth(name, table_name) AS (VALUES
         ('audit_events_pagination_birth_insert','audit_events'),
         ('audit_events_pagination_birth_update','audit_events'),
         ('valet_sessions_pagination_birth_insert','valet_sessions'),
         ('valet_sessions_pagination_birth_update','valet_sessions'),
         ('key_custody_events_pagination_birth_insert','key_custody_events'),
         ('key_custody_events_pagination_birth_update','key_custody_events'),
         ('dispatch_events_pagination_birth_insert','dispatch_events'),
         ('dispatch_events_pagination_birth_update','dispatch_events'),
         ('incidents_pagination_birth_insert','incidents'),
         ('incidents_pagination_birth_update','incidents'),
         ('tasks_pagination_birth_insert','tasks'),
         ('tasks_pagination_birth_update','tasks')
       ), immutable(name, table_name) AS (VALUES
         ('tasks_issue300_relation_immutable','tasks'),
         ('incidents_issue300_relation_immutable','incidents'),
         ('valet_sessions_issue300_relation_immutable','valet_sessions'),
         ('audit_events_issue300_relation_immutable','audit_events'),
         ('audit_events_issue300_attribution_immutable','audit_events'),
         ('valet_sessions_issue300_origin_immutable','valet_sessions')
       ), enabled AS (
         SELECT t.tgname, c.relname, t.tgfoid, t.tgtype,
                t.tgattr::text AS trigger_columns
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND NOT t.tgisinternal
           AND t.tgenabled IN ('O', 'A')
       )
       SELECT (
         current_database() = 'issue300_r2'
         AND current_user = 'issue300_r2_w6_runtime'
         AND session_user = 'issue300_r2_w6_runtime'
         AND current_setting('server_version_num')::integer = 170010
         AND date_trunc('milliseconds', pg_postmaster_start_time()) = $1::timestamptz
         AND to_regclass('public._prisma_migrations') IS NOT NULL
         AND NOT has_table_privilege(current_user, 'public._prisma_migrations', 'SELECT')
         AND (SELECT count(*) = 12 FROM birth b JOIN enabled e
              ON e.tgname = b.name AND e.relname = b.table_name
              AND e.tgfoid = 'public.management_pagination_preserve_birth_xid()'::regprocedure
              AND e.tgtype = CASE WHEN b.name LIKE '%_insert' THEN 7 ELSE 19 END
              AND (b.name LIKE '%_insert' OR e.trigger_columns = (
                SELECT a.attnum::text FROM pg_attribute a
                WHERE a.attrelid = ('public.' || b.table_name)::regclass
                  AND a.attname = 'pagination_birth_xid')))
         AND (SELECT count(*) = 6 FROM immutable i JOIN enabled e
              ON e.tgname = i.name AND e.relname = i.table_name
              AND e.tgtype = 19
              AND e.tgfoid = CASE
                WHEN i.name IN ('audit_events_issue300_attribution_immutable',
                  'valet_sessions_issue300_origin_immutable')
                THEN 'public.issue300_prevent_attribution_rewrite()'::regprocedure
                ELSE 'public.issue300_prevent_relation_rewrite()'::regprocedure END)
         AND (SELECT count(*) = 6 FROM pg_attribute a
              JOIN pg_class c ON c.oid = a.attrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
              WHERE n.nspname = 'public'
                AND c.relname IN ('audit_events','valet_sessions',
                  'key_custody_events','dispatch_events','incidents','tasks')
                AND a.attname = 'pagination_birth_xid'
                AND pg_get_expr(d.adbin,d.adrelid) = 'pg_current_xact_id()')
         AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user
           AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR
                r.rolreplication OR r.rolbypassrls OR r.rolinherit))
         AND NOT EXISTS (SELECT 1 FROM pg_auth_members membership
           JOIN pg_roles member ON member.oid = membership.member
           WHERE member.rolname = current_user)
         AND NOT EXISTS (SELECT 1 FROM pg_class class
           JOIN pg_roles owner ON owner.oid = class.relowner
           JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
           WHERE namespace.nspname = 'public' AND owner.rolname = current_user)
         AND NOT EXISTS (SELECT 1 FROM pg_namespace namespace
           JOIN pg_roles owner ON owner.oid = namespace.nspowner
           WHERE namespace.nspname = 'public' AND owner.rolname = current_user)
         AND NOT EXISTS (SELECT 1 FROM pg_database database
           JOIN pg_roles owner ON owner.oid = database.datdba
           WHERE database.datname = current_database() AND owner.rolname = current_user)
         AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
         AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
         AND NOT has_table_privilege(current_user, 'public.tasks', 'DELETE')
         AND NOT has_table_privilege(current_user, 'public.tasks', 'TRUNCATE')
         AND NOT has_table_privilege(current_user, 'public.tasks', 'TRIGGER')
         AND NOT has_table_privilege(current_user, 'public.valet_sessions', 'DELETE')
         AND NOT has_table_privilege(current_user, 'public.valet_sessions', 'TRUNCATE')
         AND NOT has_table_privilege(current_user, 'public.valet_sessions', 'TRIGGER')
         AND NOT has_table_privilege(current_user, 'public.audit_events', 'UPDATE')
         AND NOT has_table_privilege(current_user, 'public.audit_events', 'DELETE')
         AND NOT has_table_privilege(current_user, 'public.audit_events', 'TRUNCATE')
         AND NOT has_table_privilege(current_user, 'public.audit_events', 'TRIGGER')
         AND NOT has_table_privilege(current_user, 'public.incidents', 'DELETE')
         AND NOT has_table_privilege(current_user, 'public.incidents', 'TRUNCATE')
         AND NOT has_table_privilege(current_user, 'public.incidents', 'TRIGGER')
         AND NOT has_table_privilege(current_user, 'public.key_custody_events', 'UPDATE')
         AND NOT has_table_privilege(current_user, 'public.key_custody_events', 'DELETE')
         AND NOT has_table_privilege(current_user, 'public.key_custody_events', 'TRIGGER')
         AND NOT has_table_privilege(current_user, 'public.dispatch_events', 'UPDATE')
         AND NOT has_table_privilege(current_user, 'public.dispatch_events', 'DELETE')
         AND NOT has_table_privilege(current_user, 'public.dispatch_events', 'TRIGGER')
         AND NOT has_table_privilege(current_user, 'public.incidents', 'UPDATE')
         AND has_table_privilege(current_user, 'public.audit_events', 'SELECT')
         AND has_table_privilege(current_user, 'public.valet_sessions', 'UPDATE')
         AND NOT has_function_privilege(current_user,
           'public.management_pagination_preserve_birth_xid()', 'EXECUTE')
         AND NOT has_function_privilege(current_user,
           'public.issue300_prevent_relation_rewrite()', 'EXECUTE')
         AND NOT has_function_privilege(current_user,
           'public.issue300_prevent_attribution_rewrite()', 'EXECUTE')
       ) AS valid`,
      [proof.postgresStartedAt],
    );
    if (attested.rowCount !== 1 || attested.rows[0]?.valid !== true)
      throw new U05IndirectCohortNotStable();
    return;
  }
  const result = await tx.query<{ readonly unsafe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM audit_events AS a
       WHERE a.organization_id = $1::uuid AND a.location_id = $2::uuid
         AND a.created_at <= $3::timestamptz
         AND (a.pagination_birth_xid IS NULL OR
           pg_visible_in_snapshot(a.pagination_birth_xid, $4::pg_snapshot))
         AND ($5::timestamptz IS NULL OR a.occurred_at >= $5::timestamptz)
         AND ($6::timestamptz IS NULL OR a.occurred_at < $6::timestamptz)
         AND (a.entity_type IN ('Task','TASK','Incident','INCIDENT',
                               'Vehicle','VEHICLE')
           OR (a.event_type = 'VALET_SESSION_PARKED'
             AND a.metadata_json ? 'taskId'))
     ) AS unsafe`,
    [
      scope.organizationId,
      scope.locationId,
      snapshot.now,
      snapshot.database,
      window?.from ?? null,
      window?.to ?? null,
    ],
  );
  // No database denial or transient error is converted to "safe".
  if (result.rowCount !== 1 || result.rows[0]?.unsafe !== false) {
    throw new U05IndirectCohortNotStable();
  }
}

export class U05IndirectCohortNotStable extends Error {
  constructor() {
    super("U05_INDIRECT_TASK_INCIDENT_COHORT_UNPROVEN");
  }
}
