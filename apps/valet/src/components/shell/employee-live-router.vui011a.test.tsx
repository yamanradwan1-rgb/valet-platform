import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import type { Screen } from "../../types/employee-ui";
import { EmployeeLiveRouter } from "./employee-live-router";

const SCOPE: ResolvedOperationalScope = {
  activeContext: {} as ResolvedOperationalScope["activeContext"],
  locationCode: "AMM-01",
  locationId: "22222222-2222-4222-8222-222222222222",
  locationName: "Amman Ridge Hotel",
  membershipId: "33333333-3333-4333-8333-333333333333",
  organizationId: "44444444-4444-4444-8444-444444444444",
  organizationName: "VAYLET Operations",
  role: "VALET_EMPLOYEE",
  shiftId: "55555555-5555-4555-8555-555555555555",
  shiftStartedAt: "2026-08-25T10:00:00.000Z",
};

const baseProps = {
  activeScope: SCOPE,
  effectiveScreen: "task-queue" as Screen,
  endShift: vi.fn(),
  endShiftPhase: { kind: "idle" } as import("../../features/shift").EndShiftPhase,
  guestAccessTarget: null,
  incidentTarget: null,
  nav: vi.fn(),
  onAuthorizationLoss: vi.fn(async () => {}),
  onGuestAccessClose: vi.fn(),
  onOpenGuestAccess: vi.fn(),
  onOpenIncident: vi.fn(),
  onParkingComplete: vi.fn(),
  onRetrievalComplete: vi.fn(),
  onRetryUncertainEndShift: vi.fn(),
  onSelectParkingTask: vi.fn(),
  onSelectRetrievalTask: vi.fn(),
  onStartParkingSuccess: vi.fn(),
  parkingPayload: null,
  parkingTarget: null,
  retrievalTarget: null,
} as const;

function renderRouter(effectiveScreen: Screen): string {
  return renderToStaticMarkup(
    <EmployeeLiveRouter
      {...baseProps}
      effectiveScreen={effectiveScreen}
    />,
  );
}

describe("VUI-011A live routing", () => {
  it("renders the truthful Live Shift screen for shift-summary", () => {
    const markup = renderRouter("shift-summary");
    expect(markup).toContain("Active shift");
    expect(markup).toContain("Amman Ridge Hotel");
    // Raw Shift UUID must never reach the employee.
    expect(markup).not.toContain(SCOPE.shiftId);
    // Prototype Shift Summary content stays unreachable in Live mode.
    expect(markup).not.toContain("Mohammed Khalil");
    expect(markup).not.toContain("Check-ins");
  });

  it("does not expose the prototype Vehicles or Scan screens in Live mode", () => {
    for (const screen of ["vehicles-list", "scan-hub"] as const) {
      const markup = renderRouter(screen);
      // Falls back to the Tasks surface; no mock operational data leaks.
      expect(markup).not.toContain("BMW X5");
      expect(markup).not.toContain("License Plate");
      expect(markup).not.toContain("Search plate or vehicle...");
    }
  });

  it("keeps unknown overrides safe on the Tasks surface", () => {
    const markup = renderRouter("definitely-not-a-screen" as Screen);
    expect(markup).not.toContain("BMW X5");
    expect(markup).not.toContain(SCOPE.shiftId);
  });
});
