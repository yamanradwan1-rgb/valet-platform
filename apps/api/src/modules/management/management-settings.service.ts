import type {
  ManagementCompanySettingClearRequest,
  ManagementCompanySettingsResponse,
  ManagementLocationSettingsResponse,
  ManagementSettingClearRequest,
  ManagementSettingSetRequest,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "./management-authorization";
import {
  clearCompanyOperatingHours,
  clearLocationSetting,
  setCompanySetting,
  setLocationSetting,
} from "./management-settings-mutation-repository";
import {
  companySettingsProjection,
  locationSettingsProjection,
} from "./management-settings-projection";

@Injectable()
export class ManagementSettingsService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  readCompany(context: StaffSessionContext, organizationId: string) {
    return this.companyTransaction(context, organizationId, "STANDARD", async (transaction) =>
      companySettingsProjection(transaction, organizationId));
  }

  readLocation(context: StaffSessionContext, organizationId: string, locationId: string) {
    return this.locationTransaction(context, organizationId, locationId, "STANDARD",
      async (transaction) => locationSettingsProjection(transaction, organizationId, locationId));
  }

  setCompany(
    context: StaffSessionContext,
    organizationId: string,
    command: ManagementSettingSetRequest,
  ): Promise<ManagementCompanySettingsResponse> {
    return this.companyTransaction(context, organizationId, "SENSITIVE", async (transaction, actor) => {
      await setCompanySetting(transaction, {
        actorMembershipId: actor.membershipId,
        command,
        organizationId,
      });
      return companySettingsProjection(transaction, organizationId);
    });
  }

  clearCompany(
    context: StaffSessionContext,
    organizationId: string,
    command: ManagementCompanySettingClearRequest,
  ): Promise<ManagementCompanySettingsResponse> {
    return this.companyTransaction(context, organizationId, "SENSITIVE", async (transaction, actor) => {
      await clearCompanyOperatingHours(transaction, {
        actorMembershipId: actor.membershipId,
        expectedUpdatedAt: command.expectedUpdatedAt,
        organizationId,
      });
      return companySettingsProjection(transaction, organizationId);
    });
  }

  setLocation(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementSettingSetRequest,
  ): Promise<ManagementLocationSettingsResponse> {
    return this.locationTransaction(context, organizationId, locationId, "SENSITIVE",
      async (transaction, actor) => {
        await setLocationSetting(transaction, {
          actorMembershipId: actor.membershipId, command, locationId, organizationId,
        });
        return locationSettingsProjection(transaction, organizationId, locationId);
      });
  }

  clearLocation(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementSettingClearRequest,
  ): Promise<ManagementLocationSettingsResponse> {
    return this.locationTransaction(context, organizationId, locationId, "SENSITIVE",
      async (transaction, actor) => {
        await clearLocationSetting(transaction, {
          actorMembershipId: actor.membershipId,
          expectedUpdatedAt: command.expectedUpdatedAt,
          locationId,
          organizationId,
          setting: command.setting,
        });
        return locationSettingsProjection(transaction, organizationId, locationId);
      });
  }

  private companyTransaction<T>(
    context: StaffSessionContext,
    organizationId: string,
    assurance: "SENSITIVE" | "STANDARD",
    operation: (transaction: PostgresTransaction, actor: Awaited<ReturnType<typeof authorizeCompanyAdminManagement>>) => Promise<T>,
  ): Promise<T> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      await lockManagementSettingsOrganization(transaction, organizationId,
        assurance === "SENSITIVE" ? "EXCLUSIVE" : "SHARED");
      const actor = await authorizeCompanyAdminManagement(transaction, context, {
        assurance,
        capability: "COMPANY_SETTINGS_MANAGE_ELIGIBLE",
        organizationId,
      });
      const result = await operation(transaction, actor);
      await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  private locationTransaction<T>(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    assurance: "SENSITIVE" | "STANDARD",
    operation: (transaction: PostgresTransaction, actor: Awaited<ReturnType<typeof authorizeCompanyAdminManagement>>) => Promise<T>,
  ): Promise<T> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      await lockManagementSettingsOrganization(transaction, organizationId,
        assurance === "SENSITIVE" ? "EXCLUSIVE" : "SHARED");
      const actor = await authorizeCompanyAdminManagement(transaction, context, {
        assurance,
        capability: "LOCATION_SETTINGS_MANAGE_ELIGIBLE",
        organizationId,
        requireActiveLocation: false,
        targetLocationId: locationId,
      });
      const result = await operation(transaction, actor);
      await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }
}
