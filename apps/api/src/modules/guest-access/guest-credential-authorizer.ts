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
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import {
  GuestAuthOriginPolicy,
  readGuestCredential,
  requireGuestBrowserMutationTransport,
} from "./guest-browser-transport";
import type { GuestCredential } from "./guest-credential";

@Injectable()
export class GuestCredentialAuthorizer {
  constructor(
    private readonly antiAbuse: AntiAbuseService,
    private readonly clientAddresses: TrustedClientAddressResolver,
    private readonly originPolicy: GuestAuthOriginPolicy,
  ) {}

  async authorize<T>(
    request: ApiRequest,
    options: { readonly mutation: boolean },
    operation: (
      reservation: AntiAbuseReservation,
      credential: GuestCredential,
    ) => Promise<T>,
  ): Promise<T> {
    const credential = readGuestCredential(request);
    if (credential?.kind === "BROWSER_SESSION" && options.mutation) {
      requireGuestBrowserMutationTransport(request, this.originPolicy);
    }

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
      credential === undefined
        ? undefined
        : this.antiAbuse.key("v1:guest-token", credential.secret);
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
    if (credential === undefined) {
      await this.antiAbuse.finalize(addressDecision.reservation, "COUNTED");
      throw new GuestAccessError("GUEST_ACCESS_INVALID");
    }
    return operation(addressDecision.reservation, credential);
  }
}
