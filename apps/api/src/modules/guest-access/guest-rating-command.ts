import type { GuestRatingScopedFeedbackRequest } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import type { LockedGuestAccessSessionScope } from "../valet-sessions/guest-access-session-resolution";
import {
  normalizeGuestCredential,
  type GuestCredentialInput,
} from "./guest-credential";

export type GuestRatingErrorCode =
  "GUEST_RATING_CONFLICT" | "GUEST_RATING_NOT_AVAILABLE";

export class GuestRatingError extends Error {
  constructor(readonly code: GuestRatingErrorCode) {
    super(
      code === "GUEST_RATING_CONFLICT"
        ? "A different rating is already recorded for this visit."
        : "Guest rating is available only after the visit is completed.",
    );
    this.name = "GuestRatingError";
  }
}

type ScopedFeedback = Pick<
  GuestRatingScopedFeedbackRequest, "expectedValetSessionId" | "comment"
>;

interface GuestRatingCommandRow {
  readonly rated_at: Date | null;
  readonly rating: number | null;
  readonly result_code: string;
  readonly valet_session_id: string | null;
}

export interface GuestRatingCommandResult {
  readonly ratedAt: Date;
  readonly rating: number;
  readonly valetSessionId: string;
}

function assertCompletedVisit(session: LockedGuestAccessSessionScope): void {
  if (session.state !== "COMPLETED" || session.completedAt === null) {
    throw new GuestRatingError("GUEST_RATING_NOT_AVAILABLE");
  }
}

function readGuestRatingResult(
  row: GuestRatingCommandRow | undefined,
  session: LockedGuestAccessSessionScope,
  expectedRating: number,
): GuestRatingCommandResult {
  if (row?.result_code === "INVALID_ACCESS") {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  if (row?.result_code === "CONFLICT") {
    throw new GuestRatingError("GUEST_RATING_CONFLICT");
  }
  if (row?.result_code === "NOT_COMPLETED") {
    throw new GuestRatingError("GUEST_RATING_NOT_AVAILABLE");
  }
  if (row?.result_code === "REQUEST_INVALID" ||
      row?.result_code === "FEEDBACK_UNAVAILABLE") {
    // Missing/revoked notice is a definite failure, not an incomplete visit.
    // Preserve the existing 400/failed Guest UI status without reflecting text.
    throw new ApiTransportValidationError();
  }
  if (
    row?.result_code !== "OK" ||
    row.valet_session_id === null ||
    row.rating !== expectedRating ||
    !(row.rated_at instanceof Date) ||
    !Number.isFinite(row.rated_at.getTime()) ||
    row.valet_session_id.toLowerCase() !== session.valetSessionId.toLowerCase()
  ) {
    throw new Error("Guest rating command failed closed.");
  }
  return {
    ratedAt: row.rated_at,
    rating: row.rating,
    valetSessionId: row.valet_session_id,
  };
}

export async function submitGuestRating(
  transaction: PostgresTransaction,
  credentialInput: GuestCredentialInput,
  session: LockedGuestAccessSessionScope,
  rating: number,
  scoped?: ScopedFeedback,
): Promise<GuestRatingCommandResult> {
  if (
    scoped !== undefined &&
    scoped.expectedValetSessionId.toLowerCase() !==
      session.valetSessionId.toLowerCase()
  ) {
    // Credential-derived row was already locked; the client UUID is not authority.
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  assertCompletedVisit(session);
  const credential = normalizeGuestCredential(credentialInput);
  const writer = credential.kind === "BROWSER_SESSION"
    ? "guest_browser_rating_submit"
    : "guest_rating_submit";
  const sql = "SELECT result_code, valet_session_id::text, rating, rated_at FROM public." +
    writer + (scoped === undefined ? "($1, $2)" : "($1, $2, $3, $4)");
  const params = scoped === undefined
    ? [credential.secret, rating]
    : [credential.secret, rating, scoped.comment ?? null, scoped.expectedValetSessionId];
  const result = await transaction.query<GuestRatingCommandRow>(sql, params);
  return readGuestRatingResult(result.rows[0], session, rating);
}
