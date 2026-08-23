import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  analyticsPeriodQuerySchema,
  financialAnalyticsResponseSchema,
  incidentAnalyticsResponseSchema,
  operationalAnalyticsResponseSchema,
  queueSnapshotResponseSchema,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  RUNTIME_POSTGRES_POOL,
} from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import type { AnalyticsPeriod } from "./analytics-period";
import { validateAnalyticsPeriod } from "./analytics-period";
import { financialAnalytics } from "./analytics-financial-query";
import { incidentAnalytics } from "./analytics-incidents-query";
import { operationalAnalytics } from "./analytics-operations-query";
import { queueSnapshot } from "./analytics-queue-query";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/dashboard/locations/:locationId/analytics")
export class DashboardAnalyticsController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async scope(
    request: ApiRequest,
    authorization: string | undefined,
    locationId: string,
  ): Promise<{ authenticatedUserId: string; locationId: string }> {
    const headers = request.rawHeaders;
    let count = 0;
    if (headers === undefined || headers.length % 2 !== 0) {
      throw new UnauthorizedException();
    }
    for (let index = 0; index < headers.length; index += 2) {
      if (headers[index]?.toLowerCase() === "authorization") count += 1;
    }
    if (count !== 1) throw new UnauthorizedException();
    return {
      authenticatedUserId: (await this.principals.resolve(authorization)).userId,
      locationId: uuid(locationId),
    };
  }

  private async periodScope(
    request: ApiRequest,
    authorization: string | undefined,
    locationId: string,
    query: unknown,
  ): Promise<{ authenticatedUserId: string; locationId: string; period: AnalyticsPeriod }> {
    const base = await this.scope(request, authorization, locationId);
    const parsed = analyticsPeriodQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new ApiTransportValidationError();
    return {
      ...base,
      period: validateAnalyticsPeriod(parsed.data.from, parsed.data.to),
    };
  }

  private async plainScope(
    request: ApiRequest,
    authorization: string | undefined,
    locationId: string,
  ) {
    return this.scope(request, authorization, locationId);
  }

  @Get("operations")
  operations(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_ANALYTICS_OPERATIONS",
      request,
      async () => {
        const scope = await this.periodScope(
          request,
          authorization,
          locationId,
          query,
        );
        return operationalAnalyticsResponseSchema.parse(
          await operationalAnalytics(this.pool, scope),
        );
      },
    );
  }

  @Get("financial")
  financial(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_ANALYTICS_FINANCIAL",
      request,
      async () => {
        const scope = await this.periodScope(
          request,
          authorization,
          locationId,
          query,
        );
        return financialAnalyticsResponseSchema.parse(
          await financialAnalytics(this.pool, scope),
        );
      },
    );
  }

  @Get("incidents")
  incidents(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_ANALYTICS_INCIDENTS",
      request,
      async () => {
        const scope = await this.periodScope(
          request,
          authorization,
          locationId,
          query,
        );
        return incidentAnalyticsResponseSchema.parse(
          await incidentAnalytics(this.pool, scope),
        );
      },
    );
  }

  @Get("queue")
  queue(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
  ) {
    return this.runner.run("DASHBOARD_ANALYTICS_QUEUE", request, async () => {
      const scope = await this.plainScope(request, authorization, locationId);
      return queueSnapshotResponseSchema.parse(
        await queueSnapshot(this.pool, scope),
      );
    });
  }
}
