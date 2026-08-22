import { describe, expect, it, vi } from "vitest";
import type { StaffLoginRequest } from "@valet/contracts";

import { createEmployeeAccessActions } from "./employee-access-actions";
import { buildEmployeeAccessGateProps } from "./employee-access-view";

const credentials: StaffLoginRequest = {
  email: "valet.driver@example.com",
  password: "SuperSecretPassword123!",
};

function deferred<T>(): {
  promise: Promise<T>;
  reject: (e: unknown) => void;
  resolve: (v: T) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

describe("createEmployeeAccessActions synchronous guards", () => {
  it("prevents a second rapid login while the first is in flight and releases after completion", async () => {
    const firstLogin = deferred<void>();
    const login = vi.fn().mockImplementationOnce(() => firstLogin.promise);
    const actions = createEmployeeAccessActions();
    actions.bind({ login, restoreSession: async () => undefined });

    const first = actions.signIn(credentials);
    await actions.signIn(credentials); // duplicate while in flight: no-op
    expect(login).toHaveBeenCalledTimes(1);
    expect(actions.getSnapshot().isSigningIn).toBe(true);

    firstLogin.resolve();
    await first;
    expect(actions.getSnapshot().isSigningIn).toBe(false);
    expect(actions.getSnapshot().loginError).toBeNull();

    // Guard released: a later submit starts a new operation.
    login.mockResolvedValueOnce(undefined);
    await actions.signIn(credentials);
    expect(login).toHaveBeenCalledTimes(2);
  });

  it("keeps the guard until settle even on failure, surfaces the error once, and remains retryable", async () => {
    const login = vi.fn();
    const actions = createEmployeeAccessActions();
    actions.bind({ login, restoreSession: async () => undefined });

    const failing = deferred<void>();
    login.mockImplementationOnce(() => failing.promise);
    const first = actions.signIn(credentials);
    await actions.signIn(credentials);
    expect(login).toHaveBeenCalledTimes(1);
    expect(actions.getSnapshot().isSigningIn).toBe(true);

    failing.reject(new Error("Invalid staff credentials."));
    await first;
    expect(actions.getSnapshot().loginError).toContain("Invalid");
    expect(actions.getSnapshot().isSigningIn).toBe(false);

    // Released and retryable; a new attempt clears the stale error at start.
    login.mockResolvedValueOnce(undefined);
    await actions.signIn(credentials);
    expect(login).toHaveBeenCalledTimes(2);
    expect(actions.getSnapshot().loginError).toBeNull();
  });

  it("guards retryRestore against repeat submissions while a restore is in flight", async () => {
    const restore = deferred<{ kind: "AUTHENTICATED" }>();
    const restoreSession =
      vi.fn().mockImplementation(() => restore.promise);
    const actions = createEmployeeAccessActions();
    actions.bind({ login: vi.fn(), restoreSession });

    const first = actions.retryRestore();
    await actions.retryRestore();
    expect(restoreSession).toHaveBeenCalledTimes(1);
    expect(actions.getSnapshot().isRetryingRestore).toBe(true);

    restore.resolve({ kind: "AUTHENTICATED" });
    await first;
    expect(actions.getSnapshot().isRetryingRestore).toBe(false);

    // Released afterwards: next retry runs again to completion.
    restoreSession.mockResolvedValueOnce({
      kind: "REFRESH_UNAVAILABLE",
      message: "still down",
    });
    await actions.retryRestore();
    expect(actions.getSnapshot().isRetryingRestore).toBe(false);
  });
});

describe("buildEmployeeAccessGateProps wiring", () => {
  it("binds the REAL retry handler for refresh-unavailable so Retry invokes restoreSession", async () => {
    const restoreSession = vi.fn().mockResolvedValue({ kind: "AUTHENTICATED" });
    const props = buildEmployeeAccessGateProps({
      actionsState: {
        isRetryingRestore: false,
        isSigningIn: false,
        loginError: null,
      },
      handlers: {
        retryRestore: () => restoreSession() as Promise<void>,
        signIn: () => Promise.resolve(),
      },
      phase: "refresh-unavailable",
    });

    if (props.phase !== "refresh-unavailable") {
      throw new Error("Expected refresh-unavailable variant");
    }
    expect(props.isRetryingRestore).toBe(false);
    await props.onRetryRestore();
    expect(restoreSession).toHaveBeenCalledTimes(1);
  });

  it("propagates retrying state into the disabled button state", () => {
    const props = buildEmployeeAccessGateProps({
      actionsState: { isRetryingRestore: true, isSigningIn: false, loginError: null },
      handlers: { retryRestore: () => Promise.resolve(), signIn: () => Promise.resolve() },
      phase: "refresh-unavailable",
    });
    if (props.phase !== "refresh-unavailable") {
      throw new Error("Expected refresh-unavailable variant");
    }
    expect(props.isRetryingRestore).toBe(true);
  });

  it("binds sign-in to the real handler for the unauthenticated phase and mirrors signing state", () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    const props = buildEmployeeAccessGateProps({
      actionsState: { isRetryingRestore: false, isSigningIn: true, loginError: "Bad credentials." },
      handlers: { retryRestore: () => Promise.resolve(), signIn },
      phase: "unauthenticated",
    });
    if (props.phase !== "unauthenticated") {
      throw new Error("Expected unauthenticated variant");
    }
    expect(props.isSigningIn).toBe(true);
    expect(props.loginError).toBe("Bad credentials.");
    void props.onLogin(credentials);
    expect(signIn).toHaveBeenCalledWith(credentials);
  });
});
