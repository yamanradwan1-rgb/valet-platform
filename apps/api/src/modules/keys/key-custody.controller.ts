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
  assignKeySlotRequestSchema,
  assignKeySlotResponseSchema,
  clearKeySlotRequestSchema,
  clearKeySlotResponseSchema,
  type AssignKeySlotRequest,
  type ClearKeySlotRequest,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { KeyCustodyService } from "./key-custody.service";

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

function parseSessionId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/valet-sessions")
export class KeyCustodyController {
  constructor(
    private readonly service: KeyCustodyService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async userId(
    request: ApiRequest,
    authorization: string | undefined,
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

  @HttpCode(200)
  @Post(":sessionId/key-slot/assign")
  async assign(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("KEY_SLOT_ASSIGN", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse<AssignKeySlotRequest>(
        assignKeySlotRequestSchema,
        body,
      );
      const result = await this.service.executeAssign({
        authenticatedUserId,
        expectedVersion: input.expectedVersion,
        keySlotCode: input.keySlotCode,
        sessionId: parseSessionId(sessionIdRaw),
      });
      return assignKeySlotResponseSchema.parse(result);
    });
  }

  @HttpCode(200)
  @Post(":sessionId/key-slot/clear")
  async clear(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("KEY_SLOT_CLEAR", request, async () => {
      const authenticatedUserId = await this.userId(request, authorization);
      const input = parse<ClearKeySlotRequest>(clearKeySlotRequestSchema, body);
      const result = await this.service.executeClear({
        authenticatedUserId,
        expectedVersion: input.expectedVersion,
        sessionId: parseSessionId(sessionIdRaw),
      });
      return clearKeySlotResponseSchema.parse(result);
    });
  }
}
