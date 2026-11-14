// Pure opt-in gate. It performs no Docker, PostgreSQL or Prisma work.
// An environment flag is NOT itself owner approval: require written clearance.
export const EXPLICIT_RELEASE =
  "OWNER_RELEASED_AFTER_MIGRATION113_RECOVERY_AND_W9_REATTESTATION";

export function assertPg17QuotaRelease(env = process.env) {
  if (env.ISSUE416_R02_PG17_RELEASE !== EXPLICIT_RELEASE) {
    throw new Error(
      "Issue416 R02 PG17 NOT RUN: explicit Owner migration113 recovery " +
      "clearance and W9 re-attestation are required before any connection.",
    );
  }
  if (env.NODE_ENV === "production" || env.CI || env.GITHUB_ACTIONS) {
    throw new Error("Issue416 R02 PG17 refused in production or CI.");
  }
}
