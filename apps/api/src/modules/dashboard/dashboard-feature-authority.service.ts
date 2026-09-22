import type {
  DashboardFeatureAuthorityQuery,
  DashboardFeatureAuthorityResponse,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeManagementAuditLocation,
  authorizeManagementAuditOrganization,
} from "../management/management-audit-authorization";
import { authorizeVisitContactRead } from "../management/management-visit-contact-authorization";

@Injectable()
export class DashboardFeatureAuthorityService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  read(
    context: StaffSessionContext,
    query: DashboardFeatureAuthorityQuery,
  ): Promise<DashboardFeatureAuthorityResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      if (query.feature === "VISIT_CONTACTS") {
        const viewer = await authorizeVisitContactRead(
          transaction,
          context,
          query.organizationId,
        );
        return {
          feature: query.feature,
          organizationId: viewer.organizationId,
          role: viewer.role,
          scope:
            viewer.role === "ORG_ADMIN"
              ? { kind: "ORGANIZATION" as const }
              : { kind: "ORGANIZATION_GRANT_SET" as const },
        };
      }

      const viewer = query.locationId === undefined
        ? await authorizeManagementAuditOrganization(
            transaction,
            context,
            query.organizationId,
          )
        : await authorizeManagementAuditLocation(
            transaction,
            context,
            query.organizationId,
            query.locationId,
          );
      return {
        feature: query.feature,
        organizationId: viewer.organizationId,
        role: viewer.role,
        scope:
          viewer.scope === "ORGANIZATION"
            ? { kind: "ORGANIZATION" as const }
            : { kind: "LOCATION" as const, locationId: viewer.locationId! },
      };
    });
  }
}
