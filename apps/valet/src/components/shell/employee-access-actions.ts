"use client";

import type { StaffLoginRequest } from "@valet/contracts";

export interface EmployeeAccessActionsState {
  readonly isRetryingRestore: boolean;
  readonly isSigningIn: boolean;
  readonly loginError: string | null;
}

export interface EmployeeAccessHandlers {
  readonly login: (credentials: StaffLoginRequest) => Promise<void>;
  readonly restoreSession: () => Promise<unknown>;
}

export interface EmployeeAccessActions {
  bind(handlers: EmployeeAccessHandlers): void;
  getSnapshot(): EmployeeAccessActionsState;
  retryRestore(): Promise<void>;
  signIn(credentials: StaffLoginRequest): Promise<void>;
  subscribe(
    listener: (state: EmployeeAccessActionsState) => void,
  ): () => void;
}

/**
 * Headless access actions with SYNCHRONOUS duplicate-submit guards.
 * Guard booleans live in closure scope, so rapid re-submission is blocked
 * regardless of React batching; the caller mirrors the snapshot into
 * component state purely for rendering.
 *
 * Handlers are injected via bind() (typically from an effect) so no auth
 * method is captured during render.
 */
export function createEmployeeAccessActions(): EmployeeAccessActions {
  let handlers: EmployeeAccessHandlers = {
    login: async () => {
      throw new Error("Employee access actions are not bound yet.");
    },
    restoreSession: async () => {
      throw new Error("Employee access actions are not bound yet.");
    },
  };

  let signInInFlight = false;
  let restoreInFlight = false;
  let state: EmployeeAccessActionsState = {
    isRetryingRestore: false,
    isSigningIn: false,
    loginError: null,
  };
  const listeners = new Set<(state: EmployeeAccessActionsState) => void>();

  const apply = (patch: Partial<EmployeeAccessActionsState>): void => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  return {
    bind(next: EmployeeAccessHandlers): void {
      handlers = next;
    },

    getSnapshot: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async retryRestore(): Promise<void> {
      if (restoreInFlight) return;
      restoreInFlight = true;
      apply({ isRetryingRestore: true });
      try {
        await handlers.restoreSession();
      } finally {
        restoreInFlight = false;
        apply({ isRetryingRestore: false });
      }
    },

    async signIn(credentials: StaffLoginRequest): Promise<void> {
      if (signInInFlight) return;
      signInInFlight = true;
      apply({ isSigningIn: true, loginError: null });
      try {
        await handlers.login(credentials);
      } catch (error: unknown) {
        apply({
          loginError:
            error instanceof Error
              ? error.message
              : "Staff sign-in failed. Please try again.",
        });
      } finally {
        signInInFlight = false;
        apply({ isSigningIn: false });
      }
    },
  };
}
