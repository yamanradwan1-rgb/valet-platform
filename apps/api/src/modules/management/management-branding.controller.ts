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
  managementBrandingClearRequestSchema,
  managementBrandingSetRequestSchema,
  managementCompanyBrandingResponseSchema,
  managementLocationBrandingResponseSchema,
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
import { ManagementBrandingService } from "./management-branding.service";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
  type StaffManagementCommandSchema,
} from "./staff-management-http";

@Controller("v1/staff/management/organizations/:organizationId")
export class ManagementBrandingController {
  constructor(
    private readonly branding: ManagementBrandingService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("branding")
  readCompany(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_COMPANY_BRANDING_READ", request, async () =>
      managementCompanyBrandingResponseSchema.parse(
        await this.branding.readCompany(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
        ),
      ));
  }

  @Put("branding/default")
  setCompany(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.companyMutation(
      request, authorization, organizationId, body, response,
      managementBrandingSetRequestSchema,
      (context, organization, command) =>
        this.branding.setCompany(context, organization, command),
    );
  }

  @Get("locations/:locationId/branding")
  readLocation(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_LOCATION_BRANDING_READ", request, async () =>
      managementLocationBrandingResponseSchema.parse(
        await this.branding.readLocation(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(locationId),
        ),
      ));
  }

  @Put("locations/:locationId/branding/override")
  setLocation(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.locationMutation(
      "MANAGEMENT_LOCATION_BRANDING_SET", request, authorization, organizationId,
      locationId, body, response, managementBrandingSetRequestSchema,
      (context, organization, location, command) =>
        this.branding.setLocation(context, organization, location, command),
    );
  }

  @Post("locations/:locationId/branding/override/clear")
  clearLocation(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.locationMutation(
      "MANAGEMENT_LOCATION_BRANDING_CLEAR", request, authorization, organizationId,
      locationId, body, response, managementBrandingClearRequestSchema,
      (context, organization, location, command) =>
        this.branding.clearLocation(context, organization, location, command),
    );
  }

  private context(request: ApiRequest, authorization: string | undefined) {
    requireSingleManagementAuthorization(request);
    return this.sessions.resolve(authorization);
  }

  private companyMutation<T>(
    request: ApiRequest,
    authorization: string | undefined,
    organizationId: string,
    body: unknown,
    response: HeaderResponse,
    schema: StaffManagementCommandSchema<T>,
    action: (context: StaffSessionContext, organizationId: string, command: T) => Promise<unknown>,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_COMPANY_BRANDING_SET", request, async () => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return managementCompanyBrandingResponseSchema.parse(
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
    response: HeaderResponse,
    schema: StaffManagementCommandSchema<T>,
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
      return managementLocationBrandingResponseSchema.parse(
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
