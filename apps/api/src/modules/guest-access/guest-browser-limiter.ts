import { Injectable } from "@nestjs/common";

import type { ApiRequest } from "../../common/http/api-request";
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

type LimiterTransaction = Parameters<AntiAbuseService["transaction"]>[0] extends (
  transaction: infer P,
) => Promise<unknown>
  ? P
  : never;

@Injectable()
export class GuestBrowserLimiter {
  constructor(
    private readonly antiAbuse: AntiAbuseService,
    private readonly clientAddresses: TrustedClientAddressResolver,
  ) {}

  async run<T>(
    request: ApiRequest,
    credentialSecret: string | undefined,
    operation: (
      transaction: LimiterTransaction,
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
