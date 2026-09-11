import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { StaffPushRegistrationResponse } from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import { StaffPushRegistrationService } from "./staff-push-registration.service";
import {
  parseRegistrationId,
  parseRegistrationRequest,
  parseRegistrationResponse,
  requireEmptyDisableBody,
  requireEmptyPushQuery,
  requirePushJson,
} from "./staff-push-registration.transport";

@Controller("v1/staff/push/registrations")
export class StaffPushRegistrationController {
  constructor(
    private readonly registrations: StaffPushRegistrationService,
    private readonly runner: ApiOperationRunner,
  ) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  async reconcile(
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<StaffPushRegistrationResponse> {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_PUSH_REGISTRATION_PUT", request, async () => {
      requirePushJson(contentType);
      requireEmptyPushQuery(rawQuery);
      const input = parseRegistrationRequest(rawBody);
      return parseRegistrationResponse(
        await this.registrations.reconcile(authorization, input),
      );
    });
  }

  @Post(":registrationId/disable")
  @HttpCode(HttpStatus.OK)
  async disable(
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("registrationId") rawRegistrationId: string,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<StaffPushRegistrationResponse> {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "STAFF_PUSH_REGISTRATION_DISABLE",
      request,
      async () => {
        requirePushJson(contentType);
        requireEmptyPushQuery(rawQuery);
        requireEmptyDisableBody(rawBody);
        const registrationId = parseRegistrationId(rawRegistrationId);
        return parseRegistrationResponse(
          await this.registrations.disable(authorization, registrationId),
        );
      },
    );
  }
}
