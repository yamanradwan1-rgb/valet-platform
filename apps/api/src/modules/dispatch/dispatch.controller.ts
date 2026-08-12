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
  UnauthorizedException,
} from "@nestjs/common";
import {
  acceptTaskRequestSchema,
  acceptTaskResponseSchema,
  assignTaskRequestSchema,
  assignTaskResponseSchema,
  declineTaskRequestSchema,
  declineTaskResponseSchema,
  parkingTaskQueueRequestSchema,
  parkingTaskQueueResponseSchema,
  reassignTaskRequestSchema,
  reassignTaskResponseSchema,
  taskQueueQuerySchema,
  taskQueueResponseSchema,
  type AssignTaskRequest,
  type DeclineTaskRequest,
  type ReassignTaskRequest,
  type TaskQueueQuery,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { DispatchService } from "./dispatch.service";

interface ParseSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T>(schema: ParseSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff")
export class DispatchController {
  constructor(
    private readonly service: DispatchService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async userId(request: ApiRequest, authorization?: string) {
    const rawHeaders = request.rawHeaders;
    let count = 0;
    if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) {
      throw new UnauthorizedException();
    }
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === "authorization") count += 1;
    }
    if (count !== 1) throw new UnauthorizedException();
    return (await this.principals.resolve(authorization)).userId;
  }

  @HttpCode(200)
  @Post("valet-sessions/:sessionId/parking-task/queue")
  async queue(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("PARKING_TASK_QUEUE", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      parse(parkingTaskQueueRequestSchema, body === undefined ? {} : body);
      return parkingTaskQueueResponseSchema.parse(
        await this.service.executeQueueParking({
          authenticatedUserId,
          sessionId: parseUuid(sessionIdRaw),
        }),
      );
    });
  }

  @Get("tasks/queue")
  async queueRead(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() query: unknown,
  ) {
    return this.runner.run("TASK_QUEUE_READ", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse<TaskQueueQuery>(taskQueueQuerySchema, query);
      return taskQueueResponseSchema.parse({
        tasks: await this.service.loadQueue({
          authenticatedUserId,
          locationId: input.locationId,
        }),
      });
    });
  }

  @HttpCode(200)
  @Post("tasks/:taskId/assign")
  async assign(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("taskId") taskIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("TASK_ASSIGN", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse<AssignTaskRequest>(assignTaskRequestSchema, body);
      return assignTaskResponseSchema.parse(
        await this.service.executeAssign({
          authenticatedUserId,
          expectedVersion: input.expectedVersion,
          ...(input.assignmentMode === undefined
            ? {}
            : { assignmentMode: input.assignmentMode }),
          ...(input.targetAssigneeMembershipId === undefined
            ? {}
            : {
                targetAssigneeMembershipId: input.targetAssigneeMembershipId,
              }),
          taskId: parseUuid(taskIdRaw),
        }),
      );
    });
  }

  @HttpCode(200)
  @Post("tasks/:taskId/accept")
  async accept(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("taskId") taskIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("TASK_ACCEPT", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse(acceptTaskRequestSchema, body);
      return acceptTaskResponseSchema.parse(
        await this.service.executeAccept({
          authenticatedUserId,
          expectedVersion: input.expectedVersion,
          taskId: parseUuid(taskIdRaw),
        }),
      );
    });
  }

  @HttpCode(200)
  @Post("tasks/:taskId/decline")
  async decline(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("taskId") taskIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("TASK_DECLINE", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse<DeclineTaskRequest>(declineTaskRequestSchema, body);
      return declineTaskResponseSchema.parse(
        await this.service.executeDecline({
          authenticatedUserId,
          expectedVersion: input.expectedVersion,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
          taskId: parseUuid(taskIdRaw),
        }),
      );
    });
  }

  @HttpCode(200)
  @Post("tasks/:taskId/reassign")
  async reassign(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("taskId") taskIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("TASK_REASSIGN", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse<ReassignTaskRequest>(reassignTaskRequestSchema, body);
      return reassignTaskResponseSchema.parse(
        await this.service.executeReassign({
          ...input,
          authenticatedUserId,
          taskId: parseUuid(taskIdRaw),
        }),
      );
    });
  }
}
