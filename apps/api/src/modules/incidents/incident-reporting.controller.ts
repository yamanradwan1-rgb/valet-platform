import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
  incidentRecoveryProtocol,
  isIncidentRecoveryId,
  legacyIncidentIdSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import {
  countRequestHeader,
  resolveSingleStaffUserId,
} from "../staff/staff-request-principal";
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
    @Headers("valet-incident-submission-protocol")
    protocol: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("REPORT_INCIDENT", request, async () => {
      const parsed = reportIncidentRequestSchema.safeParse(body);
      if (!parsed.success || !uuidPattern.test(sessionIdRaw)) {
        throw new ApiTransportValidationError();
      }
      const recoveryMode = isIncidentRecoveryId(parsed.data.incidentId);
      const protocolCount = countRequestHeader(
        request,
        "valet-incident-submission-protocol",
      );
      if (
        protocolCount > 1 ||
        (recoveryMode && protocol !== incidentRecoveryProtocol) ||
        (!recoveryMode && protocol !== undefined) ||
        (!recoveryMode &&
          !legacyIncidentIdSchema.safeParse(parsed.data.incidentId).success)
      ) {
        throw new ApiTransportValidationError();
      }
      return reportIncidentResponseSchema.parse(
        await this.service.report(
          await resolveSingleStaffUserId(
            this.principals,
            request,
            authorization,
          ),
          sessionIdRaw,
          parsed.data,
          recoveryMode,
        ),
      );
    });
  }
}
