import { Body, Controller, Get, Headers, Inject, Param, Put, Query, Req, Res } from "@nestjs/common";
import {
  guestInformationLocaleSchema,
  managementGuestContactCompanyResponseSchema,
  managementGuestContactCompanyUpdateRequestSchema,
  managementGuestInformationOverviewResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import { setNoStoreResponseHeaders, type HeaderResponse } from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { GuestInformationStaffService } from "./guest-information-staff.service";
import { requireManagementUuid, requireSingleManagementAuthorization } from "./staff-management-http";

@Controller("v1/staff/management/organizations/:organizationId/guest-information")
export class GuestInformationCompanyController {
  constructor(
    private readonly service: GuestInformationStaffService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("overview")
  overview(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query("locale") locale: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_GUEST_INFORMATION_OVERVIEW", request, async () => {
      const language = guestInformationLocaleSchema.safeParse(locale);
      if (!language.success) throw new ApiTransportValidationError();
      requireSingleManagementAuthorization(request);
      return managementGuestInformationOverviewResponseSchema.parse(
        await this.service.overview(
          await this.sessions.resolve(authorization), requireManagementUuid(organizationId),
          language.data,
        ));
    });
  }

  @Get("contact/defaults")
  defaults(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_GUEST_CONTACT_DEFAULTS_READ", request, async () => {
      requireSingleManagementAuthorization(request);
      return managementGuestContactCompanyResponseSchema.parse(
        await this.service.readCompany(
          await this.sessions.resolve(authorization), requireManagementUuid(organizationId),
        ));
    });
  }

  @Put("contact/defaults")
  updateDefaults(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_GUEST_CONTACT_DEFAULTS_SAVE", request, async () => {
      const command = managementGuestContactCompanyUpdateRequestSchema.safeParse(body);
      if (!command.success) throw new ApiTransportValidationError();
      requireSingleManagementAuthorization(request);
      return managementGuestContactCompanyResponseSchema.parse(
        await this.service.updateCompany(
          await this.sessions.resolve(authorization), requireManagementUuid(organizationId),
          command.data,
        ));
    });
  }
}
