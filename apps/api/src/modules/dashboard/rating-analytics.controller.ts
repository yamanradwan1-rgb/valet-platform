import { Controller, Get, Headers, Inject, Param, Query, Req, Res } from "@nestjs/common";
import { customerFeedbackAnalyticsResponseSchema } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import { setNoStoreResponseHeaders, type HeaderResponse } from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  ratingAnalyticsPeriod,
  ratingAnalyticsUuid,
  requireRatingAnalyticsAuthorization,
} from "../management/rating-analytics-http";
import { locationRatingAnalytics } from "./rating-analytics-query";

@Controller("v1/staff/dashboard/locations/:locationId/analytics")
export class DashboardRatingAnalyticsController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("ratings")
  ratings(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("DASHBOARD_RATING_ANALYTICS_READ", request, async () => {
      requireRatingAnalyticsAuthorization(request);
      const period = ratingAnalyticsPeriod(rawQuery);
      const context = await this.sessions.resolve(authorization);
      return customerFeedbackAnalyticsResponseSchema.parse(
        await locationRatingAnalytics(
          this.pool, context, ratingAnalyticsUuid(locationId), period,
        ),
      );
    });
  }
}
