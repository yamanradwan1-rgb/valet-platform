import type {
  StaffPasswordResetIssueRequest,
  StaffPasswordResetStatusResponse,
} from "@valet/contracts";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { Issue416ResetUnavailableError } from "../auth/issue416-password-reset-errors";

export const ISSUE416_PROTECTED_RESET_SQL_BOUNDARY = Symbol(
  "ISSUE416_PROTECTED_RESET_SQL_BOUNDARY",
);

export { Issue416ResetUnavailableError };

export interface ProtectedResetCaller {
  /** Actual Bearer header, to be verified by an independent trusted ceremony. */
  readonly authorization: string;
  /** For preflight only; a DB-readable context/hash is not bearer possession. */
  readonly context: StaffSessionContext;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly targetUserId: string;
}

export interface ResetIssueBoundaryInput extends ProtectedResetCaller {
  readonly command: StaffPasswordResetIssueRequest;
  readonly tokenHash: string;
  readonly trustedClientAddress: string;
}

export interface CommittedResetIssue {
  readonly outcome: "LINK_ISSUED" | "LINK_UNAVAILABLE";
  readonly membershipId: string;
  readonly generation: number;
  readonly expiresAt: string;
}

/**
 * NOT IMPLEMENTED OR REGISTERED. Only an independently reviewed, purpose-bound
 * SQL boundary may implement this interface. Its own transaction must prove
 * current issuer/target/sole membership, entitlement, exact-session five-minute
 * MFA, replay-before-CAS and all four R02 quota keys; commit reset and audit
 * atomically. A preflight result is never a grant or a signing capability.
 */
export interface Issue416ProtectedResetSqlBoundary {
  status(
    caller: ProtectedResetCaller,
  ): Promise<StaffPasswordResetStatusResponse>;
  issue(input: ResetIssueBoundaryInput): Promise<CommittedResetIssue>;
}
