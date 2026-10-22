import { Controller, Get, Headers, Inject, Param, Query, Req, Res } from "@nestjs/common";
import { customerFeedbackAnalyticsResponseSchema } from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import { setNoStoreResponseHeaders, type HeaderResponse } from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { ManagementRatingAnalyticsService } from "./management-rating-analytics.service";
import {
  ratingAnalyticsPeriod,
  ratingAnalyticsUuid,
  requireRatingAnalyticsAuthorization,
} from "./rating-analytics-http";

@Controller("v1/staff/management/organizations")
export class ManagementRatingAnalyticsController {
  constructor(
    private readonly service: ManagementRatingAnalyticsService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get(":organizationId/analytics/ratings")
  ratings(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_RATING_ANALYTICS_READ", request, async () => {
      requireRatingAnalyticsAuthorization(request);
      const period = ratingAnalyticsPeriod(rawQuery);
      const context = await this.sessions.resolve(authorization);
      return customerFeedbackAnalyticsResponseSchema.parse(
        await this.service.allLocations(context, ratingAnalyticsUuid(organizationId), period),
      );
    });
  }
}
