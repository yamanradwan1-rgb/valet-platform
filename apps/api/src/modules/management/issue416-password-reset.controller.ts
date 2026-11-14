import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  staffPasswordResetIssueRequestSchema,
  staffPasswordResetIssueResponseSchema,
  staffPasswordResetStatusResponseSchema,
} from "@valet/contracts";
import type { ApiRequest } from "../../common/http/api-request";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import { StaffAuthOriginPolicy } from "../auth/staff-auth.origin";
import { StaffAuthOriginError } from "../auth/staff-auth.controller";
import {
  parseAuthBody,
  requireAuthJson,
  requireEmptyAuthQuery,
} from "../auth/staff-auth.transport";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "./staff-management-http";
import { Issue416PasswordResetService } from "./issue416-password-reset.service";

/**
 * Dormant: no ManagementModule registration until the purpose-specific SQL
 * writer and its proof/ACL/race gates are independently approved.
 */
@Controller("v1/staff/management/organizations/:organizationId/staff")
export class Issue416PasswordResetManagementController {
  constructor(
    private readonly service: Issue416PasswordResetService,
    private readonly origins: StaffAuthOriginPolicy,
    private readonly runner: ApiOperationRunner,
  ) {}

  @Get(":membershipId/password-resets/status")
  status(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_PASSWORD_RESET_STATUS", request, async () => {
      requireSingleManagementAuthorization(request);
      requireEmptyAuthQuery(query);
      return staffPasswordResetStatusResponseSchema.parse(
        await this.service.status(
          authorization,
          requireManagementUuid(organizationId).toLowerCase(),
          requireManagementUuid(membershipId).toLowerCase(),
        ),
      );
    });
  }

  @Post(":membershipId/password-resets")
  @HttpCode(200)
  issue(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Query() query: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    response.setHeader("Referrer-Policy", "no-referrer");
    return this.runner.run("STAFF_PASSWORD_RESET_ISSUE", request, async () => {
      requireSingleManagementAuthorization(request);
      if (!this.origins.allows(origin)) throw new StaffAuthOriginError();
      requireAuthJson(contentType);
      requireEmptyAuthQuery(query);
      return staffPasswordResetIssueResponseSchema.parse(
        await this.service.issue(
          authorization,
          requireManagementUuid(organizationId).toLowerCase(),
          requireManagementUuid(membershipId).toLowerCase(),
          parseAuthBody(staffPasswordResetIssueRequestSchema, body),
          request,
        ),
      );
    });
  }
}
