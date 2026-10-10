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
  liveSessionOverviewListResponseSchema,
  sessionOverviewQuerySchema,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { uuid } from "./overview-query-input";
import { listLiveDashboardSessions } from "./live-sessions-query";

@Controller("v1/staff/dashboard/locations/:locationId/overview")
export class DashboardLiveSessionsController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("live-sessions")
  liveSessions(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("DASHBOARD_OVERVIEW_SESSIONS", request, async () => {
      const headers = request.rawHeaders;
      if (headers === undefined || headers.length % 2 !== 0) {
        throw new UnauthorizedException();
      }
      let authorizationCount = 0;
      for (let index = 0; index < headers.length; index += 2) {
        if (headers[index]?.toLowerCase() === "authorization") {
          authorizationCount += 1;
        }
      }
      if (authorizationCount !== 1) throw new UnauthorizedException();
      const staffSessionContext = await this.sessions.resolve(authorization);
      const parsed = sessionOverviewQuerySchema.safeParse(query);
      if (!parsed.success) throw new ApiTransportValidationError();
      const result = await listLiveDashboardSessions(this.pool, {
        authenticatedUserId: staffSessionContext.userId,
        staffSessionContext,
        locationId: uuid(locationId),
        filter: parsed.data.filter,
        limit: parsed.data.limit,
        ...(parsed.data.cursor === undefined
          ? {}
          : { cursor: parsed.data.cursor }),
      });
      return liveSessionOverviewListResponseSchema.parse(result);
    });
  }
}
