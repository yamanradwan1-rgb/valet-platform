import type {
  ManagementBrandingClearRequest,
  ManagementBrandingSetRequest,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import {
  ManagementSettingsError,
  mapManagementSettingsDatabaseError,
} from "./management-settings-errors";

interface MutationRow {
  readonly changed: boolean;
  readonly result_code: "CONFIGURATION_CONFLICT" | "OK";
  readonly updated_at: Date;
}

async function mutation(
  transaction: PostgresTransaction,
  sql: string,
  parameters: unknown[],
): Promise<MutationRow> {
  try {
    const result = await transaction.query<MutationRow>(sql, parameters);
    const row = result.rows[0];
    if (row === undefined) throw new Error("Management branding mutation returned no state.");
    if (row.result_code === "CONFIGURATION_CONFLICT") {
      throw new ManagementSettingsError("CONFIGURATION_CONFLICT");
    }
    return row;
  } catch (error) {
    if (error instanceof ManagementSettingsError) throw error;
    mapManagementSettingsDatabaseError(error);
  }
}

export function setCompanyBranding(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly command: ManagementBrandingSetRequest;
    readonly organizationId: string;
  },
) {
  return mutation(
    transaction,
    `SELECT * FROM management_branding_set_company_default(
       $1::uuid,$2::uuid,$3::text,$4::text,$5::timestamptz)`,
    [input.actorMembershipId, input.organizationId, input.command.setting,
     input.command.value, input.command.expectedUpdatedAt],
  );
}

export function setLocationBranding(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly command: ManagementBrandingSetRequest;
    readonly locationId: string;
    readonly organizationId: string;
  },
) {
  return mutation(
    transaction,
    `SELECT * FROM management_branding_set_location_override(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::timestamptz)`,
    [input.actorMembershipId, input.organizationId, input.locationId,
     input.command.setting, input.command.value, input.command.expectedUpdatedAt],
  );
}

export function clearLocationBranding(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly command: ManagementBrandingClearRequest;
    readonly locationId: string;
    readonly organizationId: string;
  },
) {
  return mutation(
    transaction,
    `SELECT * FROM management_branding_clear_location_override(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::timestamptz)`,
    [input.actorMembershipId, input.organizationId, input.locationId,
     input.command.setting, input.command.expectedUpdatedAt],
  );
}
