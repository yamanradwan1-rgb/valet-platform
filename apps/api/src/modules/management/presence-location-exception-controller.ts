import {
  Body,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  shiftPresenceManagementExceptionSchema,
  shiftPresenceExceptionListResponseSchema,
  shiftPresenceExceptionListQuerySchema,
  shiftPresenceExceptionReviewRequestSchema,
} from "@valet/contracts";

import type { ApiRequest } from "../../common/http/api-request";
import type { HeaderResponse } from "../../common/http/no-store-response";
import { PresenceLocationControllerBase } from "./presence-location-controller-base";
import { parsePresenceCommand } from "./presence-management-http";
import { requireManagementUuid } from "./staff-management-http";

export abstract class PresenceLocationExceptionController extends PresenceLocationControllerBase {
  @Get("exceptions")
  list(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_EXCEPTION_LIST",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceExceptionListResponseSchema.parse(
          await this.service.exceptions(
            context,
            target,
            parsePresenceCommand(shiftPresenceExceptionListQuerySchema, query),
          ),
        ),
    );
  }
  @Get("exceptions/:exceptionId")
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_EXCEPTION_MANAGEMENT_READ",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceManagementExceptionSchema.parse(
          await this.service.exception(
            context,
            target,
            requireManagementUuid(params.exceptionId!),
          ),
        ),
    );
  }
  @Post("exceptions/:exceptionId/approve")
  approve(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_EXCEPTION_APPROVE",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceManagementExceptionSchema.parse(
          await this.service.review(
            context,
            target,
            requireManagementUuid(params.exceptionId!),
            parsePresenceCommand(
              shiftPresenceExceptionReviewRequestSchema,
              body,
            ),
            "APPROVED",
          ),
        ),
    );
  }
  @Post("exceptions/:exceptionId/reject")
  reject(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_EXCEPTION_REJECT",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceManagementExceptionSchema.parse(
          await this.service.review(
            context,
            target,
            requireManagementUuid(params.exceptionId!),
            parsePresenceCommand(
              shiftPresenceExceptionReviewRequestSchema,
              body,
            ),
            "REJECTED",
          ),
        ),
    );
  }
}
