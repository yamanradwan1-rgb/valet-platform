import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import type {
  AbandonedPhotoClaim,
  PhotoMaintenanceJournal,
} from "./condition-photo-maintenance-types";

interface CandidateId { readonly id: string }
interface RawClaim {
  readonly attempt_id: string;
  readonly operation_id: string;
  readonly claim_id: string;
  readonly bucket_alias: string;
  readonly object_key: string;
  readonly status: "ABANDONED";
  readonly selected: boolean;
  readonly verified: boolean;
  readonly held: boolean;
  readonly legacy_referenced: boolean;
}

/** Only SECURITY DEFINER entrypoints. Role has no photo table SELECT/UPDATE. */
export class PostgresConditionPhotoMaintenanceJournal implements PhotoMaintenanceJournal {
  constructor(
    private readonly pool: PostgresPool,
    private readonly bucketAlias: string,
  ) {}

  async expiredOperationIds(limit: number): Promise<readonly string[]> {
    const result = await this.pool.query<CandidateId>(
      `SELECT operation_id::text AS id
       FROM public.condition_photo_maintenance_expired_candidates($1::integer)`,
      [limit],
    );
    return result.rows.map((row) => row.id);
  }

  async expireOperation(operationId: string): Promise<boolean> {
    const result = await this.pool.query<{ expired: boolean }>(
      `SELECT public.condition_photo_expire_operation($1::uuid) AS expired`,
      [operationId],
    );
    return result.rows[0]?.expired === true;
  }

  async abandonedAttemptIds(limit: number): Promise<readonly string[]> {
    const result = await this.pool.query<CandidateId>(
      `SELECT attempt_id::text AS id
       FROM public.condition_photo_maintenance_abandoned_candidates($1::integer)`,
      [limit],
    );
    return result.rows.map((row) => row.id);
  }

  async claimAbandonedAttempt(attemptId: string): Promise<AbandonedPhotoClaim | undefined> {
    const result = await this.pool.query<RawClaim>(
      `SELECT * FROM public.condition_photo_maintenance_claim_abandoned(
         $1::uuid,$2::uuid,$3::text)`,
      [attemptId, randomUUID(), this.bucketAlias],
    );
    const row = result.rows[0];
    return row ? {
      attemptId: row.attempt_id, operationId: row.operation_id,
      claimId: row.claim_id, bucketAlias: row.bucket_alias,
      objectKey: row.object_key, status: row.status,
      selected: row.selected as false, verified: row.verified as false,
      held: row.held as false, legacyReferenced: row.legacy_referenced as false,
    } : undefined;
  }

  async recordCleanupCheck(claim: AbandonedPhotoClaim): Promise<boolean> {
    const result = await this.pool.query<{ recorded: boolean }>(
      `SELECT public.condition_photo_maintenance_finish_claim(
         $1::uuid,$2::uuid) AS recorded`,
      [claim.attemptId, claim.claimId],
    );
    return result.rows[0]?.recorded === true;
  }
}

/** Startup check: no migration, Staff qualification or private-table privilege. */
export async function verifyConditionPhotoMaintenanceDatabaseIdentity(
  pool: PostgresPool,
  role: string,
): Promise<void> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role))
    throw new Error("Photo maintenance role identity invalid.");
  const result = await pool.query<{
    role: string;
    session_role: string;
    can_maintain: boolean;
    can_qualify: boolean;
    can_read_private: boolean;
    can_write_private: boolean;
  }>(
    `SELECT current_user AS role, session_user AS session_role,
       has_function_privilege(current_user,
         'public.condition_photo_maintenance_expired_candidates(integer)','EXECUTE')
         AND has_function_privilege(current_user,
         'public.condition_photo_maintenance_mark_unavailable(uuid,text)','EXECUTE')
         AS can_maintain,
       has_function_privilege(current_user,
         'public.condition_photo_finalize_upload(uuid,uuid,uuid,uuid,uuid,text,bytea,integer,integer,integer)',
         'EXECUTE') AS can_qualify,
       has_table_privilege(current_user,'public.vehicle_photo_verifications','SELECT')
         OR has_table_privilege(current_user,'public.condition_photo_upload_attempts','SELECT')
         AS can_read_private,
       has_table_privilege(current_user,'public.vehicle_photo_verifications','UPDATE')
         OR has_table_privilege(current_user,'public.condition_photo_upload_attempts','UPDATE')
         AS can_write_private`,
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row?.role !== role || row.session_role !== role ||
      row.can_maintain !== true || row.can_qualify !== false ||
      row.can_read_private !== false || row.can_write_private !== false)
    throw new Error("Photo maintenance database role lacks isolation.");
}
