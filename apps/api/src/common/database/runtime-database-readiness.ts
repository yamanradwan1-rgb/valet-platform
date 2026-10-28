import { databaseFailureReason } from "./database-failure-reason";
import type { PostgresPool } from "./postgres";
import {
  RuntimeDatabaseUnavailableError,
  withDatabaseDeadline,
} from "./runtime-database-deadline";

const readinessDeadlineMs = 2_500;

interface RuntimeReadinessRow {
  readonly anti_abuse_ready: boolean;
  readonly guest_browser_ready: boolean;
}

const readinessQuery = `SELECT
  to_regclass('public.anti_abuse_events') IS NOT NULL
    AND has_table_privilege(current_user, 'public.anti_abuse_events', 'SELECT')
    AND has_column_privilege(current_user, 'public.anti_abuse_events', 'scope', 'INSERT')
    AND has_column_privilege(current_user, 'public.anti_abuse_events', 'key_hash', 'INSERT')
    AND has_column_privilege(current_user, 'public.anti_abuse_events', 'state', 'INSERT')
    AND has_column_privilege(current_user, 'public.anti_abuse_events', 'request_class', 'INSERT')
    AND has_column_privilege(current_user, 'public.anti_abuse_events', 'group_key_hash', 'INSERT')
    AND has_column_privilege(current_user, 'public.anti_abuse_events', 'state', 'UPDATE')
    AND has_column_privilege(current_user, 'public.anti_abuse_events', 'group_key_hash', 'UPDATE')
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
      row.guest_browser_ready !== true
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
