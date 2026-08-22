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
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { IncidentReportingService } from "./incident-reporting.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("v1/staff/valet-sessions")
export class IncidentReportingController {
  constructor(
    private readonly service: IncidentReportingService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  @HttpCode(200)
  @Post(":sessionId/incidents")
  report(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("REPORT_INCIDENT", request, async () => {
      const parsed = reportIncidentRequestSchema.safeParse(body);
      if (!parsed.success || !uuidPattern.test(sessionIdRaw)) {
        throw new ApiTransportValidationError();
      }
      return reportIncidentResponseSchema.parse(
        await this.service.report(
          await this.resolveUserId(request, authorization),
          sessionIdRaw,
          parsed.data,
        ),
      );
    });
  }

  private async resolveUserId(
    request: ApiRequest,
    authorization: string | undefined,
  ): Promise<string> {
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
}
