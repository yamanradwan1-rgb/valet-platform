import type { StaffApiClient } from "../../lib/api/staff-api-client";
import type { StaffSessionView } from "./auth-runtime";

export type AuthStatus =
  | "restoring"
  | "authenticated"
  | "unauthenticated"
  | "expired"
  | "signing-out"
  | "logout-failed";

export interface AuthContextValue {
  readonly status: AuthStatus;
  readonly session: StaffSessionView | null;
  readonly client: StaffApiClient;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export interface SessionTiming {
  readonly accessExpiresAt: string;
  readonly sessionExpiresAt: string;
}

export interface StoredTokens extends SessionTiming {
  readonly accessToken: string;
}
