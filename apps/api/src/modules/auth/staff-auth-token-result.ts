import type { LoginSessionRow, StaffAuthTokens } from "./staff-auth-types";

export function staffAuthTokenResult(
  session: LoginSessionRow,
  accessToken: string,
  refreshToken: string,
): StaffAuthTokens {
  return {
    staffAuthSessionId: session.id,
    accessExpiresAt: session.access_expires_at,
    accessToken,
    refreshToken,
    refreshCookieMaxAgeSeconds: session.refresh_cookie_max_age_seconds,
    sessionExpiresAt: session.absolute_expires_at,
  };
}
