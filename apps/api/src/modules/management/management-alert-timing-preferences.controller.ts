import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import {
  managementAlertTimingPreferencesResponseSchema,
  managementAlertTimingPreferencesSetRequestSchema,
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
import { ManagementAlertTimingPreferencesService } from "./management-alert-timing-preferences.service";

@Controller(
  "v1/staff/management/organizations/:organizationId/locations/:locationId/alert-timing-preferences",
)
export class ManagementAlertTimingPreferencesController {
  constructor(
    private readonly preferences: ManagementAlertTimingPreferencesService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get()
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "MANAGEMENT_ALERT_TIMING_PREFERENCES_READ",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        return managementAlertTimingPreferencesResponseSchema.parse(
          await this.preferences.read({
            context: await this.sessions.resolve(authorization),
            organizationId: requireManagementUuid(organizationId),
            locationId: requireManagementUuid(locationId),
          }),
        );
      },
    );
  }

  @Put()
  save(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "MANAGEMENT_ALERT_TIMING_PREFERENCES_SET",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const parsed =
          managementAlertTimingPreferencesSetRequestSchema.safeParse(body);
        if (!parsed.success) throw new ApiTransportValidationError();
        return managementAlertTimingPreferencesResponseSchema.parse(
          await this.preferences.save(
            {
              context: await this.sessions.resolve(authorization),
              organizationId: requireManagementUuid(organizationId),
              locationId: requireManagementUuid(locationId),
            },
            parsed.data,
          ),
        );
      },
    );
  }
}
