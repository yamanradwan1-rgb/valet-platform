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
  managementContextQuerySchema,
  managementContextResponseSchema,
  managementListQuerySchema,
  managementLocationsResponseSchema,
  managementOrganizationsResponseSchema,
  type ManagementScope,
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
import { ManagementContextService } from "./management-context.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireSingleAuthorization(request: ApiRequest): void {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0)
    throw new UnauthorizedException();
  let count = 0;
  for (let index = 0; index < headers.length; index += 2) {
    if (headers[index]?.toLowerCase() === "authorization") count += 1;
  }
  if (count !== 1) throw new UnauthorizedException();
}

function parseOrganizationId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/management/organizations")
export class ManagementContextController {
  constructor(
    private readonly service: ManagementContextService,
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
    return this.runner.run(
      "MANAGEMENT_ORGANIZATIONS_LIST",
      request,
      async () => {
        requireSingleAuthorization(request);
        const parsed = managementListQuerySchema.safeParse(rawQuery ?? {});
        if (!parsed.success) throw new ApiTransportValidationError();
        const context = await this.sessions.resolve(authorization);
        return managementOrganizationsResponseSchema.parse(
          await this.service.listOrganizations(context, parsed.data),
        );
      },
    );
  }

  @Get(":organizationId/locations")
  locations(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_LOCATIONS_LIST", request, async () => {
      requireSingleAuthorization(request);
      const parsed = managementListQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) throw new ApiTransportValidationError();
      const context = await this.sessions.resolve(authorization);
      return managementLocationsResponseSchema.parse(
        await this.service.listLocations(
          context,
          parseOrganizationId(organizationId),
          parsed.data,
        ),
      );
    });
  }

  @Get(":organizationId/context")
  managementContext(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_CONTEXT_READ", request, async () => {
      requireSingleAuthorization(request);
      const parsed = managementContextQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) throw new ApiTransportValidationError();
      const scope: ManagementScope =
        parsed.data.scopeKind === "LOCATION"
          ? { kind: "LOCATION", locationId: parsed.data.locationId! }
          : { kind: "ALL_LOCATIONS" };
      const context = await this.sessions.resolve(authorization);
      return managementContextResponseSchema.parse(
        await this.service.context(
          context,
          parseOrganizationId(organizationId),
          scope,
        ),
      );
    });
  }
}
