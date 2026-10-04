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

@Controller("v1/staff/shifts/presence")
export class ShiftPresenceController {
  constructor(
    private readonly service: ShiftPresenceService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

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
          await presenceManagementHttpContext(
            request,
            authorization,
            response,
            this.sessions,
          ),
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
          await presenceManagementHttpContext(
            request,
            authorization,
            response,
            this.sessions,
          ),
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
          await presenceManagementHttpContext(
            request,
            authorization,
            response,
            this.sessions,
          ),
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
          await presenceManagementHttpContext(
            request,
            authorization,
            response,
            this.sessions,
          ),
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
          await presenceManagementHttpContext(
            request,
            authorization,
            response,
            this.sessions,
          ),
          requirePresenceUuid(exceptionId),
        ),
      ),
    );
  }
}
