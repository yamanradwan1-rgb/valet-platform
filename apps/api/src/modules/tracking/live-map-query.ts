import type { LiveOperationsMapResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  loadLiveMapAreas,
  projectContainingAreas,
} from "./live-map-area-projection";
import { authorizeLiveMap } from "./live-map-authorization";
import { decodeLiveMapCursor, encodeLiveMapCursor } from "./live-map-cursor";

class LiveMapUnavailableError extends Error {
  readonly code = "AUTHORIZATION_DENIED";
}

interface LiveTrackerRow {
  readonly assigneeMembershipId: string;
  readonly capturedAt: Date | null;
  readonly color: string | null;
  readonly freshness: "LIVE" | "STALE" | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly plateCountry: string | null;
  readonly plateNumber: string | null;
  readonly sessionState: "PARKING" | "RETRIEVING";
  readonly startedAt: Date;
  readonly taskId: string;
  readonly taskType: "PARKING" | "RETRIEVAL";
  readonly temporaryDescriptor: string | null;
  readonly trackingSessionId: string;
  readonly valetSessionId: string;
  readonly vehicleId: string;
}

async function loadTrackers(
  transaction: Parameters<typeof authorizeLiveMap>[0],
  input: {
    readonly cursor: ReturnType<typeof decodeLiveMapCursor>;
    readonly limit: number;
    readonly locationId: string;
    readonly observedAt: Date;
    readonly organizationId: string;
  },
) {
  return transaction.query<LiveTrackerRow>(
    `SELECT tracker.id::text AS "trackingSessionId",
            tracker.started_at AS "startedAt",
            session.id::text AS "valetSessionId",
            task.id::text AS "taskId", task.task_type::text AS "taskType",
            session.state::text AS "sessionState",
            task.current_assignee_membership_id::text AS "assigneeMembershipId",
            vehicle.id::text AS "vehicleId", vehicle.plate_country AS "plateCountry",
            vehicle.plate_number_raw AS "plateNumber",
            vehicle.temporary_descriptor AS "temporaryDescriptor",
            vehicle.make, vehicle.model, vehicle.color,
            latest.latitude::text, latest.longitude::text,
            latest.captured_at AS "capturedAt",
            CASE WHEN latest.captured_at IS NULL THEN NULL
                 WHEN latest.captured_at >= $5::timestamptz - interval '60 seconds'
                   THEN 'LIVE' ELSE 'STALE' END AS freshness
     FROM task_tracking_sessions AS tracker
     INNER JOIN tasks AS task
       ON task.organization_id = tracker.organization_id
      AND task.location_id = tracker.location_id
      AND task.valet_session_id = tracker.valet_session_id
      AND task.id = tracker.task_id
     INNER JOIN valet_sessions AS session
       ON session.organization_id = tracker.organization_id
      AND session.location_id = tracker.location_id
      AND session.id = tracker.valet_session_id
     INNER JOIN vehicles AS vehicle
       ON vehicle.organization_id = session.organization_id
      AND vehicle.id = session.vehicle_id
     LEFT JOIN LATERAL (
       SELECT sample.latitude, sample.longitude, sample.captured_at
       FROM raw_gps_samples AS sample
       WHERE sample.organization_id = tracker.organization_id
         AND sample.location_id = tracker.location_id
         AND sample.valet_session_id = tracker.valet_session_id
         AND sample.task_id = tracker.task_id
         AND sample.tracking_session_id = tracker.id
       ORDER BY sample.captured_at DESC, sample.id DESC LIMIT 1
     ) AS latest ON true
     WHERE tracker.organization_id = $1 AND tracker.location_id = $2
       AND tracker.ended_at IS NULL
       AND task.status = 'IN_PROGRESS'
       AND task.current_assignee_membership_id IS NOT NULL
       AND ((task.task_type = 'PARKING' AND session.state = 'PARKING')
         OR (task.task_type = 'RETRIEVAL' AND session.state = 'RETRIEVING'))
       AND ($3::timestamptz IS NULL
         OR (tracker.started_at, tracker.id) > ($3::timestamptz, $4::uuid))
     ORDER BY tracker.started_at, tracker.id LIMIT $6`,
    [
      input.organizationId,
      input.locationId,
      input.cursor?.startedAt ?? null,
      input.cursor?.id ?? null,
      input.observedAt,
      input.limit + 1,
    ],
  );
}

export function createLiveMapQuery(pool: PostgresPool) {
  return (input: {
    readonly authenticatedUserId: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly locationId: string;
  }): Promise<LiveOperationsMapResponse> => {
    const cursor = decodeLiveMapCursor(input.cursor);
    return inPostgresTransaction(pool, async (transaction) => {
      await transaction.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const authorization = await authorizeLiveMap(
        transaction,
        input.authenticatedUserId,
        input.locationId,
      );
      if (authorization === null) throw new LiveMapUnavailableError();
      const clock = await transaction.query<{ observedAt: Date }>(
        `SELECT transaction_timestamp()::timestamptz(3) AS "observedAt"`,
      );
      if (!authorization.trackingEnabled) {
        return {
          items: [],
          nextCursor: null,
          observedAt: clock.rows[0]!.observedAt.toISOString(),
        };
      }
      const result = await loadTrackers(transaction, {
        cursor,
        limit: input.limit,
        locationId: authorization.locationId,
        observedAt: clock.rows[0]!.observedAt,
        organizationId: authorization.organizationId,
      });
      const hasNext = result.rows.length > input.limit;
      const rows = result.rows.slice(0, input.limit);
      const areas = rows.some((row) => row.capturedAt !== null)
        ? await loadLiveMapAreas(
            transaction,
            authorization.organizationId,
            authorization.locationId,
          )
        : [];
      const last = rows.at(-1);
      return {
        items: rows.map((row) => ({
          assigneeMembershipId: row.assigneeMembershipId,
          position:
            row.capturedAt === null
              ? null
              : {
                  areas: [
                    ...projectContainingAreas(
                      { latitude: row.latitude!, longitude: row.longitude! },
                      areas,
                    ),
                  ],
                  capturedAt: row.capturedAt.toISOString(),
                  freshness: row.freshness!,
                  latitude: Number(row.latitude),
                  longitude: Number(row.longitude),
                },
          sessionState: row.sessionState,
          taskId: row.taskId,
          taskType: row.taskType,
          trackingSessionId: row.trackingSessionId,
          valetSessionId: row.valetSessionId,
          vehicle: {
            color: row.color,
            make: row.make,
            model: row.model,
            plateCountry: row.plateCountry,
            plateNumber: row.plateNumber,
            temporaryDescriptor: row.temporaryDescriptor,
            vehicleId: row.vehicleId,
          },
        })),
        nextCursor:
          hasNext && last !== undefined
            ? encodeLiveMapCursor({
                id: last.trackingSessionId,
                startedAt: last.startedAt,
              })
            : null,
        observedAt: clock.rows[0]!.observedAt.toISOString(),
      };
    });
  };
}
