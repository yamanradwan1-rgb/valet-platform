import {
  Controller, Get, Headers, Inject, Param, Query, Req, UnauthorizedException,
} from "@nestjs/common";
import {
  routeHistoryQuerySchema,
  routeHistoryResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER, type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { RouteHistoryService } from "./route-history.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("v1/staff/tracking-sessions")
export class RouteHistoryController {
  constructor(
    private readonly service: RouteHistoryService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER) private readonly principals: StaffPrincipalResolver,
  ) {}

  @Get(":trackingSessionId/route-history")
  get(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("trackingSessionId") trackingSessionId: string,
    @Query() rawQuery: unknown,
  ) {
    return this.runner.run("ROUTE_HISTORY_READ", request, async () => {
      if (!uuidPattern.test(trackingSessionId)) throw new ApiTransportValidationError();
      const headers = request.rawHeaders;
      if (headers === undefined || headers.length % 2 !== 0) throw new UnauthorizedException();
      let count = 0;
      for (let index = 0; index < headers.length; index += 2) {
        if (headers[index]?.toLowerCase() === "authorization") count += 1;
      }
      if (count !== 1) throw new UnauthorizedException();
      const query = routeHistoryQuerySchema.safeParse(rawQuery);
      if (!query.success) throw new ApiTransportValidationError();
      const authenticatedUserId = (await this.principals.resolve(authorization)).userId;
      return routeHistoryResponseSchema.parse(await this.service.execute({
        ...query.data,
        authenticatedUserId,
        trackingSessionId,
      }));
    });
  }
}
