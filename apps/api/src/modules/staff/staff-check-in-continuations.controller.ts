import {
  Controller,
  Get,
  Headers,
  Inject,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  checkInContinuationsQuerySchema,
  staffCheckInContinuationsResponseSchema,
  type CheckInContinuationsQuery,
  type StaffCheckInContinuationsResponse,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { StaffCheckInContinuationsService } from "./staff-check-in-continuations.service";

interface ParseSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

function parse<T>(schema: ParseSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

@Controller("v1/staff/check-in")
export class StaffCheckInContinuationsController {
  constructor(
    private readonly service: StaffCheckInContinuationsService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async userId(
    request: ApiRequest,
    authorization?: string,
  ): Promise<string> {
    const rawHeaders = request.rawHeaders;
    let count = 0;
    if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) {
      throw new UnauthorizedException();
    }
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === "authorization") count += 1;
    }
    if (count !== 1) throw new UnauthorizedException();
    return (await this.principals.resolve(authorization)).userId;
  }

  @Get("continuations")
  async getContinuations(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() query: unknown,
  ): Promise<StaffCheckInContinuationsResponse> {
    return this.runner.run(
      "STAFF_CHECK_IN_CONTINUATION_DISCOVERY_READ",
      request,
      async () => {
        const authenticatedUserId = await this.userId(request, authorization);
        const input = parse<CheckInContinuationsQuery>(
          checkInContinuationsQuerySchema,
          query,
        );
        const result = await this.service.getContinuations(
          authenticatedUserId,
          input.locationId,
        );
        return staffCheckInContinuationsResponseSchema.parse(result);
      },
    );
  }
}
