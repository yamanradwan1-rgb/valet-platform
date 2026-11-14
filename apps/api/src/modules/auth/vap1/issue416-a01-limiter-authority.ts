import { timingSafeEqual } from "node:crypto";
import { staffLoginRequestSchema } from "@valet/contracts";

import {
  AntiAbuseUnavailableError,
  type AntiAbusePendingReservation,
} from "../../anti-abuse/anti-abuse.service";
import { AntiAbuseKeyDeriver } from "../../anti-abuse/anti-abuse-key";

/** Re-derive the identifier reservation from the exact normalized login
 * email using the trusted application HMAC root. A caller-provided hash,
 * a reservation for another identity, or a case-changed user must not bind.
 */
export function assertA01TrustedLimiter(
  email: unknown,
  reservation: AntiAbusePendingReservation,
  keys: AntiAbuseKeyDeriver,
): void {
  try {
    const normalized = staffLoginRequestSchema.shape.email.safeParse(email);
    if (!normalized.success || normalized.data !== email ||
        !reservation || reservation.key?.scope !== "v1:staff-login-identifier" ||
        typeof reservation.id !== "string" ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(reservation.id) ||
        !/^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$/.test(
          reservation.key.keyHash,
        )) throw new AntiAbuseUnavailableError();
    const expected = keys.derive("v1:staff-login-identifier", normalized.data);
    const supplied = Buffer.from(reservation.key.keyHash, "utf8");
    const genuine = Buffer.from(expected.keyHash, "utf8");
    if (
      supplied.length !== genuine.length ||
      !timingSafeEqual(supplied, genuine) ||
      expected.lockHigh !== reservation.key.lockHigh ||
      expected.lockLow !== reservation.key.lockLow
    ) throw new AntiAbuseUnavailableError();
  } catch {
    throw new AntiAbuseUnavailableError();
  }
}
