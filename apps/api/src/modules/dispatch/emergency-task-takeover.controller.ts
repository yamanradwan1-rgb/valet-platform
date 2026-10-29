import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  emergencyTakeoverContextQuerySchema,
  emergencyTakeoverContextResponseSchema,
  emergencyTakeoverRequestSchema,
  emergencyTakeoverResponseSchema,
} from "@valet/contracts";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
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
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "../management/staff-management-http";
import { createEmergencyTakeoverCommandExecutor } from "./emergency-takeover-command";
import { readEmergencyTakeoverContext } from "./emergency-task-takeover.detail-query";

@Controller("v1/staff")
export class EmergencyTaskTakeoverController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("tasks/:taskId/emergency-takeover-context")
  getContext(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("taskId") taskId: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("TASK_EMERGENCY_TAKEOVER_CONTEXT", request, async () => {
      requireSingleManagementAuthorization(request);
      const staffSessionContext = await this.sessions.resolve(authorization);
      const parsed = emergencyTakeoverContextQuerySchema.safeParse(query);
      if (!parsed.success) throw new ApiTransportValidationError();
      const context = await readEmergencyTakeoverContext(this.pool, {
        taskId: requireManagementUuid(taskId),
        staffSessionContext,
        ...(parsed.data.search === undefined ? {} : { search: parsed.data.search }),
      });
      return emergencyTakeoverContextResponseSchema.parse(context);
    });
  }

  @HttpCode(200)
  @Post("tasks/:taskId/emergency-takeover")
  execute(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("taskId") taskId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("TASK_EMERGENCY_TAKEOVER", request, async () => {
      requireSingleManagementAuthorization(request);
      const staffSessionContext = await this.sessions.resolve(authorization);
      const parsed = emergencyTakeoverRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      const execute = createEmergencyTakeoverCommandExecutor(this.pool);
      return emergencyTakeoverResponseSchema.parse(
        await execute({
          taskId: requireManagementUuid(taskId),
          staffSessionContext,
          ...parsed.data,
        }),
      );
    });
  }
}
