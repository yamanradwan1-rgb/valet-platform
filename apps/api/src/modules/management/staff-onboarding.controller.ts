import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  staffOnboardingCreateSchema,
  staffOnboardingResendSchema,
  staffOnboardingResultSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import { requireAuthJson } from "../auth/staff-auth.transport";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "./staff-management-http";
import { StaffOnboardingService } from "./staff-onboarding.service";

@Controller("v1/staff/management/organizations/:organizationId/staff")
export class StaffOnboardingController {
  constructor(
    private readonly onboarding: StaffOnboardingService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Post()
  create(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_ONBOARDING_CREATE", request, async () => {
      requireAuthJson(contentType);
      requireSingleManagementAuthorization(request);
      const command = staffOnboardingCreateSchema.safeParse(body);
      if (!command.success) throw new ApiTransportValidationError();
      return staffOnboardingResultSchema.parse(
        await this.onboarding.create(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          command.data,
        ),
      );
    });
  }

  @Post(":membershipId/invitations")
  resend(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_ONBOARDING_RESEND", request, async () => {
      requireAuthJson(contentType);
      requireSingleManagementAuthorization(request);
      const command = staffOnboardingResendSchema.safeParse(body);
      if (!command.success) throw new ApiTransportValidationError();
      return staffOnboardingResultSchema.parse(
        await this.onboarding.resend(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(membershipId),
          command.data,
        ),
      );
    });
  }
}
