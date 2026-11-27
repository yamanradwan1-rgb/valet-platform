import { databaseFailureReason } from "./database-failure-reason";
import type { PostgresPool } from "./postgres";
import { ratingFeedbackReadinessQuery, type FeedbackReadinessRow } from "./rating-feedback-database-readiness";
import {
  RuntimeDatabaseUnavailableError,
  withDatabaseDeadline,
} from "./runtime-database-deadline";

const readinessDeadlineMs = 2_500;

interface RuntimeReadinessRow extends FeedbackReadinessRow {
  readonly anti_abuse_ready: boolean;
  readonly guest_browser_ready: boolean;
}

const legacyReadinessQuery = `SELECT
  to_regclass('public.anti_abuse_events') IS NOT NULL
    AND has_table_privilege(current_user, 'public.anti_abuse_events', 'SELECT')
    AND NOT has_any_column_privilege(current_user,'public.anti_abuse_events','INSERT')
    AND NOT has_any_column_privilege(current_user,'public.anti_abuse_events','UPDATE')
    AND (
      SELECT bool_and(
        to_regprocedure(signature.name) IS NOT NULL
        AND has_function_privilege(
          current_user,to_regprocedure(signature.name),'EXECUTE'
        )
      )
      FROM (VALUES
        ('public.s04_counted(text,text,uuid,bigint,text)'),
        ('public.s04_reserve(text,text,uuid,bigint,text)'),
        ('public.s04_finalize(uuid,text,text,text,uuid,bigint,text)'),
        ('public.s04_guest_classified(text,text,text,integer,integer,integer,integer,integer,integer,integer,uuid,bigint,text)'),
        ('public.s04_cleanup_nonces()')
      ) AS signature(name)
    )
    AND to_regprocedure('public.cleanup_expired_anti_abuse_events()') IS NOT NULL
    AND has_function_privilege(
      current_user,
      'public.cleanup_expired_anti_abuse_events()'::regprocedure,
      'EXECUTE'
    ) AS anti_abuse_ready,
  (
    SELECT bool_and(
      to_regprocedure(required.name) IS NOT NULL
      AND has_function_privilege(
        current_user,
        to_regprocedure(required.name),
        'EXECUTE'
      )
    )
    FROM (
      VALUES
        ('public.guest_browser_enroll(text,text)'),
        ('public.guest_browser_exchange(text,text,text)'),
        ('public.guest_browser_prepare_context(text,text,text,text)'),
        ('public.guest_browser_switch_context(text,text,text,text)'),
        ('public.guest_browser_reconcile_switch(text,text,text)'),
        ('public.guest_browser_resolve(text,boolean)'),
        ('public.guest_browser_end(text)'),
        ('public.guest_browser_rating_submit(text,integer)')
    ) AS required(name)
  ) AS guest_browser_ready`;

const readinessQuery = `SELECT legacy.*, feedback.* FROM (${legacyReadinessQuery}) legacy CROSS JOIN (${ratingFeedbackReadinessQuery("read")}) feedback`;

export async function verifyRuntimeDatabaseReadiness(
  pool: Pick<PostgresPool, "query">,
): Promise<void> {
  try {
    const result = await withDatabaseDeadline(readinessDeadlineMs, () =>
      pool.query<RuntimeReadinessRow>(readinessQuery),
    );
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      row?.anti_abuse_ready !== true ||
      row.guest_browser_ready !== true ||
      row.phase_ready !== true || row.functions_ready !== true ||
      row.owner_ready !== true || row.grants_safe !== true || row.guards_ready !== true
    ) {
      throw new RuntimeDatabaseUnavailableError();
    }
  } catch (error) {
    if (error instanceof RuntimeDatabaseUnavailableError) throw error;
    throw new RuntimeDatabaseUnavailableError(
      databaseFailureReason(error) ?? "DATABASE_UNAVAILABLE",
    );
  }
}
