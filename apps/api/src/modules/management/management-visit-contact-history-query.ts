import type { PostgresTransaction } from "../../common/database/postgres";
import type { VisitContactViewer } from "./management-visit-contact-authorization";
import type { VisitHistorySubject } from "./management-visit-contact-cursor";

export interface VisitHistoryRow {
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly customerId: string | null;
  readonly displayName: string | null;
  readonly locationId: string;
  readonly locationName: string;
  readonly phoneNormalized: string | null;
  readonly plateCountry: string | null;
  readonly plateNumberRaw: string | null;
  readonly returningContact: boolean;
  readonly state: string;
  readonly valetSessionId: string;
  readonly vehicleId: string;
}

function locationIds(viewer: VisitContactViewer): readonly string[] | null {
  return viewer.locationIds === null ? null : [...viewer.locationIds];
}

export async function queryVisitHistory(
  transaction: PostgresTransaction,
  input: {
    readonly boundary: { readonly createdAt: Date; readonly id: string } | null;
    readonly limit: number;
    readonly snapshot: string;
    readonly snapshotCreatedAt: Date;
    readonly subject: VisitHistorySubject;
    readonly subjectId: string;
    readonly viewer: VisitContactViewer;
  },
): Promise<readonly VisitHistoryRow[]> {
  const subjectPredicate = input.subject === "CUSTOMER"
    ? "session.customer_id = $3::uuid"
    : "session.vehicle_id = $3::uuid";
  const result = await transaction.query<VisitHistoryRow>(
    `SELECT session.id::text AS "valetSessionId",
            session.customer_id::text AS "customerId",
            session.vehicle_id::text AS "vehicleId",
            session.location_id::text AS "locationId",
            location.name AS "locationName",
            session.state::text AS state, session.created_at AS "createdAt",
            session.completed_at AS "completedAt",
            customer.display_name AS "displayName",
            customer.phone_normalized AS "phoneNormalized",
            vehicle.plate_country AS "plateCountry",
            vehicle.plate_number_raw AS "plateNumberRaw",
            CASE WHEN customer.phone_normalized IS NULL THEN FALSE ELSE EXISTS (
              SELECT 1
              FROM valet_sessions AS prior
              INNER JOIN customers AS prior_customer
                ON prior_customer.id = prior.customer_id
               AND prior_customer.organization_id = prior.organization_id
              WHERE prior.organization_id = session.organization_id
                AND prior.state = 'COMPLETED'
                AND prior_customer.phone_normalized = customer.phone_normalized
                AND (prior.created_at, prior.id) < (session.created_at, session.id)
                AND (prior.pagination_birth_xid IS NULL OR
                     pg_visible_in_snapshot(prior.pagination_birth_xid, $7::pg_snapshot))
                AND ($2::uuid[] IS NULL OR prior.location_id = ANY($2::uuid[]))
            ) END AS "returningContact"
     FROM valet_sessions AS session
     INNER JOIN locations AS location
       ON location.id = session.location_id
      AND location.organization_id = session.organization_id
     INNER JOIN vehicles AS vehicle
       ON vehicle.id = session.vehicle_id
      AND vehicle.organization_id = session.organization_id
     LEFT JOIN customers AS customer
       ON customer.id = session.customer_id
      AND customer.organization_id = session.organization_id
     WHERE session.organization_id = $1
       AND ($2::uuid[] IS NULL OR session.location_id = ANY($2::uuid[]))
       AND ${subjectPredicate}
       AND session.created_at <= $4
       AND (session.pagination_birth_xid IS NULL OR
            pg_visible_in_snapshot(session.pagination_birth_xid, $7::pg_snapshot))
       AND ($5::timestamptz IS NULL OR
            (session.created_at, session.id) < ($5::timestamptz, $6::uuid))
     ORDER BY session.created_at DESC, session.id DESC
     LIMIT $8`,
    [
      input.viewer.organizationId,
      locationIds(input.viewer),
      input.subjectId,
      input.snapshotCreatedAt,
      input.boundary?.createdAt ?? null,
      input.boundary?.id ?? null,
      input.snapshot,
      input.limit + 1,
    ],
  );
  return result.rows;
}
