import type {
  ManagementBrandingClearRequest,
  ManagementBrandingSetRequest,
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
  clearLocationBranding,
  setCompanyBranding,
  setLocationBranding,
} from "./management-branding-mutation-repository";
import {
  companyBrandingProjection,
  locationBrandingProjection,
} from "./management-branding-projection";

@Injectable()
export class ManagementBrandingService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  readCompany(context: StaffSessionContext, organizationId: string) {
    return this.companyTransaction(context, organizationId, "STANDARD",
      (transaction) => companyBrandingProjection(transaction, organizationId));
  }

  readLocation(context: StaffSessionContext, organizationId: string, locationId: string) {
    return this.locationTransaction(context, organizationId, locationId, "STANDARD",
      (transaction) => locationBrandingProjection(transaction, organizationId, locationId));
  }

  setCompany(context: StaffSessionContext, organizationId: string, command: ManagementBrandingSetRequest) {
    return this.companyTransaction(context, organizationId, "SENSITIVE", async (transaction, actor) => {
      await setCompanyBranding(transaction, {
        actorMembershipId: actor.membershipId, command, organizationId,
      });
      return companyBrandingProjection(transaction, organizationId);
    });
  }

  setLocation(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementBrandingSetRequest,
  ) {
    return this.locationTransaction(context, organizationId, locationId, "SENSITIVE",
      async (transaction, actor) => {
        await setLocationBranding(transaction, {
          actorMembershipId: actor.membershipId, command, locationId, organizationId,
        });
        return locationBrandingProjection(transaction, organizationId, locationId);
      });
  }

  clearLocation(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementBrandingClearRequest,
  ) {
    return this.locationTransaction(context, organizationId, locationId, "SENSITIVE",
      async (transaction, actor) => {
        await clearLocationBranding(transaction, {
          actorMembershipId: actor.membershipId, command, locationId, organizationId,
        });
        return locationBrandingProjection(transaction, organizationId, locationId);
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
        capability: "BRANDING_MANAGE_ELIGIBLE",
        commercialRequirement: "BASIC_BRANDING",
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
        capability: "BRANDING_MANAGE_ELIGIBLE",
        commercialRequirement: "BASIC_BRANDING",
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
