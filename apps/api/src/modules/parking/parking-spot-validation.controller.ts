import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  parkingSpotValidationQuerySchema,
  parkingSpotValidationResponseSchema,
  parkingSpotValidationSessionIdSchema,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { ParkingSpotValidationService } from "./parking-spot-validation.service";

@Controller("v1/staff/valet-sessions")
export class ParkingSpotValidationController {
  constructor(
    private readonly service: ParkingSpotValidationService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  @Get(":sessionId/parking-spot-validation")
  @Header("Cache-Control", "no-store")
  validate(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("PARKING_SPOT_VALIDATION", request, async () => {
      const headers = request.rawHeaders;
      if (!headers || headers.length % 2 !== 0)
        throw new UnauthorizedException();
      let count = 0;
      for (let i = 0; i < headers.length; i += 2) {
        if (headers[i]?.toLowerCase() === "authorization") count += 1;
      }
      if (count !== 1) throw new UnauthorizedException();
      const principal = await this.principals.resolve(authorization);
      const input = parkingSpotValidationQuerySchema.safeParse(query);
      const id = parkingSpotValidationSessionIdSchema.safeParse(sessionId);
      if (!input.success || !id.success)
        throw new ApiTransportValidationError();
      return parkingSpotValidationResponseSchema.parse(
        await this.service.execute({
          ...input.data,
          sessionId: id.data,
          authenticatedUserId: principal.userId,
        }),
      );
    });
  }
}
