import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { staffActivationRequestSchema } from "@valet/contracts";
import type { ApiRequest } from "../../common/http/api-request";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import { StaffAuthOriginPolicy } from "./staff-auth.origin";
import { StaffAuthOriginError } from "./staff-auth.controller";
import {
  parseAuthBody,
  requireAuthJson,
  requireEmptyAuthQuery,
  setPrivateAuthHeaders,
  type AuthResponse,
} from "./staff-auth.transport";
import { StaffActivationService } from "./staff-activation.service";

@Controller("v1/staff/auth")
export class StaffActivationController {
  constructor(
    private readonly activation: StaffActivationService,
    private readonly origins: StaffAuthOriginPolicy,
    private readonly runner: ApiOperationRunner,
  ) {}

  @Post("activate")
  @HttpCode(200)
  activate(
    @Headers("origin") origin: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() query: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ) {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_ACTIVATE", request, async () => {
      if (!this.origins.allows(origin)) throw new StaffAuthOriginError();
      requireAuthJson(contentType);
      requireEmptyAuthQuery(query);
      return this.activation.activate(
        parseAuthBody(staffActivationRequestSchema, rawBody),
        request,
      );
    });
  }
}
