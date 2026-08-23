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
import type { OverviewListQuery } from "@valet/contracts";
import {
  activeShiftOverviewResponseSchema,
  financialOverviewResponseSchema,
  incidentOverviewResponseSchema,
  keySlotOverviewResponseSchema,
  overviewListQuerySchema,
  retrievalQueueOverviewResponseSchema,
  sessionOverviewListResponseSchema,
  sessionStateCountsResponseSchema,
  taskOverviewListResponseSchema,
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
import { dashboardSessionStateCounts, listDashboardSessions } from "./overview-sessions-query";
import {
  listDashboardTasks,
  listRetrievalQueue,
} from "./overview-retrieval-tasks-query";
import {
  listActiveShifts,
  listKeyAccountability,
  listOpenIncidents,
} from "./overview-shifts-keys-incidents-query";
import { financialOperationalOverview } from "./overview-financial-query";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseListQuery(value: unknown): OverviewListQuery {
  const result = overviewListQuerySchema.safeParse(value ?? {});
  if (!result.success) throw new ApiTransportValidationError();
  return result.data;
}

function uuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/dashboard/locations/:locationId/overview")
export class DashboardOverviewController {
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
    query?: unknown,
  ) {
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
    return {
      authenticatedUserId,
      list: query === undefined ? undefined : parseListQuery(query),
      locationId: uuid(locationId),
    };
  }

  @Get("sessions")
  sessions(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_OVERVIEW_SESSIONS",
      request,
      async () => {
        const scope = await this.scope(request, authorization, locationId, query);
        const result = await listDashboardSessions(this.pool, {
          authenticatedUserId: scope.authenticatedUserId,
          ...(scope.list!.cursor === undefined ? {} : { cursor: scope.list!.cursor }),
          limit: scope.list!.limit,
          locationId: scope.locationId,
        });
        return sessionOverviewListResponseSchema.parse(result);
      },
    );
  }

  @Get("session-state-counts")
  stateCounts(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
  ) {
    return this.runner.run(
      "DASHBOARD_OVERVIEW_SESSION_STATE_COUNTS",
      request,
      async () => {
        const scope = await this.scope(request, authorization, locationId);
        return sessionStateCountsResponseSchema.parse(
          await dashboardSessionStateCounts(this.pool, {
            authenticatedUserId: scope.authenticatedUserId,
            locationId: scope.locationId,
          }),
        );
      },
    );
  }

  @Get("retrieval-queue")
  retrievalQueue(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_OVERVIEW_RETRIEVAL_QUEUE",
      request,
      async () => {
        const scope = await this.scope(request, authorization, locationId, query);
        const result = await listRetrievalQueue(this.pool, {
          authenticatedUserId: scope.authenticatedUserId,
          ...(scope.list!.cursor === undefined ? {} : { cursor: scope.list!.cursor }),
          limit: scope.list!.limit,
          locationId: scope.locationId,
        });
        return retrievalQueueOverviewResponseSchema.parse(result);
      },
    );
  }

  @Get("tasks")
  tasks(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("DASHBOARD_OVERVIEW_TASKS", request, async () => {
      const scope = await this.scope(request, authorization, locationId, query);
      const result = await listDashboardTasks(this.pool, {
        authenticatedUserId: scope.authenticatedUserId,
        ...(scope.list!.cursor === undefined ? {} : { cursor: scope.list!.cursor }),
        limit: scope.list!.limit,
        locationId: scope.locationId,
      });
      return taskOverviewListResponseSchema.parse(result);
    });
  }

  @Get("active-shifts")
  activeShifts(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_OVERVIEW_ACTIVE_SHIFTS",
      request,
      async () => {
        const scope = await this.scope(request, authorization, locationId, query);
        const result = await listActiveShifts(this.pool, {
          authenticatedUserId: scope.authenticatedUserId,
          ...(scope.list!.cursor === undefined ? {} : { cursor: scope.list!.cursor }),
          limit: scope.list!.limit,
          locationId: scope.locationId,
        });
        return activeShiftOverviewResponseSchema.parse(result);
      },
    );
  }

  @Get("keys")
  keys(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("DASHBOARD_OVERVIEW_KEYS", request, async () => {
      const scope = await this.scope(request, authorization, locationId, query);
      const result = await listKeyAccountability(this.pool, {
        authenticatedUserId: scope.authenticatedUserId,
        ...(scope.list!.cursor === undefined ? {} : { cursor: scope.list!.cursor }),
        limit: scope.list!.limit,
        locationId: scope.locationId,
      });
      return keySlotOverviewResponseSchema.parse(result);
    });
  }

  @Get("incidents")
  incidents(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("DASHBOARD_OVERVIEW_INCIDENTS", request, async () => {
      const scope = await this.scope(request, authorization, locationId, query);
      const result = await listOpenIncidents(this.pool, {
        authenticatedUserId: scope.authenticatedUserId,
        ...(scope.list!.cursor === undefined ? {} : { cursor: scope.list!.cursor }),
        limit: scope.list!.limit,
        locationId: scope.locationId,
      });
      return incidentOverviewResponseSchema.parse(result);
    });
  }

  @Get("financial")
  financial(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
  ) {
    return this.runner.run("DASHBOARD_OVERVIEW_FINANCIAL", request, async () => {
      const scope = await this.scope(request, authorization, locationId);
      return financialOverviewResponseSchema.parse(
        await financialOperationalOverview(this.pool, {
          authenticatedUserId: scope.authenticatedUserId,
          locationId: scope.locationId,
        }),
      );
    });
  }
}
