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
  staffValetSessionDetailResponseSchema,
  staffVehicleDirectoryQuerySchema,
  staffVehicleDirectoryResponseSchema,
  type StaffValetSessionDetailResponse,
  type StaffVehicleDirectoryResponse,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { StaffValetSessionService } from "./staff-valet-session.service";
import { StaffVehicleDirectoryService } from "./staff-vehicle-directory.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseSessionId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

function parseDirectoryQuery(query: unknown): string {
  const parsed = staffVehicleDirectoryQuerySchema.safeParse(query);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data.locationId;
}

@Controller("v1/staff/valet-sessions")
export class StaffValetSessionController {
  constructor(
    private readonly service: StaffValetSessionService,
    private readonly directory: StaffVehicleDirectoryService,
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

  /**
   * Literal route declared before ":sessionId" so NestJS/Express cannot
   * swallow it as an invalid session id.
   */
  @Get("directory")
  async getVehicleDirectory(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() query: unknown,
  ): Promise<StaffVehicleDirectoryResponse> {
    return this.runner.run(
      "STAFF_VEHICLE_DIRECTORY_READ",
      request,
      async () => {
        const authenticatedUserId = await this.userId(request, authorization);
        const locationId = parseDirectoryQuery(query);
        const result = await this.directory.getVehicleDirectory(
          authenticatedUserId,
          locationId,
        );
        return staffVehicleDirectoryResponseSchema.parse(result);
      },
    );
  }

  @Get(":sessionId")
  async getSessionDetail(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
  ): Promise<StaffValetSessionDetailResponse> {
    return this.runner.run(
      "STAFF_VALET_SESSION_DETAIL_READ",
      request,
      async () => {
        const authenticatedUserId = await this.userId(request, authorization);
        const sessionId = parseSessionId(sessionIdRaw);
        const result = await this.service.getSessionDetail(
          authenticatedUserId,
          sessionId,
        );
        return staffValetSessionDetailResponseSchema.parse(result);
      },
    );
  }
}
