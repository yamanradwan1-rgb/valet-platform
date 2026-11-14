import { assertPg17QuotaRelease } from "./pg17-quota-release.mjs";
import w9GlobalSetup from "../issue416-private/global-setup.mjs";

// Invoked only by the explicit quota PG17 Vitest project; NEVER auto-migrate.
export default async function quotaSetup() {
  assertPg17QuotaRelease(); // Before even W9's Docker/SQL preflight.
  return w9GlobalSetup(); // Existing W9 attestation + exclusive lease.
}
