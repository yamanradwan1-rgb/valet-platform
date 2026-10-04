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
  shiftPresenceZoneResponseSchema,
  shiftPresenceZoneListResponseSchema,
  shiftPresenceZoneCreateRequestSchema,
  shiftPresenceZoneUpdateRequestSchema,
  shiftPresenceListQuerySchema,
} from "@valet/contracts";

import type { ApiRequest } from "../../common/http/api-request";
import type { HeaderResponse } from "../../common/http/no-store-response";
import { PresenceLocationControllerBase } from "./presence-location-controller-base";
import { parsePresenceCommand } from "./presence-management-http";
import { requireManagementUuid } from "./staff-management-http";

export abstract class PresenceLocationZoneController extends PresenceLocationControllerBase {
  @Get("zones")
  list(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_ZONE_LIST",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceZoneListResponseSchema.parse(
          await this.service.zones(
            context,
            target,
            parsePresenceCommand(shiftPresenceListQuerySchema, query),
          ),
        ),
    );
  }
  @Get("zones/:zoneId")
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_ZONE_READ",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceZoneResponseSchema.parse(
          await this.service.zone(
            context,
            target,
            requireManagementUuid(params.zoneId!),
          ),
        ),
    );
  }
  @Post("zones")
  create(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_ZONE_CREATE",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceZoneResponseSchema.parse(
          await this.service.saveZone(
            context,
            target,
            parsePresenceCommand(shiftPresenceZoneCreateRequestSchema, body),
          ),
        ),
    );
  }
  @Put("zones/:zoneId")
  update(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.handle(
      "PRESENCE_ZONE_UPDATE",
      request,
      authorization,
      params,
      response,
      async (context, target) =>
        shiftPresenceZoneResponseSchema.parse(
          await this.service.saveZone(
            context,
            target,
            parsePresenceCommand(shiftPresenceZoneUpdateRequestSchema, body),
            requireManagementUuid(params.zoneId!),
          ),
        ),
    );
  }
}
