import type { AntiAbuseKey, AntiAbuseScope } from "./anti-abuse-key";

const AUDIENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_HASH = /^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$/;
const SCOPE = "v1:staff-login-identifier" as const;
const PURPOSE = "STAFF_LOGIN_COMMIT" as const;

type ReservationBlock =
  | "INVALID_CONTEXT"
  | "CROSS_AUDIENCE"
  | "CROSS_OPERATION"
  | "FOREIGN_PURPOSE"
  | "FOREIGN_SCOPE"
  | "WRONG_KEY"
  | "INVALID_RESERVATION_STATE"
  | "TRUSTED_PRE_DOMAIN_BINDER_MISSING";

/** A diagnostic only. No branch can grant admission or perform a DB write. */
export type A01ReservationInspection = Readonly<{
  admissible: false;
  blocker: ReservationBlock;
}>;

/** These are untrusted readback fields, NOT proof of a committed reservation. */
export interface A01UntrustedReservationRow {
  readonly reservationId: string;
  readonly audience: string;
  readonly operationId: string;
  readonly purpose: string;
  readonly scope: string;
  readonly keyHash: string;
  readonly state: string;
}

interface A01KeyDeriver {
  key(scope: AntiAbuseScope, identifier: string): AntiAbuseKey;
}

/** Future authoritative SQL must separately prove this row was committed on
 * an earlier lease, under the five-attempt HMAC-key advisory-lock threshold.
 * A UUID, SQL-readable hash, client-provided row or successful lookup alone
 * never upgrades this untrusted diagnostic to an admission capability.
 */
export function inspectUntrustedA01Reservation(
  deriver: A01KeyDeriver,
  context: Readonly<{
    deploymentAudience: string;
    operationId: string;
    canonicalIdentifier: string;
  }>,
  row: A01UntrustedReservationRow | undefined,
): A01ReservationInspection {
  if (
    !AUDIENCE.test(context.deploymentAudience) ||
    !UUID.test(context.operationId) ||
    context.canonicalIdentifier.length < 3 ||
    context.canonicalIdentifier !==
      context.canonicalIdentifier.trim().toLowerCase() ||
    !row ||
    !UUID.test(row.reservationId)
  ) {
    return { admissible: false, blocker: "INVALID_CONTEXT" };
  }
  if (row.audience !== context.deploymentAudience) {
    return { admissible: false, blocker: "CROSS_AUDIENCE" };
  }
  if (row.operationId !== context.operationId) {
    return { admissible: false, blocker: "CROSS_OPERATION" };
  }
  if (row.purpose !== PURPOSE) {
    return { admissible: false, blocker: "FOREIGN_PURPOSE" };
  }
  if (row.scope !== SCOPE) {
    return { admissible: false, blocker: "FOREIGN_SCOPE" };
  }
  // Derived by the existing secret-backed AntiAbuseKeyDeriver in real calls.
  // A test/fake deriver may forge this value, so even equality is not authority.
  let expected: AntiAbuseKey;
  try {
    expected = deriver.key(SCOPE, context.canonicalIdentifier);
  } catch {
    return { admissible: false, blocker: "WRONG_KEY" };
  }
  if (
    expected.scope !== SCOPE ||
    !KEY_HASH.test(expected.keyHash) ||
    row.keyHash !== expected.keyHash
  ) {
    return { admissible: false, blocker: "WRONG_KEY" };
  }
  if (row.state !== "PENDING") {
    return { admissible: false, blocker: "INVALID_RESERVATION_STATE" };
  }
  return { admissible: false, blocker: "TRUSTED_PRE_DOMAIN_BINDER_MISSING" };
}
