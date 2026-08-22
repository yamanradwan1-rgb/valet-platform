import { randomUUID } from "node:crypto";

import type { ExportFormat, ReportKind } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";

export interface ReportExportAuditInput {
  readonly contentLength: number;
  readonly contentSha256: string;
  readonly format: ExportFormat;
  readonly kind: ReportKind;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
}

export async function appendReportExportAuditEvent(
  transaction: PostgresTransaction,
  input: ReportExportAuditInput,
): Promise<void> {
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, NULL, $4, 'DASHBOARD_REPORT_EXPORT_GENERATED',
             'Location', $3, $5::jsonb, clock_timestamp())`,
    [
      randomUUID(),
      input.organizationId,
      input.locationId,
      input.membershipId,
      JSON.stringify({
        contentLength: input.contentLength,
        contentSha256: input.contentSha256,
        format: input.format,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        reportKind: input.kind,
      }),
    ],
  );
}
