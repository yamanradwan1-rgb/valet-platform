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
  managementIntegrationsResponseSchema,
  managementSubscriptionResponseSchema,
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
import { ManagementCommercialReadService } from "./management-commercial-read.service";
import { ManagementIntegrationsService } from "./management-integrations.service";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "./staff-management-http";

function requireEmptyQuery(value: unknown): void {
  const query = value ?? {};
  if (
    query === null ||
    typeof query !== "object" ||
    Array.isArray(query) ||
    Object.keys(query).length !== 0
  ) {
    throw new ApiTransportValidationError();
  }
}

@Controller("v1/staff/management/organizations/:organizationId")
export class ManagementCommercialController {
  constructor(
    private readonly commercial: ManagementCommercialReadService,
    private readonly integrations: ManagementIntegrationsService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  private async context(request: ApiRequest, authorization: string | undefined) {
    requireSingleManagementAuthorization(request);
    return this.sessions.resolve(authorization);
  }

  @Get("subscription")
  subscription(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_SUBSCRIPTION_READ", request, async () => {
      requireEmptyQuery(rawQuery);
      const context = await this.context(request, authorization);
      return managementSubscriptionResponseSchema.parse(
        await this.commercial.read(
          context,
          requireManagementUuid(organizationId),
        ),
      );
    });
  }

  @Get("integrations")
  integrationsRead(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_INTEGRATIONS_READ", request, async () => {
      requireEmptyQuery(rawQuery);
      const context = await this.context(request, authorization);
      return managementIntegrationsResponseSchema.parse(
        await this.integrations.read(
          context,
          requireManagementUuid(organizationId),
        ),
      );
    });
  }
}
