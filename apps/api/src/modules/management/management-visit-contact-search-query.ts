import type { PostgresTransaction } from "../../common/database/postgres";
import type { VisitContactViewer } from "./management-visit-contact-authorization";

export interface VisitCustomerSearchRow {
  readonly associatedVehicles: unknown;
  readonly completedVisitCount: string;
  readonly customerId: string;
  readonly customerUpdatedAt: Date;
  readonly displayName: string | null;
  readonly latestCreatedAt: Date | null;
  readonly latestLocationId: string | null;
  readonly latestLocationName: string | null;
  readonly latestValetSessionId: string | null;
  readonly phoneNormalized: string;
}

export interface VisitVehicleSearchRow {
  readonly completedVisitCount: string;
  readonly latestCreatedAt: Date | null;
  readonly latestLocationId: string | null;
  readonly latestLocationName: string | null;
  readonly latestValetSessionId: string | null;
  readonly plateCountry: string;
  readonly plateNumberRaw: string;
  readonly vehicleId: string;
  readonly vehicleUpdatedAt: Date;
}

function locationIds(viewer: VisitContactViewer): readonly string[] | null {
  return viewer.locationIds === null ? null : [...viewer.locationIds];
}

export async function visitContactDatabaseNow(
  transaction: PostgresTransaction,
): Promise<Date> {
  const result = await transaction.query<{ readonly now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const now = result.rows[0]?.now;
  if (now === undefined) throw new Error("Visit-contact snapshot time unavailable.");
  return now;
}

export async function queryVisitCustomers(
  transaction: PostgresTransaction,
  input: {
    readonly boundaryId: string | null;
    readonly limit: number;
    readonly mode: "NAME" | "PHONE";
    readonly search: string;
    readonly snapshotCreatedAt: Date;
    readonly viewer: VisitContactViewer;
  },
): Promise<readonly VisitCustomerSearchRow[]> {
  const filter = input.mode === "PHONE"
    ? "customer.phone_normalized = $5"
    : "lower(customer.display_name) LIKE $5 ESCAPE '\\'";
  const result = await transaction.query<VisitCustomerSearchRow>(
    `WITH page AS (
       SELECT customer.id, customer.phone_normalized, customer.display_name,
              customer.updated_at
       FROM customers AS customer
       WHERE customer.organization_id = $1
         AND customer.created_at <= $3
         AND ($4::uuid IS NULL OR customer.id > $4::uuid)
         AND ${filter}
         AND EXISTS (
           SELECT 1 FROM valet_sessions AS visible
           WHERE visible.organization_id = $1
             AND visible.customer_id = customer.id
             AND visible.created_at <= $3
             AND ($2::uuid[] IS NULL OR visible.location_id = ANY($2::uuid[]))
         )
       ORDER BY customer.id
       LIMIT $6
     ), scoped AS (
       SELECT session.*, location.name AS location_name
       FROM valet_sessions AS session
       INNER JOIN page ON page.id = session.customer_id
       INNER JOIN locations AS location
         ON location.id = session.location_id AND location.organization_id = $1
       WHERE session.organization_id = $1
         AND session.created_at <= $3
         AND ($2::uuid[] IS NULL OR session.location_id = ANY($2::uuid[]))
     ), counts AS (
       SELECT customer_id, count(*) FILTER (WHERE state = 'COMPLETED') AS completed_count
       FROM scoped GROUP BY customer_id
     ), latest AS (
       SELECT DISTINCT ON (customer_id) customer_id, id, created_at, location_id, location_name
       FROM scoped ORDER BY customer_id, created_at DESC, id DESC
     ), vehicle_last AS (
       SELECT session.customer_id, session.vehicle_id, max(session.created_at) AS last_seen,
              vehicle.plate_country, vehicle.plate_number_raw
       FROM scoped AS session
       INNER JOIN vehicles AS vehicle
         ON vehicle.id = session.vehicle_id AND vehicle.organization_id = $1
       GROUP BY session.customer_id, session.vehicle_id,
                vehicle.plate_country, vehicle.plate_number_raw
     ), vehicle_ranked AS (
       SELECT vehicle_last.*,
              row_number() OVER (PARTITION BY customer_id ORDER BY last_seen DESC, vehicle_id DESC) AS rank
       FROM vehicle_last
     ), vehicle_list AS (
       SELECT customer_id,
              jsonb_agg(jsonb_build_object(
                'vehicleId', vehicle_id::text,
                'plateCountry', plate_country,
                'plateNumberRaw', plate_number_raw
              ) ORDER BY last_seen DESC, vehicle_id DESC) FILTER (WHERE rank <= 5) AS vehicles
       FROM vehicle_ranked GROUP BY customer_id
     )
     SELECT page.id::text AS "customerId", page.phone_normalized AS "phoneNormalized",
            page.display_name AS "displayName", page.updated_at AS "customerUpdatedAt",
            counts.completed_count::text AS "completedVisitCount",
            latest.id::text AS "latestValetSessionId",
            latest.created_at AS "latestCreatedAt",
            latest.location_id::text AS "latestLocationId",
            latest.location_name AS "latestLocationName",
            COALESCE(vehicle_list.vehicles, '[]'::jsonb) AS "associatedVehicles"
     FROM page
     INNER JOIN counts ON counts.customer_id = page.id
     LEFT JOIN latest ON latest.customer_id = page.id
     LEFT JOIN vehicle_list ON vehicle_list.customer_id = page.id
     ORDER BY page.id`,
    [
      input.viewer.organizationId,
      locationIds(input.viewer),
      input.snapshotCreatedAt,
      input.boundaryId,
      input.search,
      input.limit + 1,
    ],
  );
  return result.rows;
}

export async function queryVisitVehicle(
  transaction: PostgresTransaction,
  input: {
    readonly plateCountry: string;
    readonly plateNumberNormalized: string;
    readonly viewer: VisitContactViewer;
  },
): Promise<VisitVehicleSearchRow | null> {
  const result = await transaction.query<VisitVehicleSearchRow>(
    `WITH matched AS (
       SELECT vehicle.id, vehicle.plate_country, vehicle.plate_number_raw, vehicle.updated_at
       FROM vehicles AS vehicle
       WHERE vehicle.organization_id = $1
         AND vehicle.plate_country = $3
         AND vehicle.plate_number_normalized = $4
         AND EXISTS (
           SELECT 1 FROM valet_sessions AS visible
           WHERE visible.organization_id = $1 AND visible.vehicle_id = vehicle.id
             AND ($2::uuid[] IS NULL OR visible.location_id = ANY($2::uuid[]))
         )
     ), scoped AS (
       SELECT session.*, location.name AS location_name
       FROM valet_sessions AS session
       INNER JOIN matched ON matched.id = session.vehicle_id
       INNER JOIN locations AS location
         ON location.id = session.location_id AND location.organization_id = $1
       WHERE session.organization_id = $1
         AND ($2::uuid[] IS NULL OR session.location_id = ANY($2::uuid[]))
     ), latest AS (
       SELECT id, created_at, location_id, location_name
       FROM scoped ORDER BY created_at DESC, id DESC LIMIT 1
     )
     SELECT matched.id::text AS "vehicleId", matched.plate_country AS "plateCountry",
            matched.plate_number_raw AS "plateNumberRaw", matched.updated_at AS "vehicleUpdatedAt",
            count(*) FILTER (WHERE scoped.state = 'COMPLETED')::text AS "completedVisitCount",
            latest.id::text AS "latestValetSessionId", latest.created_at AS "latestCreatedAt",
            latest.location_id::text AS "latestLocationId", latest.location_name AS "latestLocationName"
     FROM matched
     INNER JOIN scoped ON TRUE
     LEFT JOIN latest ON TRUE
     GROUP BY matched.id, matched.plate_country, matched.plate_number_raw, matched.updated_at,
              latest.id, latest.created_at, latest.location_id, latest.location_name`,
    [
      input.viewer.organizationId,
      locationIds(input.viewer),
      input.plateCountry,
      input.plateNumberNormalized,
    ],
  );
  return result.rows[0] ?? null;
}
