import type { PostgresTransaction } from "../../common/database/postgres";
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

export async function submitGuestRating(
  transaction: PostgresTransaction,
  credentialInput: GuestCredentialInput,
  session: LockedGuestAccessSessionScope,
  rating: number,
): Promise<GuestRatingCommandResult> {
  assertCompletedVisit(session);
  const credential = normalizeGuestCredential(credentialInput);
  const result = await transaction.query<GuestRatingCommandRow>(
    `SELECT result_code, valet_session_id::text, rating, rated_at
     FROM ${
       credential.kind === "BROWSER_SESSION"
         ? "guest_browser_rating_submit($1, $2)"
         : "guest_rating_submit($1, $2)"
     }`,
    [credential.secret, rating],
  );
  const row = result.rows[0];
  if (row?.result_code === "INVALID_ACCESS") {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  if (row?.result_code === "CONFLICT") {
    throw new GuestRatingError("GUEST_RATING_CONFLICT");
  }
  if (row?.result_code === "NOT_COMPLETED") {
    throw new GuestRatingError("GUEST_RATING_NOT_AVAILABLE");
  }
  if (
    row?.result_code !== "OK" ||
    row.valet_session_id === null ||
    row.rating === null ||
    row.rated_at === null
  ) {
    throw new Error("Guest rating command failed closed.");
  }
  return {
    ratedAt: row.rated_at,
    rating: row.rating,
    valetSessionId: row.valet_session_id,
  };
}
