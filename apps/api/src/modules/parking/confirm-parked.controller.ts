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
  confirmParkedRequestSchema,
  confirmParkedResponseSchema,
  type ConfirmParkedRequest,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { ConfirmParkedService } from "./confirm-parked.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRequest(value: unknown): ConfirmParkedRequest {
  const parsed = confirmParkedRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

function parseSessionId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/valet-sessions")
export class ConfirmParkedController {
  constructor(
    private readonly service: ConfirmParkedService,
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
  @Post(":sessionId/confirm-parked")
  async confirm(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("CONFIRM_PARKED", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parseRequest(body);
      return confirmParkedResponseSchema.parse(
        await this.service.execute({
          authenticatedUserId,
          expectedSessionVersion: input.expectedSessionVersion,
          expectedTaskVersion: input.expectedTaskVersion,
          parkingSpotCode: input.parkingSpotCode,
          sessionId: parseSessionId(sessionIdRaw),
        }),
      );
    });
  }
}
