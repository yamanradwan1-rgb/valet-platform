import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  managementVisitContactCorrectionResponseSchema,
  managementVisitContactNameCorrectionRequestSchema,
  managementVisitContactPhoneCorrectionRequestSchema,
  managementVisitContactSearchQuerySchema,
  managementVisitContactSearchResponseSchema,
  managementVisitHistoryQuerySchema,
  managementVisitHistoryResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { ManagementVisitContactService } from "./management-visit-contact.service";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "./staff-management-http";

@Controller("v1/staff/management/organizations/:organizationId")
export class ManagementVisitContactController {
  constructor(
    private readonly contacts: ManagementVisitContactService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("visit-contacts")
  search(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_VISIT_CONTACT_SEARCH", request, async () => {
      requireSingleManagementAuthorization(request);
      const query = managementVisitContactSearchQuerySchema.safeParse(rawQuery ?? {});
      if (!query.success) throw new ApiTransportValidationError();
      return managementVisitContactSearchResponseSchema.parse(
        await this.contacts.search(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          query.data,
        ),
      );
    });
  }

  @Get("visit-contacts/:customerId/visits")
  customerHistory(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("customerId") customerId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.history(request, authorization, organizationId, "CUSTOMER",
      customerId, rawQuery, response);
  }

  @Get("visit-vehicles/:vehicleId/visits")
  vehicleHistory(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("vehicleId") vehicleId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.history(request, authorization, organizationId, "VEHICLE",
      vehicleId, rawQuery, response);
  }

  @Post("visit-contacts/:customerId/name-correction")
  @HttpCode(200)
  correctName(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("customerId") customerId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_VISIT_CONTACT_NAME_CORRECTION", request, async () => {
      requireSingleManagementAuthorization(request);
      const parsed = managementVisitContactNameCorrectionRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return managementVisitContactCorrectionResponseSchema.parse(
        await this.contacts.correctName(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(customerId),
          parsed.data,
        ),
      );
    });
  }

  @Post("visit-contacts/:customerId/phone-correction")
  @HttpCode(200)
  correctPhone(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("customerId") customerId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_VISIT_CONTACT_PHONE_CORRECTION", request, async () => {
      requireSingleManagementAuthorization(request);
      const parsed = managementVisitContactPhoneCorrectionRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return managementVisitContactCorrectionResponseSchema.parse(
        await this.contacts.correctPhone(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(customerId),
          parsed.data,
        ),
      );
    });
  }

  private history(
    request: ApiRequest,
    authorization: string | undefined,
    organizationId: string,
    subject: "CUSTOMER" | "VEHICLE",
    subjectId: string,
    rawQuery: unknown,
    response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_VISIT_CONTACT_HISTORY", request, async () => {
      requireSingleManagementAuthorization(request);
      const query = managementVisitHistoryQuerySchema.safeParse(rawQuery ?? {});
      if (!query.success) throw new ApiTransportValidationError();
      return managementVisitHistoryResponseSchema.parse(
        await this.contacts.history(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          subject,
          requireManagementUuid(subjectId),
          query.data,
        ),
      );
    });
  }
}
