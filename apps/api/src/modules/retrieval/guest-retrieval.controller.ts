import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  emptyRequestSchema,
  guestSafeSessionResponseSchema,
} from "@valet/contracts";

import type { ApiRequest } from "../../common/http/api-request";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import {
  AntiAbuseRateLimitError,
  AntiAbuseService,
  AntiAbuseUnavailableError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import {
  ClientAddressUnavailableError,
  TrustedClientAddressResolver,
} from "../anti-abuse/client-address";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { RetrievalService } from "./retrieval.service";

const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;

function parseEmptyBody(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value === undefined ? {} : value).success) {
    throw new ApiTransportValidationError();
  }
}

function parseEmptyQuery(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value === undefined ? {} : value).success) {
    throw new ApiTransportValidationError();
  }
}

function shapeValidGuestBearer(
  request: ApiRequest,
  authorization: string | undefined,
): string | undefined {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0) return undefined;
  let count = 0;
  for (let index = 0; index < headers.length; index += 2) {
    if (headers[index]?.toLowerCase() === "authorization") count += 1;
  }
  if (count !== 1) return undefined;
  return bearerPattern.exec(authorization ?? "")?.[1];
}

@Controller("v1/guest/session")
export class GuestRetrievalController {
  constructor(
    private readonly service: RetrievalService,
    private readonly runner: ApiOperationRunner,
    private readonly antiAbuse: AntiAbuseService,
    private readonly clientAddresses: TrustedClientAddressResolver,
  ) {}

  private async authorizeGuestOperation(
    request: ApiRequest,
    authorization: string | undefined,
    operation: (
      reservation: AntiAbuseReservation,
      rawToken: string,
    ) => Promise<unknown>,
  ) {
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
    return operation(addressDecision.reservation, rawToken);
  }

  @HttpCode(200)
  @Post("request-retrieval")
  async requestRetrieval(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("GUEST_RETRIEVAL_REQUEST", request, async () => {
      parseEmptyBody(body);
      parseEmptyQuery(query);
      return guestSafeSessionResponseSchema.parse(
        await this.authorizeGuestOperation(
          request,
          authorization,
          (reservation, rawToken) =>
            this.service.requestGuestRetrieval(reservation, rawToken),
        ),
      );
    });
  }

  @HttpCode(200)
  @Post("cancel-retrieval")
  async cancelRetrieval(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("GUEST_RETRIEVAL_CANCEL", request, async () => {
      parseEmptyBody(body);
      parseEmptyQuery(query);
      return guestSafeSessionResponseSchema.parse(
        await this.authorizeGuestOperation(
          request,
          authorization,
          (reservation, rawToken) =>
            this.service.cancelGuestRetrieval(reservation, rawToken),
        ),
      );
    });
  }
}
