import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import { GpsIngestionError } from "./gps-ingestion-errors";
import type {
  CanonicalGpsSample,
  GpsSampleResult,
  LockedGpsSession,
  LockedGpsTask,
  LockedTrackingSession,
  PersistedGpsBatch,
} from "./gps-ingestion-types";

interface ExistingGpsRow {
  readonly client_sample_id: string;
  readonly same_payload: boolean;
}

function sameSample(
  left: CanonicalGpsSample,
  right: CanonicalGpsSample,
): boolean {
  return (
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.capturedAt.getTime() === right.capturedAt.getTime()
  );
}

function uniqueSamples(samples: readonly CanonicalGpsSample[]) {
  const unique = new Map<string, CanonicalGpsSample>();
  for (const sample of samples) {
    const previous = unique.get(sample.clientSampleId);
    if (previous !== undefined && !sameSample(previous, sample)) {
      throw new GpsIngestionError("GPS_SAMPLE_IDEMPOTENCY_CONFLICT");
    }
    unique.set(sample.clientSampleId, previous ?? sample);
  }
  return [...unique.values()];
}

async function loadExisting(
  transaction: PostgresTransaction,
  trackerId: string,
  samples: readonly CanonicalGpsSample[],
): Promise<Map<string, boolean>> {
  if (samples.length === 0) return new Map();
  const result = await transaction.query<ExistingGpsRow>(
    `WITH submitted AS (
       SELECT client_sample_id, latitude_text::numeric(9, 6) AS latitude,
              longitude_text::numeric(9, 6) AS longitude,
              captured_at::timestamptz(3) AS captured_at
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::timestamptz[])
         AS sample(client_sample_id, latitude_text, longitude_text, captured_at)
     )
     SELECT stored.client_sample_id::text,
            stored.latitude = submitted.latitude
              AND stored.longitude = submitted.longitude
              AND stored.captured_at = submitted.captured_at AS same_payload
     FROM raw_gps_samples AS stored
     INNER JOIN submitted
       ON submitted.client_sample_id = stored.client_sample_id
     WHERE stored.tracking_session_id = $1`,
    [
      trackerId,
      samples.map((sample) => sample.clientSampleId),
      samples.map((sample) => sample.latitude),
      samples.map((sample) => sample.longitude),
      samples.map((sample) => sample.capturedAt),
    ],
  );
  return new Map(
    result.rows.map((row) => [row.client_sample_id, row.same_payload]),
  );
}

async function insertNew(
  transaction: PostgresTransaction,
  session: LockedGpsSession,
  task: LockedGpsTask,
  tracker: LockedTrackingSession,
  samples: readonly CanonicalGpsSample[],
): Promise<Set<string>> {
  if (samples.length === 0) return new Set();
  const result = await transaction.query<{ client_sample_id: string }>(
    `INSERT INTO raw_gps_samples
       (id, organization_id, location_id, valet_session_id, task_id,
        tracking_session_id, client_sample_id, latitude, longitude, captured_at)
     SELECT input.id, $1, $2, $3, $4, $5, input.client_sample_id,
            input.latitude_text::numeric(9, 6),
            input.longitude_text::numeric(9, 6), input.captured_at::timestamptz(3)
     FROM unnest($6::uuid[], $7::uuid[], $8::text[], $9::text[],
                 $10::timestamptz[])
       AS input(id, client_sample_id, latitude_text, longitude_text, captured_at)
     ON CONFLICT (tracking_session_id, client_sample_id) DO NOTHING
     RETURNING client_sample_id::text`,
    [
      session.organization_id,
      session.location_id,
      session.id,
      task.id,
      tracker.id,
      samples.map(() => randomUUID()),
      samples.map((sample) => sample.clientSampleId),
      samples.map((sample) => sample.latitude),
      samples.map((sample) => sample.longitude),
      samples.map((sample) => sample.capturedAt),
    ],
  );
  return new Set(result.rows.map((row) => row.client_sample_id));
}

export async function persistGpsSamples(
  transaction: PostgresTransaction,
  session: LockedGpsSession,
  task: LockedGpsTask,
  tracker: LockedTrackingSession,
  samples: readonly CanonicalGpsSample[],
): Promise<PersistedGpsBatch> {
  const unique = uniqueSamples(samples);
  const existing = await loadExisting(transaction, tracker.id, unique);
  if ([...existing.values()].some((same) => !same)) {
    throw new GpsIngestionError("GPS_SAMPLE_IDEMPOTENCY_CONFLICT");
  }
  const candidates = unique.filter(
    (sample) => !existing.has(sample.clientSampleId),
  );
  const inserted = await insertNew(
    transaction,
    session,
    task,
    tracker,
    candidates,
  );
  if (inserted.size !== candidates.length) {
    const raced = candidates.filter(
      (sample) => !inserted.has(sample.clientSampleId),
    );
    const racedExisting = await loadExisting(transaction, tracker.id, raced);
    if (
      racedExisting.size !== raced.length ||
      [...racedExisting.values()].some((same) => !same)
    ) {
      throw new GpsIngestionError("GPS_SAMPLE_IDEMPOTENCY_CONFLICT");
    }
  }
  const seen = new Set<string>();
  const results: GpsSampleResult[] = samples.map((sample) => {
    const first = !seen.has(sample.clientSampleId);
    seen.add(sample.clientSampleId);
    return {
      clientSampleId: sample.clientSampleId,
      status:
        first && inserted.has(sample.clientSampleId) ? "ACCEPTED" : "DUPLICATE",
    };
  });
  return {
    acceptedSamples: unique.filter((sample) =>
      inserted.has(sample.clientSampleId),
    ),
    results,
  };
}
