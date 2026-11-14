import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  staffPasswordResetRedeemRequestSchema,
  staffPasswordResetRedeemResponseSchema,
  staffPasswordResetTokenSchema,
  type StaffPasswordResetRedeemResponse,
} from "@valet/contracts";
import type { ApiRequest } from "../../common/http/api-request";
import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";
import { STAFF_PASSWORD_RESET_ANTI_ABUSE } from "../anti-abuse/anti-abuse-key";
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
  Issue416ResetRateLimitedError,
  Issue416ResetUnavailableError,
} from "./issue416-password-reset-errors";
import { Issue416PasswordResetIngress } from "./issue416-password-reset-redeem-ingress";
import {
  ISSUE416_REDEEM_TRUSTED_BOUNDARY,
  type Issue416RedeemTrustedBoundary,
} from "./issue416-password-reset-redeem-boundary";
import { requireIssue416VerifiedSqlAuthority } from "./issue416-password-reset-sql-readiness";

const CREDENTIAL_ATTEMPTS_PER_15_MINUTES =
  STAFF_PASSWORD_RESET_ANTI_ABUSE.redeemCredential.limit;

@Injectable()
export class Issue416PasswordResetRedeemService {
  constructor(
    private readonly ingress: Issue416PasswordResetIngress,
    private readonly origins: StaffAuthOriginPolicy,
    private readonly antiAbuse: AntiAbuseService,
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
    const trustedClientAddress = this.ingress.takeCountedAddress(request);
    if (!this.origins.allows(origin)) throw new StaffAuthOriginError();
    requireAuthJson(contentType);
    requireEmptyAuthQuery(query);

    // Credential budget is independent of business success and also counts
    // canonical bearers paired with invalid passwords or extraneous fields.
    const supplied =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).resetToken
        : undefined;
    if (!staffPasswordResetTokenSchema.safeParse(supplied).success) {
      throw new Issue416ResetInvalidError();
    }
    if (typeof supplied === "string") {
      let decision: Awaited<ReturnType<AntiAbuseService["count"]>>;
      try {
        decision = await this.antiAbuse.count(
          this.antiAbuse.key(
            "v1:staff-password-reset-redeem-credential",
            supplied as string,
          ),
          CREDENTIAL_ATTEMPTS_PER_15_MINUTES,
        );
      } catch {
        throw new Issue416ResetUnavailableError();
      }
      if (!decision.allowed) {
        throw new Issue416ResetRateLimitedError(decision.retryAfter);
      }
    }
    const command = parseAuthBody(staffPasswordResetRedeemRequestSchema, body);
    requireIssue416VerifiedSqlAuthority("REDEEM");
    if (this.boundary === undefined) throw new Issue416ResetUnavailableError();
    const newPasswordHash = await hashStaffPassword(command.newPassword);
    const committed = await this.boundary.redeem({
      presentedBearerAppOnly: command.resetToken,
      trustedClientAddress,
      tokenHash: staffPasswordResetTokenHash(command.resetToken),
      newPasswordHash,
    });
    // No Staff session is issued; an ambiguous COMMIT must never be retried
    // automatically with a changed password or new reset generation.
    return staffPasswordResetRedeemResponseSchema.parse(committed);
  }
}
