import type { ManagementIntegrationsResponse } from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { DigitalPaymentProviderRegistry } from "../payments/digital-payment-provider";
import { authorizeCompanyAdminManagement } from "./management-authorization";
import { projectManagementIntegrations } from "./management-integrations-status";

@Injectable()
export class ManagementIntegrationsService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly paymentRegistry: DigitalPaymentProviderRegistry,
  ) {}

  read(
    context: StaffSessionContext,
    organizationId: string,
  ): Promise<ManagementIntegrationsResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const scope = await authorizeCompanyAdminManagement(transaction, context, {
        capability: "COMPANY_DASHBOARD_READ",
        organizationId,
      });
      await recordAdminActivityInTransaction(transaction, context);
      return projectManagementIntegrations(
        scope.organizationId,
        process.env,
        this.paymentRegistry,
      );
    });
  }
}
