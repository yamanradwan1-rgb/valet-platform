import {
  Body, Controller, Get, Headers, Inject, Param, Post, Put, Req, Res,
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
import { WhatsAppSandboxBindingService } from "./whatsapp-sandbox-binding-service";
import { validateSandboxBindingRequest } from "./whatsapp-sandbox-binding-input";
import { WhatsAppSandboxConsentService } from "./whatsapp-sandbox-consent-service";
import { validateSandboxConsentInput } from "./whatsapp-sandbox-consent-input";

@Controller("v1/staff/management/organizations/:organizationId")
export class WhatsAppSettingsController {
  constructor(
    private readonly settings: WhatsAppSettingsService,
    private readonly bindings: WhatsAppSandboxBindingService,
    private readonly consent: WhatsAppSandboxConsentService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Post("whatsapp-test-recipient-consent")
  updateSandboxConsent(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    const input = validateSandboxConsentInput(body);
    return this.runner.run("WHATSAPP_SANDBOX_CONSENT_CHANGE", request, async () =>
      this.consent.change(await this.context(request, auth),
        requireManagementUuid(org), input));
  }

  @Post("whatsapp-sandbox-binding-request")
  requestPendingSandboxBinding(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    validateSandboxBindingRequest(body);
    return this.runner.run("WHATSAPP_SANDBOX_BINDING_REQUEST", request, async () =>
      this.bindings.requestPending(await this.context(request, auth), requireManagementUuid(org)));
  }

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
