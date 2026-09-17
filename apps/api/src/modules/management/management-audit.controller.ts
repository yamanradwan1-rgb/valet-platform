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
  managementAuditLocationQuerySchema,
  managementAuditOrganizationQuerySchema,
  managementAuditResponseSchema,
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
import { ManagementAuditService } from "./management-audit.service";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "./staff-management-http";

@Controller("v1/staff/management/organizations/:organizationId")
export class ManagementAuditController {
  constructor(
    private readonly audit: ManagementAuditService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("audit-events")
  organization(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "MANAGEMENT_AUDIT_ORGANIZATION_READ",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const parsed = managementAuditOrganizationQuerySchema.safeParse(
          rawQuery ?? {},
        );
        if (!parsed.success) throw new ApiTransportValidationError();
        return managementAuditResponseSchema.parse(
          await this.audit.listOrganization(
            await this.sessions.resolve(authorization),
            requireManagementUuid(organizationId),
            parsed.data,
          ),
        );
      },
    );
  }

  @Get("locations/:locationId/audit-events")
  location(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "MANAGEMENT_AUDIT_LOCATION_READ",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const parsed = managementAuditLocationQuerySchema.safeParse(
          rawQuery ?? {},
        );
        if (!parsed.success) throw new ApiTransportValidationError();
        return managementAuditResponseSchema.parse(
          await this.audit.listLocation(
            await this.sessions.resolve(authorization),
            requireManagementUuid(organizationId),
            requireManagementUuid(locationId),
            parsed.data,
          ),
        );
      },
    );
  }
}
