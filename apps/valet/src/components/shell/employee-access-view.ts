import type { StaffLoginRequest } from "@valet/contracts";

import type { EmployeeAccessActionsState } from "./employee-access-actions";
import type { EmployeeAccessGateProps } from "./employee-access-gate";

export type EmployeeAccessPhase =
  | "initializing"
  | "refresh-unavailable"
  | "unauthenticated";

export interface EmployeeAccessHandlers {
  readonly retryRestore: () => Promise<void>;
  readonly signIn: (credentials: StaffLoginRequest) => Promise<void>;
}

export interface EmployeeAccessViewInput {
  readonly actionsState: EmployeeAccessActionsState;
  readonly handlers: EmployeeAccessHandlers;
  readonly phase: EmployeeAccessPhase;
}

/**
 * Single source of truth for the access-gate variant EmployeeApp renders.
 * The refresh-unavailable branch binds the REAL retry handler, so a dead
 * Retry button is unrepresentable at this boundary and below (the gate's
 * discriminated props make the handler required).
 */
export function buildEmployeeAccessGateProps(
  input: EmployeeAccessViewInput,
): EmployeeAccessGateProps {
  if (input.phase === "refresh-unavailable") {
    return {
      isRetryingRestore: input.actionsState.isRetryingRestore,
      onRetryRestore: () => void input.handlers.retryRestore(),
      phase: "refresh-unavailable",
    };
  }
  if (input.phase === "unauthenticated") {
    return {
      isSigningIn: input.actionsState.isSigningIn,
      loginError: input.actionsState.loginError,
      onLogin: (credentials) => void input.handlers.signIn(credentials),
      phase: "unauthenticated",
    };
  }
  return { phase: "initializing" };
}
