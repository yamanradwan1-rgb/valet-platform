import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  shiftPresenceChallengeIntentSchema,
  shiftPresenceChallengeResponseSchema,
  shiftPresenceRecoveryResponseSchema,
  shiftPresenceExceptionCreateRequestSchema,
  shiftPresenceExceptionResponseSchema,
} from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import type { HeaderResponse } from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  presenceManagementHttpContext,
  parsePresenceCommand,
} from "../auth/staff-presence-http";
import { requirePresenceUuid } from "../auth/staff-presence-http";
import { ShiftPresenceService } from "./shift-presence.service";
import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";
import {
  admitPresenceRequest,
  presenceAbuseLimits,
} from "./shift-presence-anti-abuse";

@Controller("v1/staff/shifts/presence")
export class ShiftPresenceController {
  constructor(
    private readonly service: ShiftPresenceService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
    private readonly limiter: AntiAbuseService,
  ) {}

  private async context(
    request: ApiRequest,
    authorization: string | undefined,
    response: HeaderResponse,
    kind: keyof typeof presenceAbuseLimits,
  ) {
    const context = await presenceManagementHttpContext(
      request,
      authorization,
      response,
      this.sessions,
    );
    await admitPresenceRequest(this.limiter, context.userId, kind);
    return context;
  }

  @Post("challenges")
  @HttpCode(200)
  issue(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.runner.run("PRESENCE_CHALLENGE_ISSUE", request, async () =>
      shiftPresenceChallengeResponseSchema.parse(
        await this.service.issue(
          await this.context(request, authorization, response, "CHALLENGE"),
          parsePresenceCommand(shiftPresenceChallengeIntentSchema, body),
        ),
      ),
    );
  }
  @Get("operations/:operationId")
  status(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("operationId") operationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.runner.run("PRESENCE_OPERATION_STATUS", request, async () =>
      shiftPresenceRecoveryResponseSchema.parse(
        await this.service.status(
          await this.context(request, authorization, response, "STATUS"),
          requirePresenceUuid(operationId),
        ),
      ),
    );
  }
  @Get("operations/:operationId/challenge")
  challenge(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("operationId") operationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.runner.run("PRESENCE_CHALLENGE_READ", request, async () =>
      shiftPresenceChallengeResponseSchema.parse(
        await this.service.challenge(
          await this.context(request, authorization, response, "STATUS"),
          requirePresenceUuid(operationId),
        ),
      ),
    );
  }
  @Post("operations/:operationId/exception")
  @HttpCode(200)
  requestException(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("operationId") operationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.runner.run("PRESENCE_EXCEPTION_REQUEST", request, async () =>
      shiftPresenceExceptionResponseSchema.parse(
        await this.service.requestException(
          await this.context(request, authorization, response, "EXCEPTION"),
          requirePresenceUuid(operationId),
          parsePresenceCommand(shiftPresenceExceptionCreateRequestSchema, body),
        ),
      ),
    );
  }
  @Get("exceptions/:exceptionId")
  exception(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("exceptionId") exceptionId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.runner.run("PRESENCE_EXCEPTION_STATUS", request, async () =>
      shiftPresenceExceptionResponseSchema.parse(
        await this.service.exception(
          await this.context(request, authorization, response, "STATUS"),
          requirePresenceUuid(exceptionId),
        ),
      ),
    );
  }
}
