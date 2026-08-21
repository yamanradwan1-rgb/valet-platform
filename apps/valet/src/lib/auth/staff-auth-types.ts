export type StaffAuthStatus =
  "initializing" | "authenticated" | "unauthenticated";

export interface StaffAuthSession {
  readonly accessToken: string;
  readonly tokenType: "Bearer";
  readonly accessExpiresAt: string;
  readonly sessionExpiresAt: string;
}

export interface StaffAuthState {
  readonly status: StaffAuthStatus;
  readonly session: StaffAuthSession | null;
  readonly sessionGeneration: number;
}

export interface StaffAuthCredentials {
  readonly email: string;
  readonly password: string;
}
