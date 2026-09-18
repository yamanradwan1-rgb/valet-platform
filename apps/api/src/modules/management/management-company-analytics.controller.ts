import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  companyAnalyticsPeriodQuerySchema,
  companyAnalyticsResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { validateAnalyticsPeriod } from "../dashboard/analytics-period";
import { ManagementCompanyAnalyticsService } from "./management-company-analytics.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireSingleAuthorization(request: ApiRequest): void {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0)
    throw new UnauthorizedException();
  let count = 0;
  for (let index = 0; index < headers.length; index += 2) {
    if (headers[index]?.toLowerCase() === "authorization") count += 1;
  }
  if (count !== 1) throw new UnauthorizedException();
}

function parseOrganizationId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/management/organizations")
export class ManagementCompanyAnalyticsController {
  constructor(
    private readonly service: ManagementCompanyAnalyticsService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get(":organizationId/analytics/all-locations")
  allLocations(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_COMPANY_ANALYTICS_READ", request, async () => {
      requireSingleAuthorization(request);
      const parsed = companyAnalyticsPeriodQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) throw new ApiTransportValidationError();
      const period = validateAnalyticsPeriod(parsed.data.from, parsed.data.to);
      const context = await this.sessions.resolve(authorization);
      return companyAnalyticsResponseSchema.parse(
        await this.service.allLocations(
          context,
          parseOrganizationId(organizationId),
          period,
        ),
      );
    });
  }
}
