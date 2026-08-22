import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RetrievalFlow } from "./retrieval-flow";
import type { ActiveRetrievalSession } from "../../features/retrieval";

describe("RetrievalFlow Component", () => {
  const activeRequestedSession: ActiveRetrievalSession = {
    handoff: { pendingAt: null, verification: null },
expectedKeySlotCode: "K-900",
    isKeyConfirmed: false,
    locationId: "11111111-1111-4111-8111-111111111111",
    parkingSpotCode: "P-42",
    parkingZoneCode: "North",
    readyAt: null,
    retrievalStartedAt: null,
    sessionId: "22222222-2222-4222-8222-222222222222",
    sessionVersion: 4,
    state: "REQUESTED",
    taskId: "33333333-3333-4333-8333-333333333333",
    taskStatus: "ACCEPTED",
    taskVersion: 2,
    vehicle: {
      color: "Silver",
      make: "Audi",
      model: "A6",
      plateCountry: "JO",
      plateNumberRaw: "77-99999",
      temporaryDescriptor: null,
    },
  };

  const activeRetrievingSession: ActiveRetrievalSession = {
    ...activeRequestedSession,
    isKeyConfirmed: true,
    parkingSpotCode: null, // Released
    parkingZoneCode: null, // Released
    retrievalStartedAt: new Date(Date.now() - 45000).toISOString(),
    sessionVersion: 5,
    state: "RETRIEVING",
    taskStatus: "IN_PROGRESS",
    taskVersion: 3,
  };

  const activeReadySession: ActiveRetrievalSession = {
    ...activeRetrievingSession,
    parkingSpotCode: null, // Released
    parkingZoneCode: null, // Released
    readyAt: new Date().toISOString(),
    sessionVersion: 6,
    state: "READY",
  };

  it("renders live key-checkout step with expected key and without demo scan buttons or hardcoded fixtures", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(
      <RetrievalFlow
        mode="live"
        nav={nav}
        initialSession={activeRequestedSession}
      />,
    );

    expect(markup).toContain("Expected key slot");
    expect(markup).toContain("K-900");
    expect(markup).toContain("Audi A6 · 77-99999");
    expect(markup).toContain("Zone North · Spot P-42");
    expect(markup).toContain("Verify Key Slot");
    expect(markup).not.toContain("Scan key QR — correct key");
    expect(markup).not.toContain("Scan wrong key (demo)");
    expect(markup).not.toContain("BMW X5");
    expect(markup).not.toContain("B-214");
  });

  it("renders live in-progress step without fabricated location or unproven TrackingPill / Report Issue button", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(
      <RetrievalFlow
        mode="live"
        nav={nav}
        initialSession={activeRetrievingSession}
      />,
    );

    expect(markup).toContain("Retrieving Audi A6");
    expect(markup).toContain("Audi A6 · 77-99999");
    expect(markup).toContain("K-900");
    expect(markup).toContain("Vehicle Ready");
    // Verifies released spot is not fabricated
    expect(markup).not.toContain("Spot P-42");
    expect(markup).not.toContain("Zone North");
    expect(markup).not.toContain("Parking area");
    expect(markup).not.toContain("Report Issue");
    expect(markup).not.toContain("Location active for this task");
    expect(markup).not.toContain("TrackingPill");
  });

  it("renders live vehicle-ready step with handoff launch and without fabricated claims", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(
      <RetrievalFlow
        mode="live"
        nav={nav}
        initialSession={activeReadySession}
      />
    );
    expect(markup).toContain("Ready for pickup");
    expect(markup).toContain("Audi A6");
    expect(markup).toContain("77-99999");
    expect(markup).toContain("Begin Guest Handoff");
    // Verifies released spot is not fabricated
    expect(markup).not.toContain("Spot P-42");
    expect(markup).not.toContain("Zone North");
    expect(markup).not.toContain("Guest notified");
    expect(markup).not.toContain("Verify Guest");
  });

  it("renders prototype mode with demo controls and handoff actions", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(
      <RetrievalFlow mode="prototype" nav={nav} />,
    );
    expect(markup).toContain("Retrieval Task");
    expect(markup).toContain("Accept Task");
  });
});
