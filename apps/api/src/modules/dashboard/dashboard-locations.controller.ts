import { Controller, Get, Headers, Inject, Req, UnauthorizedException } from "@nestjs/common";
import { dashboardAuthorizedLocationsResponseSchema } from "@valet/contracts";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  RUNTIME_POSTGRES_POOL,
} from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { listAuthorizedDashboardLocations } from "./dashboard-location-scope-query";

/**
 * D2-005 — public authorized-location bootstrap endpoint.
 *
 * GET /v1/staff/dashboard/locations
 *
 * Returns ONLY the ACTIVE locations the authenticated manager is explicitly
 * authorized to manage, in the deterministic backend order (name, id). The
 * authorization predicates live exclusively inside
 * `listAuthorizedDashboardLocations`; this controller adds no second
 * authorization query and no mutation behavior. Zero authorized locations is
 * a successful empty response — the dashboard treats it as a no-access
 * posture, not as an error.
 *
 * Authentication mirrors the established dashboard controller posture:
 * exactly one Authorization header, resolved through the staff principal
 * resolver (401 otherwise).
 */
@Controller("v1/staff/dashboard/locations")
export class DashboardLocationsController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  @Get()
  authorizedLocations(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
  ): Promise<unknown> {
    return this.runner.run(
      "DASHBOARD_AUTHORIZED_LOCATIONS",
      request,
      async () => {
        const headers = request.rawHeaders;
        let count = 0;
        if (headers === undefined || headers.length % 2 !== 0) {
          throw new UnauthorizedException();
        }
        for (let index = 0; index < headers.length; index += 2) {
          if (headers[index]?.toLowerCase() === "authorization") count += 1;
        }
        if (count !== 1) throw new UnauthorizedException();
        const authenticatedUserId = (
          await this.principals.resolve(authorization)
        ).userId;
        const locations = await inPostgresTransaction(
          this.pool,
          (transaction) =>
            listAuthorizedDashboardLocations(transaction, authenticatedUserId),
        );
        return dashboardAuthorizedLocationsResponseSchema.parse({ locations });
      },
    );
  }
}
