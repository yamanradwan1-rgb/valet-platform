export interface UserAuthenticationRow {
  readonly id: string;
  readonly password_hash: string | null;
  readonly status: "PENDING" | "ACTIVE" | "DISABLED";
}

export interface LoginSessionRow {
  readonly access_expires_at: Date;
  readonly absolute_expires_at: Date;
  readonly refresh_cookie_max_age_seconds: number;
}

export interface RefreshCredentialRow {
  readonly absolute_expires_at: Date;
  readonly consumed_at: Date | null;
  readonly expires_at: Date;
  readonly generation: number;
  readonly id: string;
  readonly revoked_at: Date | null;
  readonly session_id: string;
  readonly status: "PENDING" | "ACTIVE" | "DISABLED";
}

export interface DatabaseClockRow {
  readonly now: Date;
}

export interface StaffPasswordVerifier {
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export interface StaffAuthTokens {
  readonly accessExpiresAt: Date;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshCookieMaxAgeSeconds: number;
  readonly sessionExpiresAt: Date;
}

export class StaffAuthenticationError extends Error {
  readonly code = "STAFF_AUTHENTICATION_FAILED";

  constructor() {
    super("Staff authentication failed.");
    this.name = "StaffAuthenticationError";
  }
}
