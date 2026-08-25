import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StaffOperationalContextResponse } from "@valet/contracts";

import { EmployeeApp } from "./employee-app";
import type { StartShiftPhase } from "../features/shift";

const AMM_LOCATION_ID = "11111111-1111-4111-8111-111111111111";

const startShift = vi.fn();
const resetStartShift = vi.fn();
const retryUncertainStart = vi.fn();
let startPhase: StartShiftPhase = { kind: "idle" };
const capturedHookOptions: {
  onAuthorizationLoss?: (() => void) | undefined;
  onStarted?: (() => void) | undefined;
} = {};
const revalidateOnAuthLoss = vi.fn(async () => {});
const refreshContext = vi.fn();

const contextResponse: StaffOperationalContextResponse = {
  contexts: [
    {
      activeShift: null,
      currentLocation: null,
      eligibleLocations: [
        {
          code: "AMM-01",
          currency: "JOD",
          locationId: AMM_LOCATION_ID,
          name: "Amman Ridge Hotel",
        },
      ],
      membershipId: "33333333-3333-4333-8333-333333333333",
      organization: {
        name: "Apex Valet",
        organizationId: "44444444-4444-4444-8444-444444444444",
      },
      role: "VALET_EMPLOYEE",
    },
  ],
};

vi.mock("../features/shift", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../features/shift")>();
  return {
    ...actual,
    useStartShift: vi.fn((options?: {
      onAuthorizationLoss?: (() => void) | undefined;
      onStarted?: (() => void) | undefined;
    }) => {
      capturedHookOptions.onAuthorizationLoss = options?.onAuthorizationLoss;
      capturedHookOptions.onStarted = options?.onStarted;
      return {
        phase: startPhase,
        resetStartShift,
        retryUncertain: retryUncertainStart,
        startShift,
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
      response: contextResponse,
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
 * VUI-011D: the NO_ACTIVE_SHIFT gate is no longer a dead end. Start Shift
 * must derive its Locations exclusively from the authoritative operational
 * context and share the DEC-066 §4 ambiguous-outcome recovery architecture.
 */
describe("EmployeeApp Live Start Shift wiring", () => {
  it("offers Start Shift at the server-provided eligible Locations", () => {
    startPhase = { kind: "idle" };
    const markup = renderApp();
    expect(markup).toContain("No active shift");
    expect(markup).toContain("Amman Ridge Hotel");
    expect(markup).toContain('<bdi dir="ltr">AMM-01</bdi>');
    expect(markup).toContain(">Start Shift</button>");
    // No hardcoded demo Location beyond the authoritative projection.
    expect(markup).not.toContain("Four Seasons Amman");
    expect(startShift).not.toHaveBeenCalled();
  });

  it("routes Start Shift auth loss through the authoritative revalidation boundary and refreshes context on confirmed success", () => {
    startPhase = { kind: "idle" };
    renderApp();

    expect(typeof capturedHookOptions.onAuthorizationLoss).toBe("function");
    capturedHookOptions.onAuthorizationLoss?.();
    expect(revalidateOnAuthLoss).toHaveBeenCalledTimes(1);

    expect(typeof capturedHookOptions.onStarted).toBe("function");
    capturedHookOptions.onStarted?.();
    expect(refreshContext).toHaveBeenCalledTimes(1);
  });

  it("keeps an ambiguous outcome non-successful with explicit same-command retry instead of the ordinary chooser", () => {
    startPhase = {
      kind: "uncertain",
      targetLocationId: AMM_LOCATION_ID,
    };
    const markup = renderApp();

    expect(markup).toContain("Confirm your start shift result");
    expect(markup).toContain("may or may not have been started");
    expect(markup).toContain(">Retry start shift</button>");
    expect(markup).not.toContain(">Start Shift</button>");
    // No fake success and no automatic replay happened by rendering.
    expect(retryUncertainStart).not.toHaveBeenCalled();
    expect(startShift).not.toHaveBeenCalled();
    // The retained intent survives revalidation back to NO_ACTIVE_SHIFT.
    expect(resetStartShift).not.toHaveBeenCalled();
  });
});
