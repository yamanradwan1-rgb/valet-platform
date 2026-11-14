import { Injectable } from "@nestjs/common";
import type { ApiRequest } from "../../common/http/api-request";
import { Issue416R03PrivateAttemptAdmission } from "./issue416-r03-private-attempt-admission";
import type { Issue416R03ClientAttemptReceipt } from "./issue416-r03-private-attempt-contract";
import { Issue416ResetUnavailableError } from "./issue416-password-reset-errors";

const countedRequests = new WeakMap<object, Issue416R03ClientAttemptReceipt>();
const countingRequests = new WeakSet<object>();
const attemptedRequests = new WeakSet<object>();

/**
 * Prime must install the call BEFORE its HTTP JSON parser for the exact public
 * redeem route. It must independently COMMIT the private CLIENT stage even
 * for malformed JSON; while the trusted R03 binder is missing it rejects
 * every request, without counting via mutable public anti_abuse_events.
 */
@Injectable()
export class Issue416PasswordResetIngress {
  constructor(private readonly r03: Issue416R03PrivateAttemptAdmission) {}

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
    try {
      const committed = await this.r03.countClientBeforeBodyParser(request);
      countedRequests.set(request, committed);
    } catch {
      throw new Issue416ResetUnavailableError();
    }
  }

  /** Single-use result; not authorization without a real committed R03 binder. */
  takeCountedClientAttempt(
    request: ApiRequest,
  ): Issue416R03ClientAttemptReceipt {
    const receipt = countedRequests.get(request);
    countedRequests.delete(request);
    if (receipt === undefined) throw new Issue416ResetUnavailableError();
    return receipt;
  }
}
