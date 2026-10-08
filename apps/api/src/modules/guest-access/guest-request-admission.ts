import { Injectable } from "@nestjs/common";

import type { ApiRequest } from "../../common/http/api-request";
import type { PostgresTransaction } from "../../common/database/postgres";
import {
  AntiAbuseRateLimitError,
  AntiAbuseService,
  AntiAbuseUnavailableError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { countClassifiedGuest } from "../anti-abuse/classified-guest-counter";
import { TrustedClientAddressResolver } from "../anti-abuse/client-address";
import { GuestAccessService } from "./guest-access.service";
import type { GuestCredential } from "./guest-credential";
import {
  guestRequestPolicy,
  guestRatePolicyMode,
  type GuestRequestClass,
} from "./guest-request-policy";

@Injectable()
export class GuestRequestAdmission {
  private readonly rateMode = guestRatePolicyMode();
  constructor(
    private readonly antiAbuse: AntiAbuseService,
    private readonly addresses: TrustedClientAddressResolver,
    private readonly access: GuestAccessService,
  ) {}

  private addressKey(request: ApiRequest) {
    try {
      return this.antiAbuse.key(
        "v1:guest-client-address",
        this.addresses.resolve(request),
      );
    } catch {
      throw new AntiAbuseUnavailableError();
    }
  }

  async authenticatedInTransaction(
    transaction: PostgresTransaction,
    request: ApiRequest,
    credential: GuestCredential,
    requestClass: GuestRequestClass,
  ) {
    const addressKey = this.addressKey(request);
    // Internal probe only: no data/authority leaves this transaction before accounting commits.
    const resolved = await this.access.resolveCredentialInTransaction(
      transaction,
      credential,
    );
    if (resolved === undefined) return undefined;
    const key = this.antiAbuse.key("v1:guest-token", credential.secret);
    const group = this.antiAbuse.key(
      "v1:guest-token",
      `visit:${resolved.session.valetSessionId}`,
    );
    const decision = await countClassifiedGuest(
      transaction,
      key,
      requestClass,
      guestRequestPolicy.classes[requestClass],
      guestRequestPolicy.aggregate,
      group,
      this.rateMode === "COMPATIBILITY" ? 180 : 864,
    );
    if (decision.retryAfter !== 0) {
      throw new AntiAbuseRateLimitError(
        "GUEST_ACCESS_RATE_LIMITED",
        decision.retryAfter,
      );
    }
    return {
      resolved,
      reservation: {
        key,
        authenticatedAddressKey: addressKey,
      } satisfies AntiAbuseReservation,
    };
  }

  async admit(
    request: ApiRequest,
    credential: GuestCredential | undefined,
    requestClass: GuestRequestClass,
    alternate?: GuestCredential,
  ): Promise<AntiAbuseReservation> {
    if (credential !== undefined) {
      const authenticated = await this.antiAbuse.transaction(
        async (transaction) =>
          (await this.authenticatedInTransaction(
            transaction,
            request,
            credential,
            requestClass,
          )) ??
          (alternate === undefined
            ? undefined
            : await this.authenticatedInTransaction(
                transaction,
                request,
                alternate,
                requestClass,
              )),
      );
      if (authenticated !== undefined) return authenticated.reservation;
    }
    return this.unknown(request, credential?.secret);
  }

  async unknown(
    request: ApiRequest,
    secret?: string,
  ): Promise<AntiAbuseReservation> {
    const addressKey = this.addressKey(request);
    const tokenKey =
      secret === undefined
        ? undefined
        : this.antiAbuse.key("v1:guest-token", secret);
    const address = await this.antiAbuse.reserve(
      addressKey,
      guestRequestPolicy.sourceFailures,
    );
    if (!address.allowed) {
      const tokenRetry =
        tokenKey === undefined
          ? undefined
          : await this.antiAbuse.blocker(
              tokenKey,
              guestRequestPolicy.unknownCredential,
            );
      throw new AntiAbuseRateLimitError(
        "GUEST_ACCESS_RATE_LIMITED",
        Math.max(address.retryAfter, tokenRetry ?? 0),
      );
    }
    if (tokenKey !== undefined) {
      const counted = await this.antiAbuse.count(
        tokenKey,
        guestRequestPolicy.unknownCredential,
      );
      if (!counted.allowed) {
        await this.antiAbuse.finalize(address.reservation, "IGNORED");
        throw new AntiAbuseRateLimitError(
          "GUEST_ACCESS_RATE_LIMITED",
          counted.retryAfter,
        );
      }
    }
    return address.reservation;
  }

  async allocation(
    request: ApiRequest,
    credential?: GuestCredential,
  ): Promise<AntiAbuseReservation> {
    if (credential !== undefined) {
      const authorized = await this.antiAbuse.transaction((transaction) =>
        this.authenticatedInTransaction(transaction, request, credential, "B"),
      );
      if (authorized !== undefined) return authorized.reservation;
    }
    const failures = this.addressKey(request);
    const source = this.addresses.resolve(request);
    const key = this.antiAbuse.key("v1:guest-enrollment-address", source);
    return this.antiAbuse.transaction(async (transaction) => {
      const blocker = await this.antiAbuse.blockerInTransaction(
        transaction,
        failures,
        60,
      );
      if (blocker !== undefined)
        throw new AntiAbuseRateLimitError("GUEST_ACCESS_RATE_LIMITED", blocker);
      const decision = await this.antiAbuse.countInTransaction(
        transaction,
        key,
        guestRequestPolicy.enrollmentAllocations,
      );
      if (!decision.allowed)
        throw new AntiAbuseRateLimitError(
          "GUEST_ACCESS_RATE_LIMITED",
          decision.retryAfter,
        );
      return { key, authenticatedAddressKey: failures };
    });
  }
}
