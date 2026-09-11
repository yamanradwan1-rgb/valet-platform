import type { Pool } from "pg";

export interface GuestRetrievalEffects {
  readonly audit_count: number;
  readonly audit_actor: string | null;
  readonly dispatch_count: number;
  readonly dispatch_actor: string | null;
  readonly intent_count: number;
  readonly request_count: number;
  readonly requested_at: Date | null;
  readonly requested_by_customer_id: string | null;
  readonly session_state: string;
  readonly session_version: number;
  readonly task_assignee: string | null;
  readonly task_count: number;
  readonly task_status: string | null;
}

export async function loadGuestRetrievalEffects(
  pool: Pool,
  sessionId: string,
): Promise<GuestRetrievalEffects> {
  const result = await pool.query<GuestRetrievalEffects>(
    `SELECT
       (SELECT count(*)::integer FROM retrieval_requests WHERE valet_session_id = $1 AND status = 'OPEN') AS request_count,
       (SELECT count(*)::integer FROM tasks WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL' AND status = 'QUEUED') AS task_count,
       (SELECT count(*)::integer FROM dispatch_events AS event
        INNER JOIN tasks AS event_task ON event_task.id = event.task_id
        WHERE event.valet_session_id = $1 AND event.event_type = 'QUEUED'
          AND event_task.task_type = 'RETRIEVAL') AS dispatch_count,
       (SELECT event.actor_membership_id::text FROM dispatch_events AS event
        INNER JOIN tasks AS event_task ON event_task.id = event.task_id
        WHERE event.valet_session_id = $1 AND event.event_type = 'QUEUED'
          AND event_task.task_type = 'RETRIEVAL') AS dispatch_actor,
       (SELECT count(*)::integer FROM audit_events WHERE valet_session_id = $1 AND event_type = 'RETRIEVAL_REQUESTED') AS audit_count,
       (SELECT count(*)::integer FROM staff_push_intents WHERE valet_session_id = $1) AS intent_count,
       (SELECT actor_membership_id::text FROM audit_events
        WHERE valet_session_id = $1 AND event_type = 'RETRIEVAL_REQUESTED') AS audit_actor,
       session.state::text AS session_state, session.version AS session_version,
       session.retrieval_requested_at AS requested_at,
       request.requested_by_customer_id::text,
       task.status::text AS task_status,
       task.current_assignee_membership_id::text AS task_assignee
     FROM valet_sessions AS session
     LEFT JOIN retrieval_requests AS request
       ON request.valet_session_id = session.id AND request.status = 'OPEN'
     LEFT JOIN tasks AS task
       ON task.valet_session_id = session.id AND task.task_type = 'RETRIEVAL'
      AND task.status = 'QUEUED'
     WHERE session.id = $1`,
    [sessionId],
  );
  return result.rows[0]!;
}
