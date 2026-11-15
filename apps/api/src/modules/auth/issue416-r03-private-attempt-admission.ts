import { Injectable } from "@nestjs/common";
import type { ApiRequest } from "../../common/http/api-request";
import { Issue416ResetUnavailableError } from "./issue416-password-reset-errors";
import type { Issue416R03ClientAttemptReceipt } from "./issue416-r03-private-attempt-contract";

/**
 * Deliberately non-activating bridge. W17's 133/134 private ledger has no
 * reviewed ingress-only SQL binder, EXECUTE grant or attested HMAC key custody.
 * In particular a mutable public anti-abuse counter cannot satisfy either
 * R03 stage, and no existing SQL permission can stand in for this contract.
 *
 * A future reviewed implementation must use a server-owned UUID requestId,
 * a real trusted canonical client address BEFORE JSON parsing, and a separate
 * purpose-specific HMAC for each stage. The client stage must COMMIT first;
 * the credential stage must COMMIT independently before password validation
 * or business mutation. Unknown COMMIT is never retried.
 *
 * Not registered in AuthModule. Neither env flags nor an injectable writer
 * can change this fail-closed behavior.
 */
@Injectable()
export class Issue416R03PrivateAttemptAdmission {
  async countClientBeforeBodyParser(
    _request: ApiRequest,
  ): Promise<Issue416R03ClientAttemptReceipt> {
    void _request;
    throw new Issue416ResetUnavailableError();
  }

  async countCanonicalCredential(
    _committedClient: Issue416R03ClientAttemptReceipt,
    _canonicalTokenAppOnly: string,
  ): Promise<void> {
    void _committedClient;
    void _canonicalTokenAppOnly;
    throw new Issue416ResetUnavailableError();
  }
}
