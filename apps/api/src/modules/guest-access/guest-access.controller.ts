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
  UnauthorizedException,
} from "@nestjs/common";
import {
  emptyRequestSchema,
  guestAccessIssueRequestSchema,
  guestAccessIssueResponseSchema,
  guestAccessRevokeResponseSchema,
  guestSessionReadResponseSchema,
  type GuestAccessIssueRequest,
} from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { GuestAccessService } from "./guest-access.service";
import { GuestCredentialAuthorizer } from "./guest-credential-authorizer";

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

function parseAbsentOrEmptyBody(body: unknown): void {
  parse(emptyRequestSchema, body === undefined ? {} : body);
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

function iso(value: Date): string {
  return value.toISOString();
}

@Controller("v1/staff/check-in")
export class StaffGuestAccessController {
  constructor(
    private readonly service: GuestAccessService,
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
  @Post("sessions/:sessionId/guest-access/issue")
  async issueGuestAccess(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("CHECK_IN_GUEST_ACCESS_ISSUE", request, async () => {
      const principalUserId = await this.userId(request, authorization);
      const input = parse<GuestAccessIssueRequest>(
        guestAccessIssueRequestSchema,
        body,
      );
      const result = await this.service.executeIssue({
        authenticatedUserId: principalUserId,
        ...(input.intent === "REISSUE_REVOKED"
          ? { expectedRevokedAt: new Date(input.expectedRevokedAt) }
          : {}),
        intent: input.intent,
        valetSessionId: parseUuid(sessionIdRaw),
      });
      return guestAccessIssueResponseSchema.parse({
        expiresAt: iso(result.expiresAt),
        issuedAt: iso(result.issuedAt),
        mutationKind: result.mutationKind,
        rawToken: result.rawToken,
        valetSessionId: result.valetSessionId,
      });
    });
  }

  @HttpCode(200)
  @Post("sessions/:sessionId/guest-access/revoke")
  async revokeGuestAccess(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "CHECK_IN_GUEST_ACCESS_REVOKE",
      request,
      async () => {
        const principalUserId = await this.userId(request, authorization);
        parseAbsentOrEmptyBody(body);
        const result = await this.service.executeRevoke({
          authenticatedUserId: principalUserId,
          valetSessionId: parseUuid(sessionIdRaw),
        });
        return guestAccessRevokeResponseSchema.parse({
          revokedAt: iso(result.revokedAt),
          valetSessionId: result.valetSessionId,
        });
      },
    );
  }
}

@Controller("v1/guest")
export class GuestAccessController {
  constructor(
    private readonly service: GuestAccessService,
    private readonly runner: ApiOperationRunner,
    private readonly authorizer: GuestCredentialAuthorizer,
  ) {}

  @Get("session")
  async getSession(
    @Req() request: ApiRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("GUEST_SESSION_READ", request, async () => {
      parse(emptyRequestSchema, query ?? {});
      return guestSessionReadResponseSchema.parse(
        await this.authorizer.read(request),
      );
    });
  }
}
