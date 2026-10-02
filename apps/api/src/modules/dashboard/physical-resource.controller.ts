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
  keySlotConfigurationListSchema,
  parkingSpotListResponseSchema,
  parkingZoneSelectorListSchema,
  physicalResourceLabelSchema,
  physicalResourceListQuerySchema,
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
} from "../management/staff-management-http";
import { PhysicalResourceReadService } from "./physical-resource-read.service";

@Controller("v1/staff/dashboard/locations/:locationId/physical-resources")
export class PhysicalResourceController {
  constructor(
    private readonly reads: PhysicalResourceReadService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("key-slots")
  keySlots(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.list(
      "DASHBOARD_PHYSICAL_KEY_SLOTS_LIST",
      request,
      authorization,
      locationId,
      rawQuery,
      response,
      (context, id, query) => this.reads.listKeySlots(context, id, query),
      keySlotConfigurationListSchema,
    );
  }

  @Get("parking-spots")
  parkingSpots(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.list(
      "DASHBOARD_PHYSICAL_PARKING_SPOTS_LIST",
      request,
      authorization,
      locationId,
      rawQuery,
      response,
      (context, id, query) => this.reads.listParkingSpots(context, id, query),
      parkingSpotListResponseSchema,
    );
  }

  @Get("parking-zones")
  parkingZones(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.list(
      "DASHBOARD_PHYSICAL_PARKING_ZONES_LIST",
      request,
      authorization,
      locationId,
      rawQuery,
      response,
      (context, id, query) => this.reads.listParkingZones(context, id, query),
      parkingZoneSelectorListSchema,
    );
  }

  @Get("key-slots/:resourceId/label")
  keySlotLabel(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("resourceId") resourceId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.label(
      "DASHBOARD_PHYSICAL_KEY_SLOT_LABEL",
      request,
      authorization,
      locationId,
      resourceId,
      "key-slot",
      response,
    );
  }

  @Get("parking-spots/:resourceId/label")
  parkingSpotLabel(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("resourceId") resourceId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    return this.label(
      "DASHBOARD_PHYSICAL_PARKING_SPOT_LABEL",
      request,
      authorization,
      locationId,
      resourceId,
      "parking-spot",
      response,
    );
  }

  private list<T>(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    locationId: string,
    rawQuery: unknown,
    response: HeaderResponse,
    action: (
      context: Awaited<ReturnType<StaffSessionContextResolver["resolve"]>>,
      locationId: string,
      query: ReturnType<typeof physicalResourceListQuerySchema.parse>,
    ) => Promise<T>,
    schema: { parse(value: unknown): T },
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(operation, request, async () => {
      requireSingleManagementAuthorization(request);
      const parsed = physicalResourceListQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) throw new ApiTransportValidationError();
      return schema.parse(
        await action(
          await this.sessions.resolve(authorization),
          requireManagementUuid(locationId),
          parsed.data,
        ),
      );
    });
  }

  private label(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    locationId: string,
    resourceId: string,
    kind: "key-slot" | "parking-spot",
    response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(operation, request, async () => {
      requireSingleManagementAuthorization(request);
      return physicalResourceLabelSchema.parse(
        await this.reads.label(
          await this.sessions.resolve(authorization),
          requireManagementUuid(locationId),
          kind,
          requireManagementUuid(resourceId),
        ),
      );
    });
  }
}
