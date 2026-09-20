import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  managementListQuerySchema,
  managementLocationsResponseSchema,
  managementOrganizationsResponseSchema,
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
import { DashboardScopeDiscoveryService } from "./dashboard-scope-discovery.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireSingleAuthorization(request: ApiRequest): void {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0) {
    throw new UnauthorizedException();
  }
  let count = 0;
  for (let index = 0; index < headers.length; index += 2) {
    if (headers[index]?.toLowerCase() === "authorization") count += 1;
  }
  if (count !== 1) throw new UnauthorizedException();
}

function organizationId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/dashboard/organizations")
export class DashboardScopeDiscoveryController {
  constructor(
    private readonly discovery: DashboardScopeDiscoveryService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get()
  organizations(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("DASHBOARD_SCOPE_ORGANIZATIONS_LIST", request, async () => {
      requireSingleAuthorization(request);
      const parsed = managementListQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) throw new ApiTransportValidationError();
      const context = await this.sessions.resolve(authorization);
      return managementOrganizationsResponseSchema.parse(
        await this.discovery.listOrganizations(context, parsed.data),
      );
    });
  }

  @Get(":organizationId/locations")
  locations(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") rawOrganizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("DASHBOARD_SCOPE_LOCATIONS_LIST", request, async () => {
      requireSingleAuthorization(request);
      const parsed = managementListQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) throw new ApiTransportValidationError();
      const context = await this.sessions.resolve(authorization);
      return managementLocationsResponseSchema.parse(
        await this.discovery.listLocations(
          context,
          organizationId(rawOrganizationId),
          parsed.data,
        ),
      );
    });
  }
}
