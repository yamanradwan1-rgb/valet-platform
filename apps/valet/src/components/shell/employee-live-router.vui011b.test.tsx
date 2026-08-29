import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { StartParkingPayload } from "../../features/check-in";
import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import type { Screen } from "../../types/employee-ui";
import type {
  ActiveParkingTarget,
  ActiveRetrievalTarget,
} from "./employee-workspace";
import { EmployeeLiveRouter } from "./employee-live-router";

const SCOPE: ResolvedOperationalScope = {
  activeContext: {} as ResolvedOperationalScope["activeContext"],
  currency: "JOD",
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

const PARKING_TARGET: ActiveParkingTarget = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskVersion: 3,
};

const PARKING_PAYLOAD: StartParkingPayload = {
  keySlotCode: null,
  locationId: "22222222-2222-4222-8222-222222222222",
  parkingStartedAt: "2026-08-25T10:05:00.000Z",
  sessionId: "44444444-4444-4444-8444-444444444444",
  sessionVersion: 5,
  taskId: "55555555-5555-4555-8555-555555555555",
  taskVersion: 1,
  vehicle: {
    color: null,
    make: null,
    model: "Nissan Patrol",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
};

const RETRIEVAL_TARGET: ActiveRetrievalTarget = {
  currentAssigneeMembershipId: SCOPE.membershipId,
  sessionId: "77777777-7777-4777-8777-777777777777",
  taskId: "88888888-8888-4888-8888-888888888888",
  taskStatus: "IN_PROGRESS",
  taskVersion: 2,
};

const baseProps = {
  activeScope: SCOPE,
  effectiveScreen: "scan-hub" as Screen,
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
  taskQueue: {
    client: {} as never,
    error: null,
    isHardStopped: false,
    isLoading: false,
    isRefreshing: false,
    successfulSnapshotCount: 1,
    tasks: [] as never[],
  },
} as const;

function renderRouter(overrides: {
  parkingPayload?: StartParkingPayload | null;
  parkingTarget?: ActiveParkingTarget | null;
  retrievalTarget?: ActiveRetrievalTarget | null;
}): string {
  return renderToStaticMarkup(
    <EmployeeLiveRouter {...baseProps} {...overrides} />,
  );
}

describe("VUI-011B live routing to the context-aware Scan Hub", () => {
  it("renders the hub with every contextual tile locked when no context is held", () => {
    const markup = renderRouter({});
    expect(markup).toContain("License Plate");
    expect(markup).toContain("Open an active parking task first.");
    expect(markup).toContain("Open an active retrieval task first.");
    expect(markup).toContain('disabled=""');
  });

  it("feeds the existing parking target through so Parking can be resumed", () => {
    const markup = renderRouter({ parkingTarget: PARKING_TARGET });
    expect(markup).toContain("Resume active parking");
  });

  it("feeds the in-flight start-parking payload through as resume context", () => {
    const markup = renderRouter({ parkingPayload: PARKING_PAYLOAD });
    expect(buttonTag(markup, "Parking Spot")).not.toContain('disabled=""');
  });

  it("feeds the existing retrieval target through so Handoff can be resumed", () => {
    const markup = renderRouter({ retrievalTarget: RETRIEVAL_TARGET });
    expect(markup).toContain("Resume active retrieval");
  });

  it("never leaks held identifiers onto the hub surface", () => {
    const markup = renderRouter({
      parkingPayload: PARKING_PAYLOAD,
      parkingTarget: PARKING_TARGET,
      retrievalTarget: RETRIEVAL_TARGET,
    });
    expect(markup).not.toContain(PARKING_TARGET.sessionId);
    expect(markup).not.toContain(PARKING_PAYLOAD.sessionId);
    expect(markup).not.toContain(RETRIEVAL_TARGET.sessionId);
    expect(markup).not.toContain(SCOPE.shiftId);
  });
});

function buttonTag(markup: string, label: string): string {
  const parts = markup.split("<button");
  const part = parts.find((candidate) => candidate.includes(label));
  expect(part).toBeDefined();
  return `<button${part ?? ""}`;
}
