import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  taskRouteRecordingsQuerySchema,
  taskRouteRecordingsResponseSchema,
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
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "../management/staff-management-http";
import { TaskRouteRecordingsService } from "./task-route-recordings.service";

@Controller("v1/staff/tasks")
export class TaskRouteRecordingsController {
  constructor(
    private readonly service: TaskRouteRecordingsService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get(":taskId/route-history-recordings")
  get(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("taskId") taskId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("TASK_ROUTE_RECORDINGS_READ", request, async () => {
      requireSingleManagementAuthorization(request);
      const staffSessionContext = await this.sessions.resolve(authorization);
      const parsed = taskRouteRecordingsQuerySchema.safeParse(query);
      if (!parsed.success) throw new ApiTransportValidationError();
      return taskRouteRecordingsResponseSchema.parse(
        await this.service.execute({
          ...parsed.data,
          staffSessionContext,
          taskId: requireManagementUuid(taskId),
        }),
      );
    });
  }
}
