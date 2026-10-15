import type { PostgresPool } from "../../common/database/postgres";
import type { PhotoIntegrityJournal } from "./condition-photo-maintenance-integrity";

interface RawAvailable {
  readonly photo_id: string;
  readonly object_key: string;
  readonly object_version: string;
  readonly byte_size: number;
  readonly sha256: Buffer;
  readonly width: number;
  readonly height: number;
  readonly bucket_alias: string;
  readonly availability: "AVAILABLE";
}

/** A cursor cycles through immutable UUIDs; no full-table role grant. */
export class PostgresConditionPhotoIntegrityJournal implements PhotoIntegrityJournal {
  private afterPhotoId: string | null = null;

  constructor(private readonly pool: PostgresPool) {}

  async availableCandidates(limit: number) {
    const query = `SELECT * FROM public.condition_photo_maintenance_available_candidates(
       $1::integer,$2::uuid)`;
    let result = await this.pool.query<RawAvailable>(query, [limit, this.afterPhotoId]);
    if (result.rows.length === 0 && this.afterPhotoId) {
      this.afterPhotoId = null;
      result = await this.pool.query<RawAvailable>(query, [limit, null]);
    }
    this.afterPhotoId = result.rows.at(-1)?.photo_id ?? null;
    return result.rows.map((row) => ({
      photoId: row.photo_id, objectKey: row.object_key,
      version: row.object_version, byteSize: row.byte_size,
      sha256: row.sha256, width: row.width, height: row.height,
      bucketAlias: row.bucket_alias, availability: row.availability,
    }));
  }

  async markUnavailable(
    photoId: string,
    reason: "MISSING_OBJECT" | "CONTENT_MISMATCH",
  ): Promise<boolean> {
    const result = await this.pool.query<{ changed: boolean }>(
      `SELECT public.condition_photo_maintenance_mark_unavailable(
         $1::uuid,$2::text) AS changed`,
      [photoId, reason],
    );
    return result.rows[0]?.changed === true;
  }
}
