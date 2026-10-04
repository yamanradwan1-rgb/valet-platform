import {
  Body,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  shiftPresenceLocationResponseSchema,
  shiftPresenceLocationSetRequestSchema,
  shiftPresenceLocationClearRequestSchema,
  shiftPresenceReadinessSchema,
  shiftPresenceManagementResultSchema,
  shiftPresenceManagementResultQuerySchema,
} from "@valet/contracts";

import type { ApiRequest } from "../../common/http/api-request";
import type { HeaderResponse } from "../../common/http/no-store-response";
import { PresenceLocationControllerBase } from "./presence-location-controller-base";
import { parsePresenceCommand } from "./presence-management-http";
import { requireManagementUuid } from "./staff-management-http";

export abstract class PresenceLocationPolicyController extends PresenceLocationControllerBase {
  @Get("policy")
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_LOCATION_POLICY_READ",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceLocationResponseSchema.parse(
          await this.service.location(context, target),
        ),
    );
  }
  @Get("readiness")
  readiness(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_READINESS_READ",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceReadinessSchema.parse(
          (await this.service.location(context, target)).readiness,
        ),
    );
  }
  @Put("policy/override")
  set(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_LOCATION_POLICY_SET",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceLocationResponseSchema.parse(
          await this.service.changeLocation(
            context,
            target,
            parsePresenceCommand(shiftPresenceLocationSetRequestSchema, body),
          ),
        ),
    );
  }
  @Post("policy/override/clear")
  clear(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_LOCATION_POLICY_CLEAR",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceLocationResponseSchema.parse(
          await this.service.changeLocation(
            context,
            target,
            parsePresenceCommand(shiftPresenceLocationClearRequestSchema, body),
          ),
        ),
    );
  }
  @Get("results/:mutationId")
  result(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_MANAGEMENT_RESULT",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceManagementResultSchema.parse(
          await this.service.result(
            context,
            target,
            requireManagementUuid(params.mutationId!),
            parsePresenceCommand(
              shiftPresenceManagementResultQuerySchema,
              Object.keys(query).length === 0 ? { kind: "POLICY" } : query,
            ),
          ),
        ),
    );
  }
}
