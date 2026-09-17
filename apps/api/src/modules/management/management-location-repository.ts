import type {
  ManagementLocationCreateRequest,
  ManagementLocationCurrencyCorrectionRequest,
  ManagementLocationLifecycleCommand,
  ManagementLocationTimezoneCorrectionRequest,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import {
  ManagementLocationError,
  type ManagementLocationErrorCode,
  mapManagementLocationDatabaseError,
} from "./management-location-errors";

interface MutationRow {
  readonly changed: boolean;
  readonly result_code: "OK" | ManagementLocationErrorCode;
  readonly updated_at: Date;
}

interface CreateRow {
  readonly changed: boolean;
  readonly location_id: string | null;
  readonly result_code: "OK" | ManagementLocationErrorCode;
}

function requireOk<T extends { readonly result_code: string }>(
  row: T | undefined,
): T {
  if (row === undefined)
    throw new Error("Location lifecycle mutation returned no row.");
  if (row.result_code !== "OK") {
    throw new ManagementLocationError(
      row.result_code as ManagementLocationErrorCode,
    );
  }
  return row;
}

async function mutation(
  transaction: PostgresTransaction,
  sql: string,
  parameters: readonly unknown[],
): Promise<MutationRow> {
  try {
    return requireOk(
      (await transaction.query<MutationRow>(sql, [...parameters])).rows[0],
    );
  } catch (error) {
    if (error instanceof ManagementLocationError) throw error;
    return mapManagementLocationDatabaseError(error);
  }
}

export async function createLocation(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly candidateLocationId: string;
    readonly fingerprint: string;
    readonly organizationId: string;
    readonly request: ManagementLocationCreateRequest;
  },
): Promise<{ readonly changed: boolean; readonly locationId: string }> {
  const { request } = input;
  try {
    const row = requireOk(
      (
        await transaction.query<CreateRow>(
          `SELECT * FROM management_location_create(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,
         $8::text,$9::text,$10::text)`,
          [
            input.actorMembershipId,
            input.organizationId,
            request.operationId,
            input.candidateLocationId,
            input.fingerprint,
            request.name,
            request.code,
            request.addressText,
            request.timezone,
            request.currency,
          ],
        )
      ).rows[0],
    );
    if (row.location_id === null)
      throw new Error("Location creation returned no Location id.");
    return { changed: row.changed, locationId: row.location_id };
  } catch (error) {
    if (error instanceof ManagementLocationError) throw error;
    return mapManagementLocationDatabaseError(error);
  }
}

export function activateLocation(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  locationId: string,
  command: ManagementLocationLifecycleCommand,
) {
  return mutation(
    transaction,
    `SELECT * FROM management_location_activate($1::uuid,$2::uuid,$3::uuid,$4::timestamptz)`,
    [actorMembershipId, organizationId, locationId, command.expectedUpdatedAt],
  );
}

export function stopLocationIntake(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  locationId: string,
  command: ManagementLocationLifecycleCommand,
) {
  return mutation(
    transaction,
    `SELECT * FROM management_location_stop_intake($1::uuid,$2::uuid,$3::uuid,$4::timestamptz)`,
    [actorMembershipId, organizationId, locationId, command.expectedUpdatedAt],
  );
}

export function deactivateLocation(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  locationId: string,
  command: ManagementLocationLifecycleCommand,
) {
  return mutation(
    transaction,
    `SELECT * FROM management_location_deactivate($1::uuid,$2::uuid,$3::uuid,$4::timestamptz)`,
    [actorMembershipId, organizationId, locationId, command.expectedUpdatedAt],
  );
}

export function correctLocationCurrency(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  locationId: string,
  command: ManagementLocationCurrencyCorrectionRequest,
) {
  return mutation(
    transaction,
    `SELECT * FROM management_location_correct_currency(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::timestamptz)`,
    [
      actorMembershipId,
      organizationId,
      locationId,
      command.newCurrency,
      command.expectedUpdatedAt,
    ],
  );
}

export function correctLocationTimezone(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  locationId: string,
  command: ManagementLocationTimezoneCorrectionRequest,
) {
  return mutation(
    transaction,
    `SELECT * FROM management_location_correct_timezone(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::timestamptz)`,
    [
      actorMembershipId,
      organizationId,
      locationId,
      command.newTimezone,
      command.reason,
      command.expectedUpdatedAt,
    ],
  );
}
