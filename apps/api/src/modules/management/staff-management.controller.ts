import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  staffDirectoryQuerySchema,
  staffDirectoryResponseSchema,
  staffLocationAccessCommandSchema,
  staffMembershipDetailSchema,
  staffRoleCommandSchema,
  staffStatusCommandSchema,
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
  type StaffSessionContext,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { StaffDirectoryService } from "./staff-directory.service";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
  type StaffManagementCommandSchema,
} from "./staff-management-http";
import { StaffManagementMutationService } from "./staff-management-mutation.service";

@Controller("v1/staff/management/organizations/:organizationId/staff")
export class StaffManagementController {
  constructor(
    private readonly directory: StaffDirectoryService,
    private readonly mutations: StaffManagementMutationService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get()
  list(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_MANAGEMENT_DIRECTORY", request, async () => {
      const parsed = staffDirectoryQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) throw new ApiTransportValidationError();
      return staffDirectoryResponseSchema.parse(
        await this.directory.list(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
          parsed.data,
        ),
      );
    });
  }

  @Get(":membershipId")
  detail(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_MANAGEMENT_DETAIL", request, async () =>
      staffMembershipDetailSchema.parse(
        await this.directory.detail(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(membershipId),
        ),
      ),
    );
  }

  @Post(":membershipId/role")
  role(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.mutation(
      "STAFF_MANAGEMENT_ROLE",
      request,
      authorization,
      organizationId,
      membershipId,
      body,
      staffRoleCommandSchema,
      response,
      (context, organization, membership, command) =>
        this.mutations.role(context, organization, membership, command),
    );
  }

  @Post(":membershipId/activate")
  activate(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.statusMutation(
      "STAFF_MANAGEMENT_ACTIVATE",
      request,
      authorization,
      organizationId,
      membershipId,
      body,
      response,
      "ACTIVE",
    );
  }

  @Post(":membershipId/deactivate")
  deactivate(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.statusMutation(
      "STAFF_MANAGEMENT_DEACTIVATE",
      request,
      authorization,
      organizationId,
      membershipId,
      body,
      response,
      "INACTIVE",
    );
  }

  @Post(":membershipId/location-access/grant")
  grant(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.locationMutation(
      "STAFF_MANAGEMENT_LOCATION_GRANT",
      request,
      authorization,
      organizationId,
      membershipId,
      body,
      response,
      true,
    );
  }

  @Post(":membershipId/location-access/revoke")
  revoke(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.locationMutation(
      "STAFF_MANAGEMENT_LOCATION_REVOKE",
      request,
      authorization,
      organizationId,
      membershipId,
      body,
      response,
      false,
    );
  }

  private context(
    request: ApiRequest,
    authorization: string | undefined,
  ): Promise<StaffSessionContext> {
    requireSingleManagementAuthorization(request);
    return this.sessions.resolve(authorization);
  }

  private statusMutation(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    organizationId: string,
    membershipId: string,
    body: unknown,
    response: HeaderResponse,
    status: "ACTIVE" | "INACTIVE",
  ) {
    return this.mutation(
      operation,
      request,
      authorization,
      organizationId,
      membershipId,
      body,
      staffStatusCommandSchema,
      response,
      (context, organization, membership, command) =>
        this.mutations.status(context, organization, membership, command, status),
    );
  }

  private locationMutation(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    organizationId: string,
    membershipId: string,
    body: unknown,
    response: HeaderResponse,
    granted: boolean,
  ) {
    return this.mutation(
      operation,
      request,
      authorization,
      organizationId,
      membershipId,
      body,
      staffLocationAccessCommandSchema,
      response,
      (context, organization, membership, command) =>
        this.mutations.locationAccess(
          context,
          organization,
          membership,
          command,
          granted,
        ),
    );
  }

  private mutation<T>(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    organizationId: string,
    membershipId: string,
    body: unknown,
    schema: StaffManagementCommandSchema<T>,
    response: HeaderResponse,
    action: (
      context: StaffSessionContext,
      organizationId: string,
      membershipId: string,
      command: T,
    ) => Promise<unknown>,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(operation, request, async () => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return staffMembershipDetailSchema.parse(
        await action(
          await this.context(request, authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(membershipId),
          parsed.data,
        ),
      );
    });
  }
}
