// Pure opt-in gate. It performs no Docker, PostgreSQL or Prisma work.
// An environment flag is NOT itself owner approval: require written clearance.
export const EXPLICIT_RELEASE =
  "OWNER_RELEASED_AFTER_MIGRATION113_RECOVERY_AND_W9_REATTESTATION";

const ALLOWED_URL_ROLES = Object.freeze([
  "MIGRATION_DATABASE_URL", "DATABASE_URL",
]);

// Validate the SELECTED connection role itself, not merely the other W9 URLs.
// This must happen before looking up process.env[urlKey] or doing preflight.
export function assertQuotaUrlRole(urlKey) {
  if (!ALLOWED_URL_ROLES.includes(urlKey)) {
    throw new Error("R02_PG17_URL_ROLE_DENIED");
  }
  return urlKey;
}

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

// W9's existing global setup owns an unannotated exclusive lease directory.
// Its contents cannot prove that the caller owns the lease; checking whether
// the directory merely exists would accept another process's lease. Until an
// independently reviewable per-connection lease-owner capability exists,
// there is NO SAFE PG17 RELEASE, even with the textual Owner release flag.
export function assertQuotaLeaseOwned() {
  throw new Error("R02_PG17_LEASE_OWNER_NOT_ATTESTED: NO SAFE PG17 RELEASE");
}
