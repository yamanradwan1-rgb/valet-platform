import { MfaStepUpRequiredError } from "../auth/mfa/mfa-errors";
import { ManagementAccessDeniedError } from "../management/management-authorization";

/**
 * The Phase-1 Dashboard entitlement is already proven before these calls.
 * A stricter, independently protected source may be ineligible for this user;
 * never deny unrelated entitled categories solely because that source needs
 * stronger assurance. Do NOT catch SQL, serialization or integrity failures.
 */
export async function readOptionalSensitiveTakeovers<T>(
  sourceRead: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await sourceRead();
  } catch (error) {
    if (error instanceof MfaStepUpRequiredError) return [];
    throw error;
  }
}

/** Shift-history entitlement requires protected MFA even for an LM whose
 * ordinary Dashboard grant does not. Denial is NOT permission to inspect it.
 */
export async function readOptionalProtectedShift<T>(
  sourceRead: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await sourceRead();
  } catch (error) {
    if (error instanceof ManagementAccessDeniedError) return [];
    throw error;
  }
}
