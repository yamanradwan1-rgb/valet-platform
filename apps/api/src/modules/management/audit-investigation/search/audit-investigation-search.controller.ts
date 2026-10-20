import {
  Controller, Get, Headers, Inject, Param, Query, Req, Res,
} from "@nestjs/common";
import {
  auditInvestigationFilterQuerySchema,
  auditInvestigationSearchQuerySchema,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../../../common/http/api-errors";
import { ApiOperationRunner } from "../../../../common/http/api-operation-runner";
import type { ApiRequest } from "../../../../common/http/api-request";
import { setNoStoreResponseHeaders, type HeaderResponse } from "../../../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../../../auth/staff-session-context";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "../../staff-management-http";
import { AuditInvestigationSearchService } from "./audit-investigation-search.service";

@Controller("v1/staff/management/organizations/:organizationId/locations/:locationId/audit-investigations")
export class AuditInvestigationSearchController {
  constructor(
    private readonly searchService: AuditInvestigationSearchService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("sessions")
  search(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("AUDIT_INVESTIGATION_SEARCH_READ", request, async () => {
      requireSingleManagementAuthorization(request);
      const query = auditInvestigationSearchQuerySchema.safeParse(rawQuery ?? {});
      if (!query.success) throw new ApiTransportValidationError();
      return this.searchService.search(
        await this.sessions.resolve(authorization),
        requireManagementUuid(organizationId),
        requireManagementUuid(locationId),
        query.data,
      );
    });
  }

  @Get("filters")
  filters(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("AUDIT_INVESTIGATION_FILTERS_READ", request, async () => {
      requireSingleManagementAuthorization(request);
      const query = auditInvestigationFilterQuerySchema.safeParse(rawQuery ?? {});
      if (!query.success) throw new ApiTransportValidationError();
      return this.searchService.filters(
        await this.sessions.resolve(authorization),
        requireManagementUuid(organizationId),
        requireManagementUuid(locationId),
        query.data,
      );
    });
  }
}
