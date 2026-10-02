import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  staffShiftForceEndRequestSchema,
  staffShiftForceEndResultSchema,
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
} from "./staff-management-http";
import { StaffShiftForceEndService } from "./staff-shift-force-end.service";

@Controller("v1/staff/management/organizations/:organizationId/shifts")
export class StaffShiftForceEndController {
  constructor(
    private readonly closure: StaffShiftForceEndService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Post(":shiftId/force-end")
  execute(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("shiftId") shiftId: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_SHIFT_FORCE_END", request, async () => {
      requireSingleManagementAuthorization(request);
      const parsed = staffShiftForceEndRequestSchema.safeParse(body);
      if (
        !parsed.success ||
        typeof query !== "object" ||
        query === null ||
        Object.keys(query).length !== 0
      )
        throw new ApiTransportValidationError();
      return staffShiftForceEndResultSchema.parse(
        await this.closure.execute(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId).toLowerCase(),
          requireManagementUuid(shiftId).toLowerCase(),
          parsed.data,
        ),
      );
    });
  }
}
