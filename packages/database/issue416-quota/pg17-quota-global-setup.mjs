import {
  assertPg17QuotaRelease, assertQuotaLeaseOwned,
} from "./pg17-quota-release.mjs";

// Explicitly blocked: there is no independent W9 lease-owner attestation for
// the quota project. Never create a lease or attempt Docker/PG preflight.
export default async function quotaSetup() {
  assertPg17QuotaRelease();
  assertQuotaLeaseOwned(); // Always fail-closed, including with release flag.
}
