import { StaffAuthRefreshError } from "./staff-auth-client";

export type StaffAuthStatus =
  | "initializing"
  | "authenticated"
  | "logout-unconfirmed"
  | "refresh-unavailable"
  | "unauthenticated";

export function refreshFailureStatus(error: unknown): StaffAuthStatus {
  return error instanceof StaffAuthRefreshError && error.kind === "definitive"
    ? "unauthenticated"
    : "refresh-unavailable";
}
