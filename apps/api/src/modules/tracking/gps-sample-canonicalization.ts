import type { PostgresTransaction } from "../../common/database/postgres";
import { GpsIngestionError } from "./gps-ingestion-errors";
import type { CanonicalGpsSample, GpsSampleInput } from "./gps-ingestion-types";

interface CanonicalGpsRow {
  readonly captured_at: Date;
  readonly client_sample_id: string;
  readonly fresh_enough: boolean;
  readonly latitude: string;
  readonly longitude: string;
  readonly not_before_tracker: boolean;
  readonly not_too_future: boolean;
  readonly ordered: boolean;
  readonly ordinal: number;
}

export async function canonicalizeGpsSamples(
  transaction: PostgresTransaction,
  samples: readonly GpsSampleInput[],
  trackerStartedAt: Date,
  operationTime: Date,
): Promise<readonly CanonicalGpsSample[]> {
  const result = await transaction.query<CanonicalGpsRow>(
    `WITH parsed AS (
       SELECT ordinality::integer AS ordinal, client_sample_id,
              latitude_text::numeric(9, 6) AS latitude,
              longitude_text::numeric(9, 6) AS longitude,
              captured_text::timestamptz AS raw_captured_at
       FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[])
         WITH ORDINALITY AS sample(client_sample_id, latitude_text,
                                   longitude_text, captured_text, ordinality)
     ), ordered AS (
       SELECT *, lag(raw_captured_at) OVER (ORDER BY ordinal) AS previous_at
       FROM parsed
     ), canonical AS (
       SELECT ordinal, client_sample_id, latitude, longitude,
              raw_captured_at::timestamptz(3) AS captured_at,
              previous_at IS NULL OR raw_captured_at >= previous_at AS ordered
       FROM ordered
     )
     SELECT ordinal, client_sample_id::text, latitude::text, longitude::text,
            captured_at, ordered,
            captured_at >= $5::timestamptz(3) AS not_before_tracker,
            captured_at >= $6::timestamptz(3) - interval '5 minutes'
              AS fresh_enough,
            captured_at <= $6::timestamptz(3) + interval '30 seconds'
              AS not_too_future
     FROM canonical ORDER BY ordinal`,
    [
      samples.map((sample) => sample.clientSampleId),
      samples.map((sample) => String(sample.latitude)),
      samples.map((sample) => String(sample.longitude)),
      samples.map((sample) => sample.capturedAt),
      trackerStartedAt,
      operationTime,
    ],
  );
  if (
    result.rows.length !== samples.length ||
    result.rows.some(
      (row) =>
        !row.ordered ||
        !row.not_before_tracker ||
        !row.fresh_enough ||
        !row.not_too_future,
    )
  ) {
    throw new GpsIngestionError("REQUEST_INVALID");
  }
  return result.rows.map((row) => ({
    capturedAt: row.captured_at,
    clientSampleId: row.client_sample_id,
    latitude: row.latitude,
    longitude: row.longitude,
    ordinal: row.ordinal,
  }));
}
