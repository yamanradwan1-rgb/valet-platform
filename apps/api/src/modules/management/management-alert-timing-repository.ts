import { randomUUID } from "node:crypto";
import {
  managementAlertTimingPreferenceDefaults,
  type ManagementAlertTimingPreferenceValues,
  type ManagementAlertTimingPreferencesResponse,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { appendOrganizationAuditEvent } from "../audit/organization-audit-writer";
import type { AuthorizedAlertTimingPreferenceScope } from "./management-alert-timing-authority";

interface PreferenceRow {
  readonly alt01GraceSeconds: number;
  readonly alt02QueueSeconds: number;
  readonly alt03DeclineSeconds: number;
  readonly alt04StageSeconds: number;
  readonly alt06HandoffSeconds: number;
  readonly alt11UnknownPaymentSeconds: number;
  readonly revision: number;
  readonly updatedAt: Date;
}

const valuesKeys = Object.keys(
  managementAlertTimingPreferenceDefaults,
) as (keyof ManagementAlertTimingPreferenceValues)[];

const columns = `
  alt01_grace_seconds AS "alt01GraceSeconds",
  alt02_queue_seconds AS "alt02QueueSeconds",
  alt03_decline_seconds AS "alt03DeclineSeconds",
  alt04_stage_seconds AS "alt04StageSeconds",
  alt06_handoff_seconds AS "alt06HandoffSeconds",
  alt11_unknown_payment_seconds AS "alt11UnknownPaymentSeconds",
  revision, updated_at AS "updatedAt"`;

function toResponse(
  scope: Pick<
    AuthorizedAlertTimingPreferenceScope,
    "organizationId" | "userId"
  >,
  row: PreferenceRow | undefined,
): ManagementAlertTimingPreferencesResponse {
  const values = {} as Record<
    keyof ManagementAlertTimingPreferenceValues,
    number
  >;
  for (const key of valuesKeys) {
    values[key] = row?.[key] ?? managementAlertTimingPreferenceDefaults[key];
  }
  return {
    organizationId: scope.organizationId,
    userId: scope.userId,
    revision: row?.revision ?? 0,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    values,
  };
}

export async function readOwnAlertTimingPreferences(
  transaction: PostgresTransaction,
  scope: Pick<
    AuthorizedAlertTimingPreferenceScope,
    "organizationId" | "userId"
  >,
): Promise<ManagementAlertTimingPreferencesResponse> {
  const result = await transaction.query<PreferenceRow>(
    `SELECT ${columns} FROM management_alert_timing_preferences
     WHERE organization_id = $1 AND user_id = $2`,
    [scope.organizationId, scope.userId],
  );
  return toResponse(scope, result.rows[0]);
}

/** Caller MUST authorize the exact live User + Organization before invoking. */
export async function readEffectiveManagementAlertTimingPreferences(
  transaction: PostgresTransaction,
  scope: Readonly<{ organizationId: string; userId: string }>,
): Promise<ManagementAlertTimingPreferenceValues> {
  return (await readOwnAlertTimingPreferences(transaction, scope)).values;
}

export class AlertTimingPreferenceConflictError extends Error {
  readonly code = "VERSION_CONFLICT" as const;
  constructor() {
    super("Personal alert timing settings have changed.");
    this.name = "AlertTimingPreferenceConflictError";
  }
}

/**
 * The transaction must already hold the exact user/session, Organization and
 * LM grant or CA membership locks from authorizeOwn... before this write.
 */
export async function saveOwnAlertTimingPreferences(
  transaction: PostgresTransaction,
  scope: AuthorizedAlertTimingPreferenceScope,
  values: ManagementAlertTimingPreferenceValues,
  expectedRevision: number,
): Promise<ManagementAlertTimingPreferencesResponse> {
  // Serialize absent-row first writers and existing CAS writers alike.
  await transaction.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('management-alert-timing:' || $1::text || ':' || $2::text, 0)
     )`,
    [scope.organizationId, scope.userId],
  );
  const current = await transaction.query<PreferenceRow>(
    `SELECT ${columns} FROM management_alert_timing_preferences
     WHERE organization_id = $1 AND user_id = $2 FOR UPDATE`,
    [scope.organizationId, scope.userId],
  );
  const before = current.rows[0];
  const changedKeys = valuesKeys.filter(
    (key) =>
      values[key] !==
      (before?.[key] ?? managementAlertTimingPreferenceDefaults[key]),
  );
  if (changedKeys.length === 0) return toResponse(scope, before);
  const beforeRevision = before?.revision ?? 0;
  if (expectedRevision !== beforeRevision) {
    throw new AlertTimingPreferenceConflictError();
  }
  const newRevision = beforeRevision + 1;
  const params = valuesKeys.map((key) => values[key]);
  const updated =
    before === undefined
      ? await transaction.query<PreferenceRow>(
          `INSERT INTO management_alert_timing_preferences (
           organization_id, user_id,
           alt01_grace_seconds, alt02_queue_seconds, alt03_decline_seconds,
           alt04_stage_seconds, alt06_handoff_seconds,
           alt11_unknown_payment_seconds, revision, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()::timestamptz(3))
         RETURNING ${columns}`,
          [scope.organizationId, scope.userId, ...params, newRevision],
        )
      : await transaction.query<PreferenceRow>(
          `UPDATE management_alert_timing_preferences
         SET alt01_grace_seconds=$3, alt02_queue_seconds=$4,
             alt03_decline_seconds=$5, alt04_stage_seconds=$6,
             alt06_handoff_seconds=$7, alt11_unknown_payment_seconds=$8,
             revision=$9, updated_at=clock_timestamp()::timestamptz(3)
         WHERE organization_id=$1 AND user_id=$2 AND revision=$10
         RETURNING ${columns}`,
          [
            scope.organizationId,
            scope.userId,
            ...params,
            newRevision,
            beforeRevision,
          ],
        );
  const row = updated.rows[0];
  if (row === undefined) throw new AlertTimingPreferenceConflictError();
  await appendOrganizationAuditEvent(transaction, {
    actor: { type: "MEMBERSHIP", membershipId: scope.membershipId },
    allowedMetadataKeys: ["changedKeys", "beforeRevision", "afterRevision"],
    entityId: scope.userId,
    entityType: "User",
    eventId: randomUUID(),
    eventType: "MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED",
    metadata: {
      changedKeys: changedKeys.join(","),
      beforeRevision,
      afterRevision: row.revision,
    },
    occurredAt: row.updatedAt,
    organizationId: scope.organizationId,
  });
  return toResponse(scope, row);
}
