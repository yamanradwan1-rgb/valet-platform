import type { PostgresTransaction } from "../../../common/database/postgres";
import { ManagementAccessDeniedError } from "../../management/management-authorization";
import type { SeenOccurrenceCategory } from "./management-alert-seen-source";

interface SeenRow {
  readonly seenAt: Date;
}

export interface SeenReceiptIdentity {
  readonly category: SeenOccurrenceCategory;
  readonly episodeId: string;
  readonly seenAt: string;
}

/**
 * Caller holds current Staff/session + source authorization locks; occurrence
 * sources are immutable append-only committed rows. DB time gates insertion.
 * No UPDATE: concurrency and uncertain-commit retry preserve first seen_at.
 */
export async function insertAuthorizedSeenReceipt(
  transaction: PostgresTransaction,
  input: {
    readonly organizationId: string;
    readonly userId: string;
    readonly category: SeenOccurrenceCategory;
    readonly episodeId: string;
    readonly occurredAt: Date;
  },
): Promise<SeenReceiptIdentity> {
  const params = [
    input.organizationId,
    input.userId,
    input.category,
    input.episodeId,
    input.occurredAt,
  ];
  const inserted = await transaction.query<SeenRow>(
    `INSERT INTO management_alert_seen_receipts (
       organization_id, user_id, category, source_id,
       takeover_operation_id, occurrence_audit_event_id, geofence_event_id)
     SELECT $1::uuid, $2::uuid, $3::varchar(6), $4::uuid,
       CASE WHEN $3 = 'ALT-05' THEN $4::uuid ELSE NULL END,
       CASE WHEN $3 IN ('ALT-07','ALT-13','ALT-15') THEN $4::uuid ELSE NULL END,
       CASE WHEN $3 = 'ALT-09' THEN $4::uuid ELSE NULL END
     WHERE $5::timestamptz <= clock_timestamp()
       AND clock_timestamp() < $5::timestamptz + INTERVAL '7 days'
     ON CONFLICT (organization_id, user_id, category, source_id) DO NOTHING
     RETURNING seen_at AS "seenAt"`,
    params,
  );
  let seenAt = inserted.rows[0]?.seenAt;
  if (seenAt === undefined) {
    // A failed expiry gate must NOT return even an existing receipt. A
    // concurrent winner only becomes visible after its commit/lock release.
    const existing = await transaction.query<SeenRow>(
      `SELECT seen_at AS "seenAt" FROM management_alert_seen_receipts
       WHERE organization_id = $1 AND user_id = $2 AND category = $3
         AND source_id = $4 AND $5::timestamptz <= clock_timestamp()
         AND clock_timestamp() < $5::timestamptz + INTERVAL '7 days'`,
      params,
    );
    seenAt = existing.rows[0]?.seenAt;
  }
  if (!(seenAt instanceof Date)) throw new ManagementAccessDeniedError();
  return { category: input.category, episodeId: input.episodeId, seenAt: seenAt.toISOString() };
}
