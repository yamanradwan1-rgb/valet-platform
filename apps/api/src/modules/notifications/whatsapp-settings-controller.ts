import {
  Body, Controller, Get, Headers, Inject, Param, Put, Req, Res,
} from "@nestjs/common";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders, type HeaderResponse,
} from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER, type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  requireManagementUuid, requireSingleManagementAuthorization,
} from "../management/staff-management-http";
import { WhatsAppSettingsService } from "./whatsapp-settings-service";
import { validateWhatsAppPolicy } from "./whatsapp-settings-validation";

@Controller("v1/staff/management/organizations/:organizationId")
export class WhatsAppSettingsController {
  constructor(
    private readonly settings: WhatsAppSettingsService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  private async context(request: ApiRequest, authorization?: string) {
    requireSingleManagementAuthorization(request);
    return this.sessions.resolve(authorization);
  }

  @Get("whatsapp-settings")
  company(@Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Res({ passthrough: true }) response: HeaderResponse) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WHATSAPP_COMPANY_SETTINGS_READ", request, async () =>
      this.settings.read(await this.context(request, auth), requireManagementUuid(org), null));
  }

  @Put("whatsapp-settings")
  updateCompany(@Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WHATSAPP_COMPANY_SETTINGS_WRITE", request, async () =>
      this.settings.write(await this.context(request, auth), requireManagementUuid(org),
        null, validateWhatsAppPolicy(body)));
  }

  @Get("locations/:locationId/whatsapp-settings")
  location(@Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") location: string,
    @Res({ passthrough: true }) response: HeaderResponse) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WHATSAPP_LOCATION_SETTINGS_READ", request, async () =>
      this.settings.read(await this.context(request, auth),
        requireManagementUuid(org), requireManagementUuid(location)));
  }

  @Put("locations/:locationId/whatsapp-settings")
  updateLocation(@Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") location: string,
    @Body() body: unknown, @Res({ passthrough: true }) response: HeaderResponse) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WHATSAPP_LOCATION_SETTINGS_WRITE", request, async () =>
      this.settings.write(await this.context(request, auth),
        requireManagementUuid(org), requireManagementUuid(location),
        validateWhatsAppPolicy(body)));
  }
}
