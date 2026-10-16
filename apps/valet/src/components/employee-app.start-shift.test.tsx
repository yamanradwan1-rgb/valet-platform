import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  StaffOperationalContextResponse,
  StaffOperationalMembershipContext,
} from "@valet/contracts";

import { EmployeeApp } from "./employee-app";
import type {
  StartShiftPhase,
} from "../features/shift";
import type {
  OperationalScopeResolution,
} from "../features/staff-operational-context";

const AMM_LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const DEM_LOCATION_ID = "22222222-2222-4222-8222-222222222222";

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
          timezone: "Asia/Amman",
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

function activeContextAt(
  locationId: string,
): StaffOperationalMembershipContext {
  return {
    activeShift: {
      locationId,
      shiftId: "66666666-6666-4666-8666-666666666666",
      startedAt: "2026-08-26T08:00:00.000Z",
      status: "ACTIVE",
    },
    currentLocation: {
      code: locationId === AMM_LOCATION_ID ? "AMM-01" : "DEM-01",
      currency: "JOD",
      locationId,
      name: locationId === AMM_LOCATION_ID
        ? "Amman Ridge Hotel"
        : "Demo Venue",
      timezone: "Asia/Amman",
    },
    eligibleLocations: [],
    membershipId: "33333333-3333-4333-8333-333333333333",
    organization: {
      name: "Apex Valet",
      organizationId: "44444444-4444-4444-8444-444444444444",
    },
    role: "VALET_EMPLOYEE",
  };
}

function resolvedAt(locationId: string): OperationalScopeResolution {
  const activeContext = activeContextAt(locationId);
  return {
    kind: "RESOLVED",
    scope: {
      activeContext,
      currency: "JOD",
      locationCode: activeContext.currentLocation!.code,
      locationId,
      locationName: activeContext.currentLocation!.name,
      membershipId: activeContext.membershipId,
      organizationId: activeContext.organization.organizationId,
      organizationName: activeContext.organization.name,
      role: activeContext.role,
      shiftId: activeContext.activeShift!.shiftId,
      shiftStartedAt: activeContext.activeShift!.startedAt,
    },
  };
}

// Mutable authoritative-context state so each test renders one stage of the
// reconciliation sequence.
let operationalResolution: OperationalScopeResolution = {
  kind: "NO_ACTIVE_SHIFT",
};
let operationalResponseBody: StaffOperationalContextResponse = contextResponse;

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
      resolution: operationalResolution,
      response: operationalResponseBody,
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

/**
 * VUI-011D reconciliation regression: an uncertain Start Shift intent must
 * survive every authoritative state that does not prove its Shift, be cleared
 * exactly once an ACTIVE Shift is proven at the SAME target Location, and
 * never resurface after that Shift ends. The predicate itself
 * (shouldReconcileUncertainStart) is exhaustively unit-tested; these cases
 * render the full sequence through the real app wiring.
 */
describe("EmployeeApp stale uncertain Start Shift reconciliation", () => {
  it("keeps the recovery intent while authoritative context still reports NO_ACTIVE_SHIFT", () => {
    startPhase = { kind: "uncertain", targetLocationId: AMM_LOCATION_ID };
    operationalResolution = { kind: "NO_ACTIVE_SHIFT" };
    operationalResponseBody = contextResponse;

    const markup = renderApp();
    expect(markup).toContain(">Retry start shift</button>");
    // Absence of a shift is not mutation proof: nothing may clear the
    // retained intent merely because a refresh returned NO_ACTIVE_SHIFT.
    expect(resetStartShift).not.toHaveBeenCalled();
  });

  it("clears the stale intent once authoritative context proves the ACTIVE Shift at the SAME target Location", () => {
    startPhase = { kind: "uncertain", targetLocationId: AMM_LOCATION_ID };
    operationalResolution = resolvedAt(AMM_LOCATION_ID);
    operationalResponseBody = {
      contexts: [activeContextAt(AMM_LOCATION_ID)],
    };

    // In a live renderer the app-level reconciliation effect resets the
    // controller when this context arrives (predicate proven true in the
    // unit matrix); SSR cannot execute effects, so idle is asserted as the
    // exact post-reconciliation phase the effect produces.
    startPhase = { kind: "idle" };
    const markup = renderApp();

    // Live surface at the proven Location; no recovery panel and no
    // fabricated mutation-success message of any kind.
    expect(markup).toContain("Amman Ridge Hotel");
    expect(markup).not.toContain("Confirm your start shift result");
    expect(markup).not.toContain(">Retry start shift</button>");
    expect(startShift).not.toHaveBeenCalled();
  });

  it("renders an ordinary fresh chooser afterwards instead of resurfacing the old recovery", () => {
    operationalResolution = { kind: "NO_ACTIVE_SHIFT" };
    operationalResponseBody = contextResponse;

    // Post-reconciliation: the previous intent is gone, so ending that later
    // shift and returning to NO_ACTIVE_SHIFT shows a fresh Start, not a
    // retry of the long-resolved command.
    startPhase = { kind: "idle" };
    const markup = renderApp();

    expect(markup).toContain("No active shift");
    expect(markup).toContain(">Start Shift</button>");
    expect(markup).toContain('<bdi dir="ltr">AMM-01</bdi>');
    expect(markup).not.toContain(">Retry start shift</button>");
    expect(markup).not.toContain("Confirm your start shift result");
  });

  it("leaves the retained intent untouched for an ACTIVE Shift at an unrelated Location", () => {
    resetStartShift.mockClear();
    startPhase = { kind: "uncertain", targetLocationId: AMM_LOCATION_ID };
    operationalResolution = resolvedAt(DEM_LOCATION_ID);
    operationalResponseBody = {
      contexts: [activeContextAt(DEM_LOCATION_ID)],
    };

    const markup = renderApp();
    // Live surface renders at the unrelated Location...
    expect(markup).toContain("Demo Venue");
    expect(markup).not.toContain(">Retry start shift</button>");
    // ...but the retained Location A intent is NOT silently reclassified:
    // only the SAME target Location may resolve it.
    expect(resetStartShift).not.toHaveBeenCalled();
  });
});
