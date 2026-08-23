import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ParkingFlow } from "./parking-flow";

describe("ParkingFlow Component", () => {
  const activeSession = {
    keySlotCode: "A-101",
    locationId: "11111111-1111-4111-8111-111111111111",
    parkedAt: null,
    parkingSpotCode: null,
    parkingStartedAt: new Date(Date.now() - 30000).toISOString(),
    parkingZoneCode: "Zone A",
    sessionId: "22222222-2222-4222-8222-222222222222",
    sessionVersion: 4,
    taskId: "33333333-3333-4333-8333-333333333333",
    taskVersion: 2,
    vehicle: {
      color: "White",
      make: "Mercedes",
      model: "C200",
      plateCountry: "JO",
      plateNumberRaw: "55-88888",
      temporaryDescriptor: null,
    },
  };

  it("renders active parking in-progress step without unproven TrackingPill in live mode", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(
      <ParkingFlow mode="live" nav={nav} initialSession={activeSession} />,
    );

    expect(markup).toContain("Parking Mercedes C200");
    expect(markup).toContain("Mercedes C200 · ");
    expect(markup).toContain('<bdi dir="ltr">55-88888</bdi>');
    expect(markup).toContain("Key");
    expect(markup).toContain("A-101");
    expect(markup).toContain("Zone A");
    expect(markup).toContain("Park Vehicle");
    expect(markup).not.toContain("Report Issue");
    expect(markup).not.toContain("Simulate Spot Scan");
    expect(markup).not.toContain("Location active for this task");
  });

  it("renders prototype mode with demo tracking pill and incident controls", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(<ParkingFlow mode="prototype" nav={nav} />);
    expect(markup).toContain("Parking Vehicle");
    expect(markup).toContain("Park Vehicle");
    expect(markup).toContain("Report Issue");
    expect(markup).toContain("Location active for this task");
  });
});
