import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  staffShiftHistoryQuerySchema,
  staffShiftHistoryResponseSchema,
  staffShiftHistoryDetailSchema,
  staffShiftEmployeeQuerySchema,
  staffShiftEmployeePageSchema,
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
import { StaffShiftHistoryService } from "./staff-shift-history.service";

@Controller("v1/staff/management/organizations/:organizationId/shifts")
export class StaffShiftHistoryController {
  constructor(
    private readonly history: StaffShiftHistoryService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get()
  list(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_SHIFT_HISTORY_LIST", request, async () => {
      requireSingleManagementAuthorization(request);
      const parsed = staffShiftHistoryQuerySchema.safeParse(query ?? {});
      if (!parsed.success) throw new ApiTransportValidationError();
      return staffShiftHistoryResponseSchema.parse(
        await this.history.list(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId).toLowerCase(),
          parsed.data,
        ),
      );
    });
  }

  @Get("employees")
  employees(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "STAFF_SHIFT_HISTORY_EMPLOYEES",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const parsed = staffShiftEmployeeQuerySchema.safeParse(query ?? {});
        if (!parsed.success) throw new ApiTransportValidationError();
        return staffShiftEmployeePageSchema.parse(
          await this.history.employees(
            await this.sessions.resolve(authorization),
            requireManagementUuid(organizationId).toLowerCase(),
            parsed.data,
          ),
        );
      },
    );
  }

  @Get(":shiftId")
  detail(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("shiftId") shiftId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("STAFF_SHIFT_HISTORY_DETAIL", request, async () => {
      requireSingleManagementAuthorization(request);
      if (
        typeof query !== "object" ||
        query === null ||
        Object.keys(query).length !== 0
      )
        throw new ApiTransportValidationError();
      return staffShiftHistoryDetailSchema.parse(
        await this.history.detail(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId).toLowerCase(),
          requireManagementUuid(shiftId).toLowerCase(),
        ),
      );
    });
  }
}
