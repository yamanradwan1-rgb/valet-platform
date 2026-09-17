import {
  Body, Controller, Get, Headers, Inject, Param, Post, Req, Res,
} from "@nestjs/common";
import {
  managementLocationCreateRequestSchema,
  managementLocationCurrencyCorrectionRequestSchema,
  managementLocationLifecycleCommandSchema,
  managementLocationLifecycleResponseSchema,
  managementLocationTimezoneCorrectionRequestSchema,
  managementLocationTimezoneCorrectionResponseSchema,
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
import { ManagementLocationService } from "./management-location.service";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
  type StaffManagementCommandSchema,
} from "./staff-management-http";

@Controller("v1/staff/management/organizations/:organizationId/locations")
export class ManagementLocationController {
  constructor(
    private readonly locations: ManagementLocationService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Post()
  create(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_LOCATION_CREATE", request, async () => {
      const parsed = managementLocationCreateRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      requireSingleManagementAuthorization(request);
      return managementLocationLifecycleResponseSchema.parse(
        await this.locations.create(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          parsed.data,
        ),
      );
    });
  }

  @Get(":locationId/lifecycle")
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_LOCATION_LIFECYCLE_READ", request, async () => {
      requireSingleManagementAuthorization(request);
      return managementLocationLifecycleResponseSchema.parse(
        await this.locations.read(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(locationId),
        ),
      );
    });
  }

  @Post(":locationId/activate")
  activate(@Req() request: ApiRequest,@Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,@Param("locationId") locationId: string,
    @Body() body: unknown,@Res({ passthrough: true }) response: HeaderResponse) {
    return this.lifecycleCommand("MANAGEMENT_LOCATION_ACTIVATE", request, authorization,
      organizationId, locationId, body, response,
      (context, organization, location, command) =>
        this.locations.activate(context, organization, location, command));
  }

  @Post(":locationId/stop-intake")
  stopIntake(@Req() request: ApiRequest,@Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,@Param("locationId") locationId: string,
    @Body() body: unknown,@Res({ passthrough: true }) response: HeaderResponse) {
    return this.lifecycleCommand("MANAGEMENT_LOCATION_STOP_INTAKE", request, authorization,
      organizationId, locationId, body, response,
      (context, organization, location, command) =>
        this.locations.stopIntake(context, organization, location, command));
  }

  @Post(":locationId/deactivate")
  deactivate(@Req() request: ApiRequest,@Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,@Param("locationId") locationId: string,
    @Body() body: unknown,@Res({ passthrough: true }) response: HeaderResponse) {
    return this.lifecycleCommand("MANAGEMENT_LOCATION_DEACTIVATE", request, authorization,
      organizationId, locationId, body, response,
      (context, organization, location, command) =>
        this.locations.deactivate(context, organization, location, command));
  }

  @Post(":locationId/currency-correction")
  currency(@Req() request: ApiRequest,@Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,@Param("locationId") locationId: string,
    @Body() body: unknown,@Res({ passthrough: true }) response: HeaderResponse) {
    return this.command("MANAGEMENT_LOCATION_CURRENCY_CORRECTION", request, authorization,
      organizationId, locationId, body, managementLocationCurrencyCorrectionRequestSchema,
      response, (context, organization, location, command) =>
        this.locations.correctCurrency(context, organization, location, command));
  }

  @Post(":locationId/timezone-correction")
  timezone(@Req() request: ApiRequest,@Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,@Param("locationId") locationId: string,
    @Body() body: unknown,@Res({ passthrough: true }) response: HeaderResponse) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_LOCATION_TIMEZONE_CORRECTION", request, async () => {
      const parsed = managementLocationTimezoneCorrectionRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      requireSingleManagementAuthorization(request);
      return managementLocationTimezoneCorrectionResponseSchema.parse(
        await this.locations.correctTimezone(await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId), requireManagementUuid(locationId), parsed.data),
      );
    });
  }

  private lifecycleCommand(
    operation: string, request: ApiRequest, authorization: string | undefined,
    organizationId: string, locationId: string, body: unknown, response: HeaderResponse,
    action: (context: StaffSessionContext, organizationId: string, locationId: string,
      command: { readonly expectedUpdatedAt: string }) => Promise<unknown>,
  ) {
    return this.command(operation, request, authorization, organizationId, locationId, body,
      managementLocationLifecycleCommandSchema, response, action);
  }

  private command<T>(
    operation: string, request: ApiRequest, authorization: string | undefined,
    organizationId: string, locationId: string, body: unknown,
    schema: StaffManagementCommandSchema<T>, response: HeaderResponse,
    action: (context: StaffSessionContext, organizationId: string,
      locationId: string, command: T) => Promise<unknown>,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(operation, request, async () => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      requireSingleManagementAuthorization(request);
      return managementLocationLifecycleResponseSchema.parse(
        await action(await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(locationId), parsed.data),
      );
    });
  }
}
