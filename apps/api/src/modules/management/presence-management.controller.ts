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
  shiftPresenceCompanyResponseSchema,
  shiftPresenceCompanySetRequestSchema,
  shiftPresenceManagementResultSchema,
} from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import type { HeaderResponse } from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { PresenceManagementService } from "./presence-management.service";
import {
  presenceManagementHttpContext,
  parsePresenceCommand,
} from "./presence-management-http";
import { requireManagementUuid } from "./staff-management-http";
import { PresenceLocationPolicyController } from "./presence-location-policy-controller";
import { PresenceLocationZoneController } from "./presence-location-zone-controller";
import { PresenceLocationExceptionController } from "./presence-location-exception-controller";

@Controller("v1/staff/management/organizations/:organizationId/shift-presence")
export class PresenceCompanyController {
  constructor(
    private readonly service: PresenceManagementService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("policy")
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.runner.run("PRESENCE_COMPANY_POLICY_READ", request, async () =>
      shiftPresenceCompanyResponseSchema.parse(
        await this.service.company(
          await presenceManagementHttpContext(
            request,
            authorization,
            response,
            this.sessions,
          ),
          {
            authority: "COMPANY_ADMIN",
            organizationId: requireManagementUuid(organizationId),
          },
        ),
      ),
    );
  }
  @Put("policy/default")
  set(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.runner.run("PRESENCE_COMPANY_POLICY_SET", request, async () =>
      shiftPresenceCompanyResponseSchema.parse(
        await this.service.setCompany(
          await presenceManagementHttpContext(
            request,
            authorization,
            response,
            this.sessions,
          ),
          {
            authority: "COMPANY_ADMIN",
            organizationId: requireManagementUuid(organizationId),
          },
          parsePresenceCommand(shiftPresenceCompanySetRequestSchema, body),
        ),
      ),
    );
  }
  @Get("results/:mutationId")
  result(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("mutationId") mutationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.runner.run("PRESENCE_COMPANY_RESULT", request, async () =>
      shiftPresenceManagementResultSchema.parse(
        await this.service.result(
          await presenceManagementHttpContext(
            request,
            authorization,
            response,
            this.sessions,
          ),
          {
            authority: "COMPANY_ADMIN",
            organizationId: requireManagementUuid(organizationId),
          },
          requireManagementUuid(mutationId),
        ),
      ),
    );
  }
}

@Controller(
  "v1/staff/management/organizations/:organizationId/shift-presence/locations/:locationId",
)
export class PresenceCaPolicyController extends PresenceLocationPolicyController {
  protected readonly authority = "COMPANY_ADMIN" as const;
}
@Controller(
  "v1/staff/management/organizations/:organizationId/shift-presence/locations/:locationId",
)
export class PresenceCaZoneController extends PresenceLocationZoneController {
  protected readonly authority = "COMPANY_ADMIN" as const;
}
@Controller(
  "v1/staff/management/organizations/:organizationId/shift-presence/locations/:locationId",
)
export class PresenceCaExceptionController extends PresenceLocationExceptionController {
  protected readonly authority = "COMPANY_ADMIN" as const;
}
