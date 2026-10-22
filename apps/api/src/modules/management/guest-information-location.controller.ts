import { Body, Controller, Get, Headers, Inject, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import {
  guestInformationLocaleSchema,
  guestInformationResponseSchema,
  managementGuestContactLocationResponseSchema,
  managementGuestContactLocationUpdateRequestSchema,
  managementGuestPrivacyPublishRequestSchema,
  managementGuestPrivacyResponseSchema,
  managementGuestPrivacySaveRequestSchema,
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
import { GuestInformationStaffService } from "./guest-information-staff.service";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
  type StaffManagementCommandSchema,
} from "./staff-management-http";

type ResponseSchema<T> = { parse(value: unknown): T };
type LocationAction<T> = (
  context: StaffSessionContext, organizationId: string, locationId: string,
) => Promise<T>;

@Controller("v1/staff/management/organizations/:organizationId/locations/:locationId/guest-information")
export class GuestInformationLocationController {
  constructor(
    private readonly service: GuestInformationStaffService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("privacy")
  privacy(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") loc: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.run("MANAGEMENT_GUEST_PRIVACY_READ", request, auth, org, loc, response,
      managementGuestPrivacyResponseSchema,
      (context, organizationId, locationId) => this.service.readPrivacy(context, organizationId, locationId));
  }

  @Put("privacy")
  savePrivacy(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") loc: string,
    @Body() body: unknown, @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.mutate("MANAGEMENT_GUEST_PRIVACY_SAVE", request, auth, org, loc,
      response, body, managementGuestPrivacySaveRequestSchema,
      managementGuestPrivacyResponseSchema,
      (context, organizationId, locationId, command) =>
        this.service.savePrivacy(context, organizationId, locationId, command));
  }

  @Post("privacy/publish")
  publish(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") loc: string,
    @Body() body: unknown, @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.privacyPublication(true, request, auth, org, loc, body, response);
  }

  @Post("privacy/unpublish")
  unpublish(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") loc: string,
    @Body() body: unknown, @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.privacyPublication(false, request, auth, org, loc, body, response);
  }

  @Get("contact")
  contact(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") loc: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.run("MANAGEMENT_GUEST_CONTACT_READ", request, auth, org, loc, response,
      managementGuestContactLocationResponseSchema,
      (context, organizationId, locationId) =>
        this.service.readLocationContact(context, organizationId, locationId));
  }

  @Put("contact")
  saveContact(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") loc: string,
    @Body() body: unknown, @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.mutate("MANAGEMENT_GUEST_CONTACT_SAVE", request, auth, org, loc,
      response, body, managementGuestContactLocationUpdateRequestSchema,
      managementGuestContactLocationResponseSchema,
      (context, organizationId, locationId, command) =>
        this.service.updateLocationContact(context, organizationId, locationId, command));
  }

  @Get("preview")
  preview(
    @Req() request: ApiRequest, @Headers("authorization") auth: string | undefined,
    @Param("organizationId") org: string, @Param("locationId") loc: string,
    @Query("locale") locale: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const language = guestInformationLocaleSchema.safeParse(locale);
    return this.run("MANAGEMENT_GUEST_PREVIEW_READ", request, auth, org, loc,
      response, guestInformationResponseSchema, (context, organizationId, locationId) => {
        if (!language.success) throw new ApiTransportValidationError();
        return this.service.preview(context, organizationId, locationId, language.data);
      });
  }

  private privacyPublication(
    publish: boolean, request: ApiRequest, auth: string | undefined,
    org: string, loc: string, body: unknown, response: HeaderResponse,
  ) {
    return this.mutate(publish ? "MANAGEMENT_GUEST_PRIVACY_PUBLISH" : "MANAGEMENT_GUEST_PRIVACY_UNPUBLISH",
      request, auth, org, loc, response, body,
      managementGuestPrivacyPublishRequestSchema, managementGuestPrivacyResponseSchema,
      (context, organizationId, locationId, command) =>
        this.service.publishPrivacy(context, organizationId, locationId, command, publish));
  }

  private mutate<C, T>(
    operation: string, request: ApiRequest, auth: string | undefined,
    org: string, loc: string, response: HeaderResponse, body: unknown,
    commandSchema: StaffManagementCommandSchema<C>, responseSchema: ResponseSchema<T>,
    action: (context: StaffSessionContext, organizationId: string, locationId: string, command: C) => Promise<T>,
  ) {
    return this.run(operation, request, auth, org, loc, response, responseSchema,
      (context, organizationId, locationId) => {
        const parsed = commandSchema.safeParse(body);
        if (!parsed.success) throw new ApiTransportValidationError();
        return action(context, organizationId, locationId, parsed.data);
      });
  }

  private run<T>(
    operation: string, request: ApiRequest, auth: string | undefined,
    org: string, loc: string, response: HeaderResponse,
    schema: ResponseSchema<T>, action: LocationAction<T>,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(operation, request, async () => {
      requireSingleManagementAuthorization(request);
      return schema.parse(await action(
        await this.sessions.resolve(auth), requireManagementUuid(org), requireManagementUuid(loc)));
    });
  }
}
