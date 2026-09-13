import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  incidentRecoveryEmptyBodySchema,
  incidentRecoveryParamsSchema,
  incidentRecoveryProtocol,
  incidentRecoveryResponseSchema,
  reserveIncidentRecoveryResponseSchema,
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
import { IncidentRecoveryService } from "./incident-recovery.service";

@Controller("v1/staff/valet-sessions")
export class IncidentRecoveryController {
  constructor(
    private readonly service: IncidentRecoveryService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  @HttpCode(200)
  @Post(":sessionId/incidents/:incidentId/recovery-intent")
  reserve(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("valet-incident-submission-protocol") protocol: string | undefined,
    @Param() paramsRaw: unknown,
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    return this.runner.run("RESERVE_INCIDENT_RECOVERY", request, async () => {
      const params = incidentRecoveryParamsSchema.safeParse(paramsRaw);
      const empty = incidentRecoveryEmptyBodySchema.safeParse(body);
      const emptyQuery = incidentRecoveryEmptyBodySchema.safeParse(query);
      if (
        !params.success ||
        !empty.success ||
        !emptyQuery.success ||
        protocol !== incidentRecoveryProtocol ||
        countRequestHeader(request, "valet-incident-submission-protocol") !== 1
      )
        throw new ApiTransportValidationError();
      return reserveIncidentRecoveryResponseSchema.parse(
        await this.service.reserve(
          await resolveSingleStaffUserId(
            this.principals,
            request,
            authorization,
          ),
          params.data.sessionId,
          params.data.incidentId,
        ),
      );
    });
  }

  @Get(":sessionId/incidents/:incidentId/recovery")
  @Header("Cache-Control", "no-store")
  recover(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() paramsRaw: unknown,
    @Query() query: unknown,
  ) {
    return this.runRecovery(
      "RECOVER_INCIDENT",
      request,
      authorization,
      paramsRaw,
      query,
      false,
    );
  }

  @HttpCode(200)
  @Post(":sessionId/incidents/:incidentId/recovery-intent/retire")
  retire(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("valet-incident-submission-protocol") protocol: string | undefined,
    @Param() paramsRaw: unknown,
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    return this.runRecovery(
      "RETIRE_INCIDENT_RECOVERY",
      request,
      authorization,
      paramsRaw,
      query,
      true,
      body,
      protocol,
    );
  }

  private runRecovery(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    paramsRaw: unknown,
    query: unknown,
    retire: boolean,
    body?: unknown,
    protocol?: string,
  ) {
    return this.runner.run(operation, request, async () => {
      const params = incidentRecoveryParamsSchema.safeParse(paramsRaw);
      if (
        !params.success ||
        !incidentRecoveryEmptyBodySchema.safeParse(query).success ||
        (retire &&
          (protocol !== incidentRecoveryProtocol ||
            countRequestHeader(
              request,
              "valet-incident-submission-protocol",
            ) !== 1 ||
            !incidentRecoveryEmptyBodySchema.safeParse(body).success))
      )
        throw new ApiTransportValidationError();
      const userId = await resolveSingleStaffUserId(
        this.principals,
        request,
        authorization,
      );
      const result = retire
        ? await this.service.retire(
            userId,
            params.data.sessionId,
            params.data.incidentId,
          )
        : await this.service.recover(
            userId,
            params.data.sessionId,
            params.data.incidentId,
          );
      return incidentRecoveryResponseSchema.parse(result);
    });
  }
}
