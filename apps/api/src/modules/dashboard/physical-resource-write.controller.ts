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
  createKeySlotRequestSchema,
  createParkingSpotRequestSchema,
  keySlotConfigurationSchema,
  parkingSpotConfigurationSchema,
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
import { PhysicalResourceWriteService } from "./physical-resource-write.service";

@Controller("v1/staff/dashboard/locations/:locationId/physical-resources")
export class PhysicalResourceWriteController {
  constructor(
    private readonly writes: PhysicalResourceWriteService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Post("key-slots")
  createKeySlot(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("DASHBOARD_PHYSICAL_KEY_SLOT_CREATE", request, async () => {
      requireSingleManagementAuthorization(request);
      const parsed = createKeySlotRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return keySlotConfigurationSchema.parse(
        await this.writes.createKeySlot(
          await this.sessions.resolve(authorization),
          requireManagementUuid(locationId),
          parsed.data,
        ),
      );
    });
  }

  @Post("parking-spots")
  createParkingSpot(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("DASHBOARD_PHYSICAL_PARKING_SPOT_CREATE", request, async () => {
      requireSingleManagementAuthorization(request);
      const parsed = createParkingSpotRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      return parkingSpotConfigurationSchema.parse(
        await this.writes.createParkingSpot(
          await this.sessions.resolve(authorization),
          requireManagementUuid(locationId),
          parsed.data,
        ),
      );
    });
  }
}
