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
  checkInDraftsQuerySchema,
  staffCheckInDraftsResponseSchema,
  type CheckInDraftsQuery,
  type StaffCheckInDraftsResponse,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { StaffCheckInDraftsService } from "./staff-check-in-drafts.service";

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
export class StaffCheckInDraftsController {
  constructor(
    private readonly service: StaffCheckInDraftsService,
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

  @Get("drafts")
  async getDrafts(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() query: unknown,
  ): Promise<StaffCheckInDraftsResponse> {
    return this.runner.run(
      "STAFF_CHECK_IN_DRAFT_DISCOVERY_READ",
      request,
      async () => {
        const authenticatedUserId = await this.userId(request, authorization);
        const input = parse<CheckInDraftsQuery>(
          checkInDraftsQuerySchema,
          query,
        );
        const result = await this.service.getDrafts(
          authenticatedUserId,
          input.locationId,
        );
        return staffCheckInDraftsResponseSchema.parse(result);
      },
    );
  }
}
