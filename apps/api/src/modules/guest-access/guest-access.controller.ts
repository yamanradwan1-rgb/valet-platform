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
  AntiAbuseRateLimitError,
  AntiAbuseService,
  AntiAbuseUnavailableError,
} from "../anti-abuse/anti-abuse.service";
import {
  ClientAddressUnavailableError,
  TrustedClientAddressResolver,
} from "../anti-abuse/client-address";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { GuestAccessService } from "./guest-access.service";

interface ParseSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;

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

function shapeValidGuestBearer(
  request: ApiRequest,
  value: string | undefined,
): string | undefined {
  const rawHeaders = request.rawHeaders;
  if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) return undefined;
  let authorizationCount = 0;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === "authorization") {
      authorizationCount += 1;
    }
  }
  if (authorizationCount !== 1) return undefined;
  const match = typeof value === "string" ? bearerPattern.exec(value) : null;
  return match?.[1];
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
    private readonly antiAbuse: AntiAbuseService,
    private readonly clientAddresses: TrustedClientAddressResolver,
  ) {}

  @Get("session")
  async getSession(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("GUEST_SESSION_READ", request, async () => {
      parse(emptyRequestSchema, query ?? {});
      let clientAddress: string;
      try {
        clientAddress = this.clientAddresses.resolve(request);
      } catch (error) {
        if (error instanceof ClientAddressUnavailableError) {
          throw new AntiAbuseUnavailableError();
        }
        throw error;
      }
      const addressKey = this.antiAbuse.key(
        "v1:guest-client-address",
        clientAddress,
      );
      const rawToken = shapeValidGuestBearer(request, authorization);
      const tokenKey =
        rawToken === undefined
          ? undefined
          : this.antiAbuse.key("v1:guest-token", rawToken);
      const addressDecision = await this.antiAbuse.reserve(addressKey, 60);
      if (!addressDecision.allowed) {
        const tokenRetry =
          tokenKey === undefined
            ? undefined
            : await this.antiAbuse.blocker(tokenKey, 180);
        throw new AntiAbuseRateLimitError(
          "GUEST_ACCESS_RATE_LIMITED",
          Math.max(addressDecision.retryAfter, tokenRetry ?? 0),
        );
      }
      if (tokenKey !== undefined) {
        const tokenDecision = await this.antiAbuse.count(tokenKey, 180);
        if (!tokenDecision.allowed) {
          await this.antiAbuse.finalize(addressDecision.reservation, "IGNORED");
          throw new AntiAbuseRateLimitError(
            "GUEST_ACCESS_RATE_LIMITED",
            tokenDecision.retryAfter,
          );
        }
      }
      if (rawToken === undefined) {
        await this.antiAbuse.finalize(addressDecision.reservation, "COUNTED");
        throw new GuestAccessError("GUEST_ACCESS_INVALID");
      }
      const result = await this.antiAbuse.transaction(async (transaction) => {
        const resolved = await this.service.resolveInTransaction(
          transaction,
          rawToken,
        );
        await this.antiAbuse.finalizeInTransaction(
          transaction,
          addressDecision.reservation,
          resolved === undefined ? "COUNTED" : "IGNORED",
        );
        return resolved;
      });
      if (result === undefined) {
        throw new GuestAccessError("GUEST_ACCESS_INVALID");
      }
      return guestSessionReadResponseSchema.parse(result);
    });
  }
}
