import { Inject, Injectable } from "@nestjs/common";
import type {
  ClearConfigurationOverrideRequest,
  ConfigurationSettingProjection,
  LocationConfigurationResponse,
  SetConfigurationOverrideRequest,
} from "@valet/contracts";

import {
  RUNTIME_POSTGRES_POOL,
} from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { isCurrencyAmountRepresentable } from "../../common/financial/currency-minor-units";
import {
  DashboardConfigurationError,
  mapDashboardConfigurationDatabaseError,
} from "./dashboard-configuration-errors";
import {
  buildSettingProjections,
  loadLocationConfigurationRow,
} from "./dashboard-configuration-projection";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
import type { DashboardLocationScope } from "./dashboard-location-authorization";

const moneyInputPattern = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
const maximumFeeMills = 99_999_999_999_999n;

function requireRepresentableFee(
  value: string,
  currency: string,
): string {
  if (!moneyInputPattern.test(value)) {
    throw new DashboardConfigurationError("CONFIGURATION_VALUE_INVALID");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const mills =
    BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0") || "0");
  if (mills > maximumFeeMills) {
    throw new DashboardConfigurationError("CONFIGURATION_VALUE_INVALID");
  }
  if (!isCurrencyAmountRepresentable(currency, mills)) {
    throw new DashboardConfigurationError("CONFIGURATION_VALUE_INVALID");
  }
  return `${mills / 1000n}.${(mills % 1000n).toString().padStart(3, "0")}`;
}

function overrideValueText(request: SetConfigurationOverrideRequest): string {
  return typeof request.value === "string"
    ? request.value
    : String(request.value);
}

async function requireAuthorizedScope(
  transaction: Parameters<typeof authorizeDashboardLocation>[0],
  authenticatedUserId: string,
  locationId: string,
): Promise<DashboardLocationScope> {
  const scope = await authorizeDashboardLocation(
    transaction,
    authenticatedUserId,
    locationId,
  );
  if (scope === null) {
    throw new DashboardConfigurationError("AUTHORIZATION_DENIED");
  }
  return scope;
}

async function readResponse(
  transaction: Parameters<typeof loadLocationConfigurationRow>[0],
  scope: DashboardLocationScope,
): Promise<LocationConfigurationResponse> {
  const context = await loadLocationConfigurationRow(
    transaction,
    scope.locationId,
  );
  return {
    currency: context.currency,
    locationId: scope.locationId,
    organizationId: scope.organizationId,
    settings: buildSettingProjections(context.row),
    timezone: context.timezone,
    updatedAt: context.updatedAt.toISOString(),
  };
}

@Injectable()
export class DashboardConfigurationService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  read(
    input: Readonly<{ authenticatedUserId: string; locationId: string }>,
  ): Promise<LocationConfigurationResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const scope = await requireAuthorizedScope(
        transaction,
        input.authenticatedUserId,
        input.locationId,
      );
      return readResponse(transaction, scope);
    });
  }

  async setOverride(
    input: Readonly<
      SetConfigurationOverrideRequest & {
        authenticatedUserId: string;
        locationId: string;
      }
    >,
  ): Promise<{
    readonly result: ConfigurationSettingProjection;
    readonly updatedAt: string;
  }> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const scope = await requireAuthorizedScope(
        transaction,
        input.authenticatedUserId,
        input.locationId,
      );
      let valueText = overrideValueText(input);
      if (input.setting === "valetServiceFee") {
        const location = await transaction.query<{ currency: string }>(
          `SELECT currency FROM locations
           WHERE id = $1 AND organization_id = $2`,
          [scope.locationId, scope.organizationId],
        );
        valueText = requireRepresentableFee(
          input.value,
          location.rows[0]?.currency ?? "",
        );
      }
      try {
        await transaction.query(
          `SELECT location_configuration_set_override(
              $1::uuid, $2::uuid, $3::text, $4::text, $5::timestamptz
           ) AS token`,
          [
            scope.membershipId,
            scope.locationId,
            input.setting,
            valueText,
            input.expectedUpdatedAt,
          ],
        );
      } catch (error) {
        mapDashboardConfigurationDatabaseError(error);
      }
      return this.mutatedResult(transaction, scope, input.setting);
    });
  }

  async clearOverride(
    input: Readonly<
      ClearConfigurationOverrideRequest & {
        authenticatedUserId: string;
        locationId: string;
      }
    >,
  ): Promise<{
    readonly result: ConfigurationSettingProjection;
    readonly updatedAt: string;
  }> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const scope = await requireAuthorizedScope(
        transaction,
        input.authenticatedUserId,
        input.locationId,
      );
      try {
        await transaction.query(
          `SELECT location_configuration_clear_override(
              $1::uuid, $2::uuid, $3::text, $4::timestamptz
           ) AS token`,
          [
            scope.membershipId,
            scope.locationId,
            input.setting,
            input.expectedUpdatedAt,
          ],
        );
      } catch (error) {
        mapDashboardConfigurationDatabaseError(error);
      }
      return this.mutatedResult(transaction, scope, input.setting);
    });
  }

  private async mutatedResult(
    transaction: Parameters<typeof loadLocationConfigurationRow>[0],
    scope: DashboardLocationScope,
    setting: ConfigurationSettingProjection["setting"],
  ): Promise<{
    readonly result: ConfigurationSettingProjection;
    readonly updatedAt: string;
  }> {
    const response = await readResponse(transaction, scope);
    const result = response.settings.find(
      (candidate) => candidate.setting === setting,
    );
    if (result === undefined) {
      throw new Error("Mutated configuration setting is missing.");
    }
    return { result, updatedAt: response.updatedAt };
  }
}
