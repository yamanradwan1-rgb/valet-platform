import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  abortHandoffResponseSchema,
  handoffReasonRequestSchema,
  handoffVersionRequestSchema,
  initiateHandoffResponseSchema,
  verifiedHandoffResponseSchema,
  verifyDynamicQrRequestSchema,
  verifyPickupCodeRequestSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { HandoffService } from "./handoff.service";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data === undefined)
    throw new ApiTransportValidationError();
  return parsed.data;
}

function sessionId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/valet-sessions")
export class HandoffStaffController {
  constructor(
    private readonly service: HandoffService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async userId(request: ApiRequest, authorization?: string) {
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

  @HttpCode(200)
  @Post(":sessionId/initiate-handoff")
  initiate(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") rawId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("INITIATE_HANDOFF", request, async () => {
      const input = parse(handoffVersionRequestSchema, body);
      return initiateHandoffResponseSchema.parse(
        await this.service.executeInitiate({
          authenticatedUserId: await this.userId(request, authorization),
          expectedSessionVersion: input.expectedSessionVersion,
          sessionId: sessionId(rawId),
        }),
      );
    });
  }

  @HttpCode(200)
  @Post(":sessionId/verify-pickup-code")
  verifyPickupCode(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") rawId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("VERIFY_PICKUP_CODE", request, async () => {
      const input = parse(verifyPickupCodeRequestSchema, body);
      return verifiedHandoffResponseSchema.parse(
        await this.service.executeVerify({
          authenticatedUserId: await this.userId(request, authorization),
          expectedSessionVersion: input.expectedSessionVersion,
          material: input.pickupCode,
          method: "PICKUP_CODE",
          sessionId: sessionId(rawId),
        }),
      );
    });
  }

  @HttpCode(200)
  @Post(":sessionId/verify-dynamic-qr")
  verifyDynamicQr(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") rawId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("VERIFY_DYNAMIC_QR", request, async () => {
      const input = parse(verifyDynamicQrRequestSchema, body);
      return verifiedHandoffResponseSchema.parse(
        await this.service.executeVerify({
          authenticatedUserId: await this.userId(request, authorization),
          expectedSessionVersion: input.expectedSessionVersion,
          material: input.qrPayload,
          method: "DYNAMIC_QR",
          sessionId: sessionId(rawId),
        }),
      );
    });
  }

  @HttpCode(200)
  @Post(":sessionId/supervisor-override-handoff")
  override(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") rawId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("SUPERVISOR_OVERRIDE_HANDOFF", request, async () => {
      const input = parse(handoffReasonRequestSchema, body);
      return verifiedHandoffResponseSchema.parse(
        await this.service.executeOverride({
          authenticatedUserId: await this.userId(request, authorization),
          expectedSessionVersion: input.expectedSessionVersion,
          reason: input.reason,
          sessionId: sessionId(rawId),
        }),
      );
    });
  }

  @HttpCode(200)
  @Post(":sessionId/abort-handoff")
  abort(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") rawId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("ABORT_HANDOFF", request, async () => {
      const input = parse(handoffReasonRequestSchema, body);
      return abortHandoffResponseSchema.parse(
        await this.service.executeAbort({
          authenticatedUserId: await this.userId(request, authorization),
          expectedSessionVersion: input.expectedSessionVersion,
          reason: input.reason,
          sessionId: sessionId(rawId),
        }),
      );
    });
  }
}
