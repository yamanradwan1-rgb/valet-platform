import { Injectable } from "@nestjs/common";
import type { ApiRequest } from "../../common/http/api-request";
import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";
import { STAFF_PASSWORD_RESET_ANTI_ABUSE } from "../anti-abuse/anti-abuse-key";
import { TrustedClientAddressResolver } from "../anti-abuse/client-address";
import {
  Issue416ResetRateLimitedError,
  Issue416ResetUnavailableError,
} from "./issue416-password-reset-errors";

const countedRequests = new WeakMap<object, string>();
const countingRequests = new WeakSet<object>();
const attemptedRequests = new WeakSet<object>();
const ADDRESS_ATTEMPTS_PER_15_MINUTES =
  STAFF_PASSWORD_RESET_ANTI_ABUSE.redeemClientAddress.limit;

/**
 * Prime must install the call BEFORE its HTTP JSON parser for the exact public
 * redeem route. It durably counts even malformed JSON and parser-rejected
 * requests. A controller call cannot substitute for this pre-parser step.
 */
@Injectable()
export class Issue416PasswordResetIngress {
  constructor(
    private readonly antiAbuse: AntiAbuseService,
    private readonly addresses: TrustedClientAddressResolver,
  ) {}

  async countBeforeBodyParser(request: ApiRequest): Promise<void> {
    if (
      attemptedRequests.has(request) ||
      countedRequests.has(request) ||
      countingRequests.has(request)
    ) {
      throw new Issue416ResetUnavailableError();
    }
    // Even a failed or ambiguous count cannot be attempted again on this
    // request: a retry may duplicate a committed quota event.
    attemptedRequests.add(request);
    countingRequests.add(request);
    try {
      await this.countOnce(request);
    } finally {
      countingRequests.delete(request);
    }
  }

  private async countOnce(request: ApiRequest): Promise<void> {
    let address: string;
    try {
      address = this.addresses.resolve(request);
    } catch {
      throw new Issue416ResetUnavailableError();
    }
    let decision: Awaited<ReturnType<AntiAbuseService["count"]>>;
    try {
      decision = await this.antiAbuse.count(
        this.antiAbuse.key(
          "v1:staff-password-reset-redeem-client-address",
          address,
        ),
        ADDRESS_ATTEMPTS_PER_15_MINUTES,
      );
    } catch {
      throw new Issue416ResetUnavailableError();
    }
    if (!decision.allowed) {
      throw new Issue416ResetRateLimitedError(decision.retryAfter);
    }
    countedRequests.set(request, address);
  }

  /** Single-use, in-process attestation that the HTTP ingress budget committed. */
  takeCountedAddress(request: ApiRequest): string {
    const address = countedRequests.get(request);
    countedRequests.delete(request);
    if (address === undefined) throw new Issue416ResetUnavailableError();
    return address;
  }
}
