import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  staffLocationAccessPageSchema,
  staffLocationCandidatePageSchema,
  staffLocationAccessQuerySchema,
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
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "./staff-management-http";
import { StaffLocationAccessService } from "./staff-location-access.service";

@Controller(
  "v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access",
)
export class StaffLocationAccessController {
  constructor(
    private readonly locations: StaffLocationAccessService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("candidates")
  candidates(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "STAFF_MANAGEMENT_LOCATION_CANDIDATES",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const parsed = staffLocationAccessQuerySchema.safeParse(rawQuery ?? {});
        if (!parsed.success) throw new ApiTransportValidationError();
        return staffLocationCandidatePageSchema.parse(
          await this.locations.candidates(
            await this.sessions.resolve(authorization),
            requireManagementUuid(organizationId),
            requireManagementUuid(membershipId),
            parsed.data,
          ),
        );
      },
    );
  }

  @Get()
  page(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "STAFF_MANAGEMENT_LOCATION_ACCESS_PAGE",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const parsed = staffLocationAccessQuerySchema.safeParse(rawQuery ?? {});
        if (!parsed.success) throw new ApiTransportValidationError();
        return staffLocationAccessPageSchema.parse(
          await this.locations.page(
            await this.sessions.resolve(authorization),
            requireManagementUuid(organizationId),
            requireManagementUuid(membershipId),
            parsed.data,
          ),
        );
      },
    );
  }
}
