import {
  Controller,
  Get,
  Headers,
  Inject,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  dashboardFeatureAuthorityQuerySchema,
  dashboardFeatureAuthorityResponseSchema,
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
import { requireSingleManagementAuthorization } from "../management/staff-management-http";
import { DashboardFeatureAuthorityService } from "./dashboard-feature-authority.service";

@Controller("v1/staff/dashboard/feature-authority")
export class DashboardFeatureAuthorityController {
  constructor(
    private readonly authority: DashboardFeatureAuthorityService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get()
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("DASHBOARD_FEATURE_AUTHORITY_READ", request, async () => {
      requireSingleManagementAuthorization(request);
      const query = dashboardFeatureAuthorityQuerySchema.safeParse(rawQuery ?? {});
      if (!query.success) throw new ApiTransportValidationError();
      return dashboardFeatureAuthorityResponseSchema.parse(
        await this.authority.read(
          await this.sessions.resolve(authorization),
          query.data,
        ),
      );
    });
  }
}
