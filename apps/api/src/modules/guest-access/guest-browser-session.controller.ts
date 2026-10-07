import {
  Body,
  Controller,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { emptyRequestSchema } from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import { setNoStoreResponseHeaders } from "../../common/http/no-store-response";
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
import { GuestBrowserSessionService } from "./guest-browser-session.service";
import {
  clearBrowserContextCookie,
  clearPendingBrowserCookie,
} from "./guest-browser-context-transport";
import {
  GuestAuthOriginPolicy,
  browserCookie,
  clearBrowserCookie,
  clearEnrollmentCookie,
  enrollmentCookie,
  hasAuthorizationHeader,
  hasInvalidBrowserCookieTarget,
  readBrowserCookie,
  readExchangeCredentials,
  requireGuestBrowserMutationTransport,
} from "./guest-browser-transport";

interface CookieResponse {
  setHeader(name: string, value: string | readonly string[]): void;
}

function requireEmpty(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value ?? {}).success) {
    throw new ApiTransportValidationError();
  }
}

@Controller("v1/guest/browser-session")
export class GuestBrowserSessionController {
  constructor(
    private readonly sessions: GuestBrowserSessionService,
    private readonly runner: ApiOperationRunner,
    private readonly antiAbuse: AntiAbuseService,
    private readonly clientAddresses: TrustedClientAddressResolver,
    private readonly originPolicy: GuestAuthOriginPolicy,
  ) {}

  @Post("enroll")
  @HttpCode(204)
  async enroll(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "GUEST_BROWSER_SESSION_ENROLL",
      request,
      async () => {
        requireEmpty(body);
        requireEmpty(query);
        requireGuestBrowserMutationTransport(request, this.originPolicy);
        if (!this.sessions.enrollmentEnabled()) {
          throw new GuestAccessError("GUEST_ACCESS_INVALID");
        }
        const existingBrowser = readBrowserCookie(request);
        const hasAuthorization = hasAuthorizationHeader(request);
        const invalidBrowserCookie = hasInvalidBrowserCookieTarget(request);
        const result = await this.withLimiter(
          request,
          existingBrowser,
          async (transaction, reservation) => {
            if (hasAuthorization || invalidBrowserCookie) {
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "COUNTED",
              );
              return undefined;
            }
            if (
              existingBrowser !== undefined &&
              (await this.sessions.hasAuthorizedSessionInTransaction(
                transaction,
                existingBrowser,
              ))
            ) {
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "IGNORED",
              );
              return undefined;
            }
            const created =
              await this.sessions.enrollInTransaction(transaction);
            await this.antiAbuse.finalizeInTransaction(
              transaction,
              reservation,
              "COUNTED",
            );
            return created;
          },
        );
        if (result === undefined) {
          throw new GuestAccessError("GUEST_ACCESS_INVALID");
        }
        response.setHeader("Set-Cookie", [
          browserCookie(result.browserSecret),
          enrollmentCookie(result.enrollmentSecret),
        ]);
      },
    );
  }

  @Post("exchange")
  @HttpCode(204)
  async exchange(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "GUEST_BROWSER_SESSION_EXCHANGE",
      request,
      async () => {
        requireEmpty(body);
        requireEmpty(query);
        requireGuestBrowserMutationTransport(request, this.originPolicy);
        const credentials = readExchangeCredentials(request);
        const accepted = await this.withLimiter(
          request,
          credentials?.guestBearer,
          async (transaction, reservation) => {
            if (credentials === undefined) {
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "COUNTED",
              );
              return false;
            }
            try {
              await this.sessions.exchangeInTransaction(
                transaction,
                credentials.guestBearer,
                credentials.enrollmentSecret,
                credentials.browserSecret,
              );
            } catch (error) {
              if (!(error instanceof GuestAccessError)) throw error;
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "COUNTED",
              );
              return false;
            }
            await this.antiAbuse.finalizeInTransaction(
              transaction,
              reservation,
              "IGNORED",
            );
            return true;
          },
        );
        if (!accepted) throw new GuestAccessError("GUEST_ACCESS_INVALID");
        response.setHeader("Set-Cookie", clearEnrollmentCookie());
      },
    );
  }

  @Post("end")
  @HttpCode(204)
  async end(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    setNoStoreResponseHeaders(response);
    return this.runner.run("GUEST_BROWSER_SESSION_END", request, async () => {
      requireEmpty(body);
      requireEmpty(query);
      requireGuestBrowserMutationTransport(request, this.originPolicy);
      const browserSecret = readBrowserCookie(request);
      const ended = await this.withLimiter(
        request,
        browserSecret,
        async (transaction, reservation) => {
          if (browserSecret === undefined) {
            await this.antiAbuse.finalizeInTransaction(
              transaction,
              reservation,
              "COUNTED",
            );
            return false;
          }
          const result = await this.sessions.endInTransaction(
            transaction,
            browserSecret,
          );
          await this.antiAbuse.finalizeInTransaction(
            transaction,
            reservation,
            result ? "IGNORED" : "COUNTED",
          );
          return result;
        },
      );
      if (!ended) {
        throw new GuestAccessError("GUEST_ACCESS_INVALID");
      }
      response.setHeader("Set-Cookie", [
        clearBrowserCookie(),
        clearBrowserContextCookie(),
        clearEnrollmentCookie(),
        clearPendingBrowserCookie(),
      ]);
    });
  }

  private async withLimiter<T>(
    request: ApiRequest,
    credentialSecret: string | undefined,
    operation: (
      transaction: Parameters<AntiAbuseService["transaction"]>[0] extends (
        transaction: infer P,
      ) => Promise<unknown>
        ? P
        : never,
      reservation: AntiAbuseReservation,
    ) => Promise<T>,
  ): Promise<T> {
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
    const tokenKey =
      credentialSecret === undefined
        ? undefined
        : this.antiAbuse.key("v1:guest-token", credentialSecret);
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
    return this.antiAbuse.transaction((transaction) =>
      operation(transaction, addressDecision.reservation),
    );
  }
}
