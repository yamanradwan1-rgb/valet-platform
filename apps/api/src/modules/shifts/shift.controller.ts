import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  activeShiftQuerySchema,
  activeShiftResponseSchema,
  endShiftRequestSchema,
  endShiftResponseSchema,
  startShiftRequestSchema,
  startShiftResponseSchema,
  type ActiveShiftQuery,
  type StartShiftRequest,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { ShiftService } from "./shift.service";
import type { ShiftResult } from "./shift-types";

interface ParseSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T>(schema: ParseSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

function serializeShift(shift: ShiftResult) {
  return {
    endedAt: shift.endedAt?.toISOString() ?? null,
    locationId: shift.locationId,
    shiftId: shift.shiftId,
    startedAt: shift.startedAt.toISOString(),
    status: shift.status,
  };
}

@Controller("v1/staff/shifts")
export class ShiftController {
  constructor(
    private readonly service: ShiftService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async userId(
    request: ApiRequest,
    authorization: string | undefined,
  ): Promise<string> {
    const rawHeaders = request.rawHeaders;
    let authorizationCount = 0;
    if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) {
      throw new UnauthorizedException();
    }
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === "authorization") {
        authorizationCount += 1;
      }
    }
    if (authorizationCount !== 1) throw new UnauthorizedException();
    return (await this.principals.resolve(authorization)).userId;
  }

  @HttpCode(200)
  @Post("start")
  async start(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.runner.run("SHIFT_START", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse<StartShiftRequest>(startShiftRequestSchema, body);
      const shift = await this.service.executeStart({
        authenticatedUserId,
        targetLocationId: input.targetLocationId,
      });
      return startShiftResponseSchema.parse(serializeShift(shift));
    });
  }

  @HttpCode(200)
  @Post(":shiftId/end")
  async end(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("shiftId") shiftIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("SHIFT_END", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      parse(endShiftRequestSchema, body === undefined ? {} : body);
      const shift = await this.service.executeEnd({
        authenticatedUserId,
        shiftId: parseUuid(shiftIdRaw),
      });
      return endShiftResponseSchema.parse(serializeShift(shift));
    });
  }

  @Get("active")
  async active(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() query: unknown,
  ) {
    return this.runner.run("SHIFT_ACTIVE_LOOKUP", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse<ActiveShiftQuery>(activeShiftQuerySchema, query);
      const shift = await this.service.loadActive({
        authenticatedUserId,
        locationId: input.locationId,
      });
      return activeShiftResponseSchema.parse({
        shift: shift === null ? null : serializeShift(shift),
      });
    });
  }
}
