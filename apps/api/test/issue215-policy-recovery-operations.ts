import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import { createCompleteCheckInConditionCommandExecutor } from
  "../src/modules/valet-sessions/check-in-condition-command";

export interface PhotoTestScope {
  readonly orgId: string;
  readonly locationId: string;
  readonly memberId: string;
  readonly sessionId: string;
  readonly userId: string;
}

export interface ReservedPhoto {
  readonly operation_id: string;
  readonly attempt_id: string;
  readonly object_key: string;
  readonly lease_owner: string;
}

/** Exercises the real condition marker and restricted PostgreSQL functions. */
export function createPolicyRecoveryOperations(pool: () => Pool) {
  const oldOptionalMarker = async (scope: PhotoTestScope): Promise<Date> => {
    const complete = createCompleteCheckInConditionCommandExecutor(pool());
    const result = await complete({
      authenticatedUserId: scope.userId,
      valetSessionId: scope.sessionId,
    });
    return result.completedAt;
  };

  const requirePhoto = async (scope: PhotoTestScope): Promise<void> => {
    await pool().query(
      "UPDATE locations SET check_in_photos_required_override=TRUE WHERE id=$1",
      [scope.locationId],
    );
  };

  const reserveDirect = async (
    connection: Pool | PoolClient,
    scope: PhotoTestScope,
  ): Promise<ReservedPhoto> => {
    const result = await connection.query<ReservedPhoto>(
      `SELECT * FROM public.condition_photo_reserve_upload(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,
         decode(repeat('a',64),'hex'),256,1,'issue215_test')`,
      [scope.userId, scope.memberId, scope.sessionId, randomUUID()],
    );
    return result.rows[0]!;
  };

  return { oldOptionalMarker, requirePhoto, reserveDirect };
}
