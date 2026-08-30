import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { webPushSubscriptionResponseSchema } from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
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
import {
  parseGuestToken,
  parseStaffAuthorization,
  parseSubscriptionBody,
  parseSubscriptionId,
  requireEmpty,
  requireGuestToken,
} from "./web-push-subscription-http";
import { WebPushSubscriptionService } from "./web-push-subscription.service";

@Controller("v1/staff/web-push/subscriptions")
export class StaffWebPushSubscriptionController {
  constructor(
    private readonly service: WebPushSubscriptionService,
    private readonly runner: ApiOperationRunner,
  ) {}

  @Post()
  @HttpCode(200)
  subscribe(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WEB_PUSH_STAFF_SUBSCRIBE", request, async () => {
      requireEmpty(query);
      return webPushSubscriptionResponseSchema.parse(
        await this.service.staffSubscribe(
          parseStaffAuthorization(request, authorization),
          parseSubscriptionBody(contentType, body),
        ),
      );
    });
  }

  @Put(":subscriptionId")
  @HttpCode(200)
  replace(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("subscriptionId") subscriptionId: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WEB_PUSH_STAFF_REPLACE", request, async () => {
      requireEmpty(query);
      return webPushSubscriptionResponseSchema.parse(
        await this.service.staffReplace(
          parseStaffAuthorization(request, authorization),
          parseSubscriptionId(subscriptionId),
          parseSubscriptionBody(contentType, body),
        ),
      );
    });
  }

  @Delete(":subscriptionId")
  @HttpCode(200)
  unsubscribe(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("subscriptionId") subscriptionId: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WEB_PUSH_STAFF_UNSUBSCRIBE", request, async () => {
      requireEmpty(body);
      requireEmpty(query);
      return webPushSubscriptionResponseSchema.parse(
        await this.service.staffUnsubscribe(
          parseStaffAuthorization(request, authorization),
          parseSubscriptionId(subscriptionId),
        ),
      );
    });
  }
}

@Controller("v1/guest/web-push/subscriptions")
export class GuestWebPushSubscriptionController {
  constructor(
    private readonly service: WebPushSubscriptionService,
    private readonly runner: ApiOperationRunner,
    private readonly antiAbuse: AntiAbuseService,
    private readonly clientAddresses: TrustedClientAddressResolver,
  ) {}

  private async authorize<T>(
    request: ApiRequest,
    authorization: string | undefined,
    operation: (
      reservation: AntiAbuseReservation,
      rawToken: string,
    ) => Promise<T>,
  ): Promise<T> {
    let address: string;
    try {
      address = this.clientAddresses.resolve(request);
    } catch (error) {
      if (error instanceof ClientAddressUnavailableError) {
        throw new AntiAbuseUnavailableError();
      }
      throw error;
    }
    const addressKey = this.antiAbuse.key("v1:guest-client-address", address);
    const rawToken = parseGuestToken(request, authorization);
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
    }
    return operation(addressDecision.reservation, requireGuestToken(rawToken));
  }

  @Post()
  @HttpCode(200)
  subscribe(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WEB_PUSH_GUEST_SUBSCRIBE", request, async () => {
      requireEmpty(query);
      const input = parseSubscriptionBody(contentType, body);
      return webPushSubscriptionResponseSchema.parse(
        await this.authorize(request, authorization, (reservation, token) =>
          this.service.guestSubscribe(reservation, token, input),
        ),
      );
    });
  }

  @Put(":subscriptionId")
  @HttpCode(200)
  replace(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("subscriptionId") subscriptionId: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WEB_PUSH_GUEST_REPLACE", request, async () => {
      requireEmpty(query);
      const id = parseSubscriptionId(subscriptionId);
      const input = parseSubscriptionBody(contentType, body);
      return webPushSubscriptionResponseSchema.parse(
        await this.authorize(request, authorization, (reservation, token) =>
          this.service.guestReplace(reservation, token, id, input),
        ),
      );
    });
  }

  @Delete(":subscriptionId")
  @HttpCode(200)
  unsubscribe(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("subscriptionId") subscriptionId: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("WEB_PUSH_GUEST_UNSUBSCRIBE", request, async () => {
      requireEmpty(body);
      requireEmpty(query);
      const id = parseSubscriptionId(subscriptionId);
      return webPushSubscriptionResponseSchema.parse(
        await this.authorize(request, authorization, (reservation, token) =>
          this.service.guestUnsubscribe(reservation, token, id),
        ),
      );
    });
  }
}
