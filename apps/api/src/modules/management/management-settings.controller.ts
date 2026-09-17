import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import {
  managementCompanySettingClearRequestSchema,
  managementCompanySettingsResponseSchema,
  managementLocationSettingClearRequestSchema,
  managementLocationSettingSetRequestSchema,
  managementLocationSettingsResponseSchema,
  managementSettingSetRequestSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import { setNoStoreResponseHeaders, type HeaderResponse } from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContext,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
  type StaffManagementCommandSchema,
} from "./staff-management-http";
import { ManagementSettingsService } from "./management-settings.service";

@Controller("v1/staff/management/organizations/:organizationId")
export class ManagementSettingsController {
  constructor(
    private readonly settings: ManagementSettingsService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("settings")
  readCompany(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_COMPANY_SETTINGS_READ", request, async () =>
      managementCompanySettingsResponseSchema.parse(
        await this.settings.readCompany(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
        ),
      ));
  }

  @Put("settings/default")
  setCompany(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.companyMutation(
      "MANAGEMENT_COMPANY_SETTING_SET",
      request,
      authorization,
      organizationId,
      body,
      managementSettingSetRequestSchema,
      response,
      (context, organization, command) =>
        this.settings.setCompany(context, organization, command),
    );
  }

  @Post("settings/default/clear")
  clearCompany(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.companyMutation(
      "MANAGEMENT_COMPANY_SETTING_CLEAR",
      request,
      authorization,
      organizationId,
      body,
      managementCompanySettingClearRequestSchema,
      response,
      (context, organization, command) =>
        this.settings.clearCompany(context, organization, command),
    );
  }

  @Get("locations/:locationId/settings")
  readLocation(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_LOCATION_SETTINGS_READ", request, async () =>
      managementLocationSettingsResponseSchema.parse(
        await this.settings.readLocation(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(locationId),
        ),
      ));
  }

  @Put("locations/:locationId/settings/override")
  setLocation(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.locationMutation(
      "MANAGEMENT_LOCATION_SETTING_SET", request, authorization,
      organizationId, locationId, body, managementLocationSettingSetRequestSchema,
      response,
      (context, organization, location, command) =>
        this.settings.setLocation(context, organization, location, command),
    );
  }

  @Post("locations/:locationId/settings/override/clear")
  clearLocation(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.locationMutation(
      "MANAGEMENT_LOCATION_SETTING_CLEAR", request, authorization,
      organizationId, locationId, body, managementLocationSettingClearRequestSchema,
      response,
      (context, organization, location, command) =>
        this.settings.clearLocation(context, organization, location, command),
    );
  }

  private context(request: ApiRequest, authorization: string | undefined) {
    requireSingleManagementAuthorization(request);
    return this.sessions.resolve(authorization);
  }

  private companyMutation<T>(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    organizationId: string,
    body: unknown,
    schema: StaffManagementCommandSchema<T>,
    response: HeaderResponse,
    action: (context: StaffSessionContext, organizationId: string, command: T) => Promise<unknown>,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(operation, request, async () => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return managementCompanySettingsResponseSchema.parse(
        await action(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
          parsed.data,
        ),
      );
    });
  }

  private locationMutation<T>(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    organizationId: string,
    locationId: string,
    body: unknown,
    schema: StaffManagementCommandSchema<T>,
    response: HeaderResponse,
    action: (
      context: StaffSessionContext,
      organizationId: string,
      locationId: string,
      command: T,
    ) => Promise<unknown>,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(operation, request, async () => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return managementLocationSettingsResponseSchema.parse(
        await action(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(locationId),
          parsed.data,
        ),
      );
    });
  }
}
