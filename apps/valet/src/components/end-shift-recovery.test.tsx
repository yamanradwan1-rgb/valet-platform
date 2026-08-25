import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmployeeApp } from "./employee-app";
import type { EndShiftPhase } from "../features/shift";

const endShift = vi.fn();
const resetEndShift = vi.fn();
const retryUncertain = vi.fn();
let hookPhase: EndShiftPhase = { kind: "idle" };
const capturedHookOptions: {
  onAuthorizationLoss?: (() => void) | undefined;
  onEnded?: (() => void) | undefined;
} = {};
const revalidateOnAuthLoss = vi.fn(async () => {});
const refreshContext = vi.fn();

vi.mock("../features/shift", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../features/shift")>();
  return {
    ...actual,
    useEndShift: vi.fn((options?: {
      onAuthorizationLoss?: (() => void) | undefined;
      onEnded?: (() => void) | undefined;
    }) => {
      capturedHookOptions.onAuthorizationLoss = options?.onAuthorizationLoss;
      capturedHookOptions.onEnded = options?.onEnded;
      return {
        endShift,
        phase: hookPhase,
        resetEndShift,
        retryUncertain,
      };
    }),
  };
});

vi.mock("../features/staff-operational-context", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../features/staff-operational-context")
    >();
  return {
    ...actual,
    useStaffOperationalContext: vi.fn(() => ({
      resolution: { kind: "NO_ACTIVE_SHIFT" },
      response: { contexts: [] },
      error: null,
      refresh: refreshContext,
      revalidateOnAuthLoss,
    })),
  };
});

vi.mock("../lib/auth/staff-auth-context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/auth/staff-auth-context")>();
  return {
    ...actual,
    useOptionalStaffAuth: vi.fn(() => ({
      status: "authenticated",
      sessionGeneration: 1,
      identityGeneration: 1,
      client: {},
      login: vi.fn(),
      logout: vi.fn(async () => {}),
      restoreSession: vi.fn(),
    })),
  };
});

function renderApp(): string {
  return renderToStaticMarkup(<EmployeeApp />);
}

/**
 * DEC-066 §4 regression: after an ambiguous End Shift, a reconnect that
 * revalidates authoritative context to NO_ACTIVE_SHIFT must NOT destroy the
 * retained same-command retry intent nor show a local success claim.
 */
describe("DEC-066 §4 ambiguous End Shift reconnect recovery", () => {
  it("keeps explicit same-command retry available instead of the No Active Shift gate", () => {
    hookPhase = {
      cashReported: "12.500",
      kind: "uncertain",
      shiftId: "55555555-5555-4555-8555-555555555555",
    };
    const markup = renderApp();
    expect(markup).toContain("Confirm your end shift result");
    expect(markup).toContain("may or may not have ended");
    expect(markup).toContain(">Retry end shift</button>");
    // No local success claim and no truthful-but-premature gate swap.
    expect(markup).not.toContain("Shift ended");
    expect(markup).not.toContain("No active shift");
    expect(endShift).not.toHaveBeenCalled();
    expect(retryUncertain).not.toHaveBeenCalled();
  });

  it("shows the ordinary No Active Shift gate once no uncertain intent remains", () => {
    hookPhase = { kind: "idle" };
    const markup = renderApp();
    expect(markup).toContain("No active shift");
    expect(markup).not.toContain("Confirm your end shift result");
  });

  it("wires End Shift into the existing Staff auth-loss recovery boundary", () => {
    hookPhase = { kind: "idle" };
    renderApp();

    // The app-level hook received the authorization-loss recovery callback...
    expect(typeof capturedHookOptions.onAuthorizationLoss).toBe("function");
    // ...and invoking it triggers the authoritative revalidation callback.
    capturedHookOptions.onAuthorizationLoss?.();
    expect(revalidateOnAuthLoss).toHaveBeenCalledTimes(1);

    // Success keeps refreshing operational context as before.
    expect(typeof capturedHookOptions.onEnded).toBe("function");
    capturedHookOptions.onEnded?.();
    expect(refreshContext).toHaveBeenCalledTimes(1);
  });
});
