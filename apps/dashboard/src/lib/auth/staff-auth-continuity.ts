import {
  STAFF_AUTH_SESSION_CONTINUITY_HEADER,
  staffAuthSessionContinuitySchema,
} from "@valet/contracts";

/** Missing/invalid metadata disables continuity; legacy token auth remains valid. */
export function readStaffAuthContinuity(headers: Headers): string | null {
  const parsed = staffAuthSessionContinuitySchema.safeParse(
    headers.get(STAFF_AUTH_SESSION_CONTINUITY_HEADER),
  );
  return parsed.success ? parsed.data : null;
}
