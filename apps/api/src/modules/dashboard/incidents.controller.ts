import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  incidentListQuerySchema,
  incidentOverviewEntrySchema,
  incidentOverviewResponseSchema,
  incidentResolutionRequestSchema,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "../management/staff-management-http";
import { listIncidents } from "./incidents-query";
import { resolveDashboardIncident } from "./incident-resolution-command";

@Controller("v1/staff/dashboard/locations/:locationId/overview/incidents")
export class DashboardIncidentsController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get()
  list(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "DASHBOARD_OVERVIEW_INCIDENTS",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const context = await this.sessions.resolve(authorization);
        const parsed = incidentListQuerySchema.safeParse(query);
        if (!parsed.success) throw new ApiTransportValidationError();
        return incidentOverviewResponseSchema.parse(
          await listIncidents(this.pool, {
            authenticatedUserId: context.userId,
            staffSessionContext: context,
            locationId: requireManagementUuid(locationId),
            limit: parsed.data.limit,
            filter: parsed.data.filter,
            ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
          }),
        );
      },
    );
  }

  @Post(":incidentId/resolve")
  resolve(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("DASHBOARD_INCIDENT_RESOLVE", request, async () => {
      requireSingleManagementAuthorization(request);
      const context = await this.sessions.resolve(authorization);
      const parsed = incidentResolutionRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return incidentOverviewEntrySchema.parse(await resolveDashboardIncident(this.pool, {
        context,
        locationId: requireManagementUuid(locationId),
        incidentId: requireManagementUuid(incidentId),
        request: parsed.data,
      }));
    });
  }
}
