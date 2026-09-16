import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  liveOperationsMapQuerySchema,
  liveOperationsMapResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { LiveMapService } from "./live-map.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("v1/staff/locations")
export class LiveMapController {
  constructor(
    private readonly service: LiveMapService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessionContexts: StaffSessionContextResolver,
  ) {}

  @Get(":locationId/live-operations-map")
  get(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() rawQuery: unknown,
  ) {
    return this.runner.run("LIVE_OPERATIONS_MAP_READ", request, async () => {
      if (!uuidPattern.test(locationId))
        throw new ApiTransportValidationError();
      const headers = request.rawHeaders;
      if (headers === undefined || headers.length % 2 !== 0)
        throw new UnauthorizedException();
      let count = 0;
      for (let index = 0; index < headers.length; index += 2) {
        if (headers[index]?.toLowerCase() === "authorization") count += 1;
      }
      if (count !== 1) throw new UnauthorizedException();
      const query = liveOperationsMapQuerySchema.safeParse(rawQuery);
      if (!query.success) throw new ApiTransportValidationError();
      const staffSessionContext =
        await this.sessionContexts.resolve(authorization);
      return liveOperationsMapResponseSchema.parse(
        await this.service.execute({
          ...query.data,
          authenticatedUserId: staffSessionContext.userId,
          locationId,
          staffSessionContext,
        }),
      );
    });
  }
}
