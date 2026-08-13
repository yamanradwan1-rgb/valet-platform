import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  completeHandoffRequestSchema,
  completeHandoffResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { CompleteHandoffService } from "./complete-handoff.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseSessionId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/valet-sessions")
export class CompleteHandoffController {
  constructor(
    private readonly service: CompleteHandoffService,
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
  @Post(":sessionId/complete-handoff")
  complete(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") rawSessionId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("COMPLETE_HANDOFF", request, async () => {
      const parsed = completeHandoffRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return completeHandoffResponseSchema.parse(
        await this.service.execute({
          authenticatedUserId: await this.userId(request, authorization),
          expectedSessionVersion: parsed.data.expectedSessionVersion,
          sessionId: parseSessionId(rawSessionId),
        }),
      );
    });
  }
}
