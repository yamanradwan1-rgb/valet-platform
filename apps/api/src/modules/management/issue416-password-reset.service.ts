import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  staffPasswordResetIssueResponseSchema,
  staffPasswordResetStatusResponseSchema,
  type StaffPasswordResetIssueRequest,
  type StaffPasswordResetIssueResponse,
  type StaffPasswordResetStatusResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { ApiRequest } from "../../common/http/api-request";
import { TrustedClientAddressResolver } from "../anti-abuse/client-address";
import {
  generateStaffPasswordResetToken,
  staffPasswordResetTokenHash,
} from "../auth/staff-password-reset-credential";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  ISSUE416_PROTECTED_RESET_SQL_BOUNDARY,
  Issue416ResetUnavailableError,
  type Issue416ProtectedResetSqlBoundary,
} from "./issue416-password-reset-boundary";
import { resolveIssue416ResetCaller } from "./issue416-password-reset-caller";
import { issue416PasswordResetLink } from "./issue416-password-reset-link";
import { requireIssue416VerifiedSqlAuthority } from "../auth/issue416-password-reset-sql-readiness";

@Injectable()
export class Issue416PasswordResetService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
    private readonly addresses: TrustedClientAddressResolver,
    @Optional()
    @Inject(ISSUE416_PROTECTED_RESET_SQL_BOUNDARY)
    private readonly boundary?: Issue416ProtectedResetSqlBoundary,
  ) {}

  async status(
    authorization: string | undefined,
    organizationId: string,
    membershipId: string,
  ): Promise<StaffPasswordResetStatusResponse> {
    requireIssue416VerifiedSqlAuthority("STATUS");
    if (this.boundary === undefined) throw new Issue416ResetUnavailableError();
    const caller = await resolveIssue416ResetCaller(
      this.pool,
      this.sessions,
      authorization,
      organizationId,
      membershipId,
    );
    return staffPasswordResetStatusResponseSchema.parse(
      await this.boundary.status(caller),
    );
  }

  async issue(
    authorization: string | undefined,
    organizationId: string,
    membershipId: string,
    command: StaffPasswordResetIssueRequest,
    request: ApiRequest,
  ): Promise<StaffPasswordResetIssueResponse> {
    requireIssue416VerifiedSqlAuthority("ISSUE");
    if (this.boundary === undefined) throw new Issue416ResetUnavailableError();
    const caller = await resolveIssue416ResetCaller(
      this.pool,
      this.sessions,
      authorization,
      organizationId,
      membershipId,
    );
    let trustedClientAddress: string;
    try {
      trustedClientAddress = this.addresses.resolve(request);
    } catch {
      throw new Issue416ResetUnavailableError();
    }
    const token = generateStaffPasswordResetToken();
    const resetLink = issue416PasswordResetLink(token);
    const committed = await this.boundary.issue({
      ...caller,
      command,
      trustedClientAddress,
      tokenHash: staffPasswordResetTokenHash(token),
    });
    // The boundary returns only AFTER a known successful COMMIT. Unknown COMMIT
    // must throw and cannot disclose the new link or start an automatic reissue.
    if (committed.membershipId !== membershipId) {
      throw new Issue416ResetUnavailableError();
    }
    return staffPasswordResetIssueResponseSchema.parse(
      committed.outcome === "LINK_ISSUED"
        ? { ...committed, resetLink }
        : { ...committed },
    );
  }
}
