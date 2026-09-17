import type {
  ManagementLocationSettingSetRequest,
  ManagementSettingSetRequest,
  OperatingHoursValue,
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

function scalarValue(command: ManagementSettingSetRequest): string {
  if (command.setting === "operatingHours") {
    throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
  }
  return String(command.value);
}

function hoursArrays(value: OperatingHoursValue) {
  return {
    closesAt: value.days.map((day) => day.status === "CLOSED" ? null : day.closesAt),
    isClosed: value.days.map((day) => day.status === "CLOSED"),
    opensAt: value.days.map((day) => day.status === "CLOSED" ? null : day.opensAt),
    weekdays: value.days.map((day) => day.weekday),
  };
}

async function mutation(
  transaction: PostgresTransaction,
  sql: string,
  parameters: unknown[],
): Promise<MutationRow> {
  try {
    const result = await transaction.query<MutationRow>(sql, parameters);
    const row = result.rows[0];
    if (row === undefined) throw new Error("Management settings mutation returned no state.");
    if (row.result_code === "CONFIGURATION_CONFLICT") {
      throw new ManagementSettingsError("CONFIGURATION_CONFLICT");
    }
    return row;
  } catch (error) {
    if (error instanceof ManagementSettingsError) throw error;
    mapManagementSettingsDatabaseError(error);
  }
}

export function setCompanySetting(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly command: ManagementSettingSetRequest;
    readonly organizationId: string;
  },
): Promise<MutationRow> {
  const { command } = input;
  if (command.setting === "operatingHours") {
    const value = hoursArrays(command.value);
    return mutation(
      transaction,
      `SELECT * FROM management_settings_set_company_operating_hours(
         $1::uuid,$2::uuid,$3::operating_weekday[],$4::boolean[],
         $5::time[],$6::time[],$7::timestamptz)`,
      [input.actorMembershipId, input.organizationId, value.weekdays, value.isClosed,
       value.opensAt, value.closesAt, command.expectedUpdatedAt],
    );
  }
  return mutation(
    transaction,
    `SELECT * FROM management_settings_set_company_scalar(
       $1::uuid,$2::uuid,$3::text,$4::text,$5::timestamptz)`,
    [input.actorMembershipId, input.organizationId, command.setting,
     scalarValue(command), command.expectedUpdatedAt],
  );
}

export function clearCompanyOperatingHours(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly expectedUpdatedAt: string;
    readonly organizationId: string;
  },
): Promise<MutationRow> {
  return mutation(
    transaction,
    `SELECT * FROM management_settings_clear_company_operating_hours(
       $1::uuid,$2::uuid,$3::timestamptz)`,
    [input.actorMembershipId, input.organizationId, input.expectedUpdatedAt],
  );
}

export function setLocationSetting(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly command: ManagementLocationSettingSetRequest;
    readonly locationId: string;
    readonly organizationId: string;
  },
): Promise<MutationRow> {
  const { command } = input;
  if (command.setting === "slaTargetSeconds") {
    return mutation(
      transaction,
      `SELECT * FROM management_settings_set_location_sla_target(
         $1::uuid,$2::uuid,$3::uuid,$4::integer,$5::timestamptz)`,
      [input.actorMembershipId, input.organizationId, input.locationId,
       command.value, command.expectedUpdatedAt],
    );
  }
  if (command.setting === "operatingHours") {
    const value = hoursArrays(command.value);
    return mutation(
      transaction,
      `SELECT * FROM management_settings_set_location_operating_hours(
         $1::uuid,$2::uuid,$3::uuid,$4::operating_weekday[],$5::boolean[],
         $6::time[],$7::time[],$8::timestamptz)`,
      [input.actorMembershipId, input.organizationId, input.locationId,
       value.weekdays, value.isClosed, value.opensAt, value.closesAt,
       command.expectedUpdatedAt],
    );
  }
  return mutation(
    transaction,
    `SELECT * FROM management_settings_set_location_scalar(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::timestamptz)`,
    [input.actorMembershipId, input.organizationId, input.locationId,
     command.setting, scalarValue(command), command.expectedUpdatedAt],
  );
}

export function clearLocationSetting(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly expectedUpdatedAt: string;
    readonly locationId: string;
    readonly organizationId: string;
    readonly setting: string;
  },
): Promise<MutationRow> {
  if (input.setting === "operatingHours") {
    return mutation(
      transaction,
      `SELECT * FROM management_settings_clear_location_operating_hours(
         $1::uuid,$2::uuid,$3::uuid,$4::timestamptz)`,
      [input.actorMembershipId, input.organizationId, input.locationId,
       input.expectedUpdatedAt],
    );
  }
  if (input.setting === "slaTargetSeconds") {
    return mutation(
      transaction,
      `SELECT * FROM management_settings_clear_location_sla_target(
         $1::uuid,$2::uuid,$3::uuid,$4::timestamptz)`,
      [input.actorMembershipId, input.organizationId, input.locationId,
       input.expectedUpdatedAt],
    );
  }
  return mutation(
    transaction,
    `SELECT * FROM management_settings_clear_location_scalar(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::timestamptz)`,
    [input.actorMembershipId, input.organizationId, input.locationId,
     input.setting, input.expectedUpdatedAt],
  );
}
