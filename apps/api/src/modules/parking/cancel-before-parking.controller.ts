import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  cancelBeforeParkingRequestSchema,
  cancelBeforeParkingResponseSchema,
  parkingCancellationSessionIdSchema,
  parkingCancellationStatusQuerySchema,
  parkingCancellationStatusResponseSchema,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { CancelBeforeParkingService } from "./cancel-before-parking.service";

function parse<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiTransportValidationError();
  return result.data as T;
}
@Controller("v1/staff/valet-sessions")
export class CancelBeforeParkingController {
  constructor(
    private readonly service: CancelBeforeParkingService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}
  private async userId(request: ApiRequest, authorization?: string) {
    const headers = request.rawHeaders;
    if (!headers || headers.length % 2 !== 0) throw new UnauthorizedException();
    let count = 0;
    for (let i = 0; i < headers.length; i += 2)
      if (headers[i]?.toLowerCase() === "authorization") count += 1;
    if (count !== 1) throw new UnauthorizedException();
    return (await this.principals.resolve(authorization)).userId;
  }
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Post(":sessionId/cancel-before-parking")
  cancel(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") id: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("CANCEL_BEFORE_PARKING", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      return cancelBeforeParkingResponseSchema.parse(
        await this.service.execute({
          authenticatedUserId,
          sessionId: parse(parkingCancellationSessionIdSchema, id),
          ...parse(cancelBeforeParkingRequestSchema, body),
        }),
      );
    });
  }
  @Get(":sessionId/parking-cancellation-status")
  @Header("Cache-Control", "no-store")
  status(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") id: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("PARKING_CANCELLATION_STATUS", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      return parkingCancellationStatusResponseSchema.parse(
        await this.service.read({
          authenticatedUserId,
          sessionId: parse(parkingCancellationSessionIdSchema, id),
          ...parse(parkingCancellationStatusQuerySchema, query),
        }),
      );
    });
  }
}
