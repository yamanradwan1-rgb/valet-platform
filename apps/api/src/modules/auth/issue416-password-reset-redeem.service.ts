import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  staffPasswordResetRedeemRequestSchema,
  staffPasswordResetRedeemResponseSchema,
  type StaffPasswordResetRedeemResponse,
} from "@valet/contracts";
import type { ApiRequest } from "../../common/http/api-request";
import { StaffAuthOriginError } from "./staff-auth.controller";
import { StaffAuthOriginPolicy } from "./staff-auth.origin";
import {
  parseAuthBody,
  requireAuthJson,
  requireEmptyAuthQuery,
} from "./staff-auth.transport";
import { hashStaffPassword } from "./staff-password-hashing";
import { staffPasswordResetTokenHash } from "./staff-password-reset-credential";
import {
  Issue416ResetInvalidError,
  Issue416ResetUnavailableError,
} from "./issue416-password-reset-errors";
import { Issue416PasswordResetIngress } from "./issue416-password-reset-redeem-ingress";
import {
  ISSUE416_REDEEM_TRUSTED_BOUNDARY,
  type Issue416RedeemTrustedBoundary,
} from "./issue416-password-reset-redeem-boundary";
import { requireIssue416VerifiedSqlAuthority } from "./issue416-password-reset-sql-readiness";
import { Issue416R03PrivateAttemptAdmission } from "./issue416-r03-private-attempt-admission";
import { issue416CanonicalR03Credential } from "./issue416-r03-private-attempt-contract";

@Injectable()
export class Issue416PasswordResetRedeemService {
  constructor(
    private readonly ingress: Issue416PasswordResetIngress,
    private readonly origins: StaffAuthOriginPolicy,
    private readonly r03: Issue416R03PrivateAttemptAdmission,
    @Optional()
    @Inject(ISSUE416_REDEEM_TRUSTED_BOUNDARY)
    private readonly boundary?: Issue416RedeemTrustedBoundary,
  ) {}

  async redeem(
    request: ApiRequest,
    origin: string | undefined,
    contentType: string | undefined,
    query: unknown,
    body: unknown,
  ): Promise<StaffPasswordResetRedeemResponse> {
    const committedClient = this.ingress.takeCountedClientAttempt(request);
    // A canonical bearer spends its own budget even when the request has an
    // invalid Origin, Content-Type, query or password. The earlier client
    // stage has already committed independently before body parsing.
    const canonicalToken = issue416CanonicalR03Credential(body);
    if (canonicalToken !== null) {
      await this.r03.countCanonicalCredential(committedClient, canonicalToken);
    }
    if (!this.origins.allows(origin)) throw new StaffAuthOriginError();
    requireAuthJson(contentType);
    requireEmptyAuthQuery(query);
    if (canonicalToken === null) {
      throw new Issue416ResetInvalidError();
    }
    const command = parseAuthBody(staffPasswordResetRedeemRequestSchema, body);
    requireIssue416VerifiedSqlAuthority("REDEEM");
    if (this.boundary === undefined) throw new Issue416ResetUnavailableError();
    const newPasswordHash = await hashStaffPassword(command.newPassword);
    const committed = await this.boundary.redeem({
      presentedBearerAppOnly: command.resetToken,
      trustedClientAddress: committedClient.trustedClientAddressAppOnly,
      tokenHash: staffPasswordResetTokenHash(command.resetToken),
      newPasswordHash,
    });
    // No Staff session is issued; an ambiguous COMMIT must never be retried
    // automatically with a changed password or new reset generation.
    return staffPasswordResetRedeemResponseSchema.parse(committed);
  }
}
