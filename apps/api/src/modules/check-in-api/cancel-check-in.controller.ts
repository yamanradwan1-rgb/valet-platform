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
  Res,
} from "@nestjs/common";
import {
  cancelCheckInRequestSchema,
  cancelCheckInResponseSchema,
  cancelCheckInStatusQuerySchema,
  cancelCheckInStatusResponseSchema,
} from "@valet/contracts";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import {
  CheckInOperationRunner,
  type CheckInApiRequest,
} from "./check-in-operation-runner";
import {
  parseCheckInBody,
  parseCheckInUuid,
  resolveCheckInUserId,
} from "./check-in-controller-support";
import { CancelCheckInService } from "./cancel-check-in.service";

@Controller("v1/staff/check-in")
export class CancelCheckInController {
  constructor(
    private readonly service: CancelCheckInService,
    private readonly runner: CheckInOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  @HttpCode(200)
  @Post("sessions/:sessionId/cancel")
  cancel(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("CHECK_IN_CANCEL", request, async () => {
      const authenticatedUserId = await resolveCheckInUserId(
        this.principals,
        request,
        authorization,
      );
      const input = parseCheckInBody(cancelCheckInRequestSchema, body);
      return cancelCheckInResponseSchema.parse(
        await this.service.cancel({
          ...input,
          authenticatedUserId,
          sessionId: parseCheckInUuid(sessionId),
        }),
      );
    });
  }

  @Get("sessions/:sessionId/cancel-status")
  status(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("CHECK_IN_CANCEL_STATUS", request, async () => {
      const authenticatedUserId = await resolveCheckInUserId(
        this.principals,
        request,
        authorization,
      );
      const input = parseCheckInBody(cancelCheckInStatusQuerySchema, query);
      return cancelCheckInStatusResponseSchema.parse(
        await this.service.status({
          ...input,
          authenticatedUserId,
          sessionId: parseCheckInUuid(sessionId),
        }),
      );
    });
  }
}
