import type { CompanyAnalyticsSummary } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { companyLocationBoundsCte } from "./company-analytics-bounds";

interface KpiRow {
  readonly carsHandedOff: CompanyAnalyticsSummary["kpis"]["carsHandedOff"];
  readonly carsPerActiveEmployee: CompanyAnalyticsSummary["kpis"]["carsPerActiveEmployee"];
  readonly keyExceptions: CompanyAnalyticsSummary["kpis"]["keyExceptions"];
  readonly slaCompliance: CompanyAnalyticsSummary["kpis"]["slaCompliance"];
}

export async function queryCompanyKpis(
  transaction: PostgresTransaction,
  parameters: readonly [string, string, string],
): Promise<CompanyAnalyticsSummary["kpis"]> {
  const result = await transaction.query<KpiRow>(
    `WITH ${companyLocationBoundsCte()}, sla_cohort AS (
       SELECT session.location_id, request.requested_at,
              request.sla_target_seconds_snapshot,
              session.retrieval_requested_at, session.ready_at
       FROM retrieval_requests AS request
       INNER JOIN valet_sessions AS session
         ON session.organization_id = request.organization_id
        AND session.id = request.valet_session_id
       INNER JOIN location_bounds AS b ON b.location_id = session.location_id
       WHERE request.organization_id = $1
         AND request.status <> 'CANCELLED'
         AND request.requested_at >= b.period_start
         AND request.requested_at < b.period_end
     ), sla AS (
       SELECT count(*)::int AS request_count,
              count(*) FILTER (
                WHERE sla_target_seconds_snapshot IS NOT NULL
                  AND retrieval_requested_at = requested_at
                  AND ready_at IS NOT NULL AND ready_at >= requested_at
              )::int AS denominator,
              count(*) FILTER (
                WHERE sla_target_seconds_snapshot IS NOT NULL
                  AND retrieval_requested_at = requested_at
                  AND ready_at IS NOT NULL AND ready_at >= requested_at
                  AND EXTRACT(EPOCH FROM (ready_at - requested_at)) <= sla_target_seconds_snapshot
              )::int AS numerator,
              count(*) FILTER (WHERE sla_target_seconds_snapshot IS NULL)::int AS missing_target_count,
              count(*) FILTER (
                WHERE retrieval_requested_at IS NULL OR retrieval_requested_at <> requested_at
                   OR ready_at IS NULL OR ready_at < requested_at
              )::int AS invalid_interval_count,
              count(DISTINCT location_id) FILTER (
                WHERE sla_target_seconds_snapshot IS NOT NULL
                  AND retrieval_requested_at = requested_at
                  AND ready_at IS NOT NULL AND ready_at >= requested_at
              )::int AS contributing_location_count
       FROM sla_cohort
     ), work_memberships AS (
       SELECT session.location_id, session.checked_in_by_membership_id AS membership_id
       FROM valet_sessions AS session
       INNER JOIN location_bounds AS b ON b.location_id = session.location_id
       WHERE session.organization_id = $1
         AND session.created_at >= b.period_start AND session.created_at < b.period_end
       UNION
       SELECT session.location_id, session.check_in_condition_completed_by_membership_id
       FROM valet_sessions AS session
       INNER JOIN location_bounds AS b ON b.location_id = session.location_id
       WHERE session.organization_id = $1
         AND session.check_in_condition_completed_by_membership_id IS NOT NULL
         AND session.check_in_condition_completed_at >= b.period_start
         AND session.check_in_condition_completed_at < b.period_end
       UNION
       SELECT session.location_id, session.completed_by_membership_id
       FROM valet_sessions AS session
       INNER JOIN location_bounds AS b ON b.location_id = session.location_id
       WHERE session.organization_id = $1 AND session.completed_by_membership_id IS NOT NULL
         AND session.completed_at >= b.period_start AND session.completed_at < b.period_end
       UNION
       SELECT event.location_id, event.actor_membership_id
       FROM key_custody_events AS event
       INNER JOIN location_bounds AS b ON b.location_id = event.location_id
       WHERE event.organization_id = $1
         AND event.occurred_at >= b.period_start AND event.occurred_at < b.period_end
       UNION
       SELECT note.location_id, note.recorded_by_membership_id
       FROM condition_notes AS note
       INNER JOIN location_bounds AS b ON b.location_id = note.location_id
       WHERE note.organization_id = $1
         AND note.created_at >= b.period_start AND note.created_at < b.period_end
       UNION
       SELECT photo.location_id, photo.captured_by_membership_id
       FROM vehicle_photos AS photo
       INNER JOIN location_bounds AS b ON b.location_id = photo.location_id
       WHERE photo.organization_id = $1
         AND photo.created_at >= b.period_start AND photo.created_at < b.period_end
       UNION
       SELECT session.location_id, verification.verified_by_membership_id
       FROM handoff_verifications AS verification
       INNER JOIN valet_sessions AS session
         ON session.organization_id = verification.organization_id
        AND session.id = verification.valet_session_id
       INNER JOIN location_bounds AS b ON b.location_id = session.location_id
       WHERE verification.organization_id = $1
         AND verification.verified_by_membership_id IS NOT NULL
         AND verification.verified_at >= b.period_start AND verification.verified_at < b.period_end
       UNION
       SELECT event.location_id, event.actor_membership_id
       FROM dispatch_events AS event
       INNER JOIN location_bounds AS b ON b.location_id = event.location_id
       WHERE event.organization_id = $1 AND event.actor_membership_id IS NOT NULL
         AND event.event_type IN ('ACCEPTED','DECLINED','IN_PROGRESS','COMPLETED')
         AND event.occurred_at >= b.period_start AND event.occurred_at < b.period_end
     ), work AS (
       SELECT count(DISTINCT membership_id)::int AS denominator,
              count(DISTINCT location_id)::int AS evidence_location_count
       FROM work_memberships
     ), completed AS (
       SELECT count(*)::int AS numerator,
              count(*) FILTER (WHERE session.completed_by_membership_id IS NOT NULL)::int AS attributed_count,
              count(*) FILTER (WHERE session.completed_by_membership_id IS NULL)::int AS missing_attribution_count,
              count(DISTINCT session.completed_by_membership_id)::int AS distinct_employee_count
       FROM valet_sessions AS session
       INNER JOIN location_bounds AS b ON b.location_id = session.location_id
       WHERE session.organization_id = $1
         AND session.completed_at >= b.period_start AND session.completed_at < b.period_end
     ), key_exceptions AS (
       SELECT count(*) FILTER (WHERE incident.type IN (
                'KEY_MISSING','WRONG_KEY','KEY_DAMAGED','KEY_LOCKED_INSIDE'))::int AS count,
              count(*) FILTER (WHERE incident.type='KEY_MISSING')::int AS key_missing,
              count(*) FILTER (WHERE incident.type='WRONG_KEY')::int AS wrong_key,
              count(*) FILTER (WHERE incident.type='KEY_DAMAGED')::int AS key_damaged,
              count(*) FILTER (WHERE incident.type='KEY_LOCKED_INSIDE')::int AS key_locked_inside
       FROM incidents AS incident
       INNER JOIN location_bounds AS b ON b.location_id = incident.location_id
       WHERE incident.organization_id = $1
         AND incident.created_at >= b.period_start AND incident.created_at < b.period_end
     )
     SELECT jsonb_build_object(
              'requestCount', sla.request_count,
              'denominator', sla.denominator,
              'numerator', sla.numerator,
              'percentage', CASE WHEN sla.denominator = 0 THEN NULL
                ELSE (sla.numerator::numeric * 100 / sla.denominator::numeric)::numeric(20,2)::text END,
              'missingTargetCount', sla.missing_target_count,
              'invalidOrMissingIntervalCount', sla.invalid_interval_count,
              'contributingLocationCount', sla.contributing_location_count
            ) AS "slaCompliance",
            jsonb_build_object(
              'numerator', completed.numerator,
              'denominator', work.denominator,
              'value', CASE WHEN work.denominator = 0 THEN NULL
                ELSE (completed.numerator::numeric / work.denominator::numeric)::numeric(20,3)::text END,
              'evidenceLocationCount', work.evidence_location_count
            ) AS "carsPerActiveEmployee",
            jsonb_build_object(
              'attributedCount', completed.attributed_count,
              'missingAttributionCount', completed.missing_attribution_count,
              'distinctAttributedEmployeeCount', completed.distinct_employee_count
            ) AS "carsHandedOff",
            jsonb_build_object(
              'count', key_exceptions.count,
              'byType', jsonb_build_array(
                jsonb_build_object('type','KEY_MISSING','count',key_exceptions.key_missing),
                jsonb_build_object('type','WRONG_KEY','count',key_exceptions.wrong_key),
                jsonb_build_object('type','KEY_DAMAGED','count',key_exceptions.key_damaged),
                jsonb_build_object('type','KEY_LOCKED_INSIDE','count',key_exceptions.key_locked_inside)
              )
            ) AS "keyExceptions"
     FROM sla CROSS JOIN work CROSS JOIN completed CROSS JOIN key_exceptions`,
    [...parameters],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Company KPI analytics are missing.");
  return {
    carsHandedOff: row.carsHandedOff,
    carsPerActiveEmployee: row.carsPerActiveEmployee,
    keyExceptions: row.keyExceptions,
    slaCompliance: row.slaCompliance,
  };
}
