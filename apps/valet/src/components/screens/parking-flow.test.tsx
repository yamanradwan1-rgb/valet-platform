import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ParkingFlow } from "./parking-flow";

describe("ParkingFlow Component", () => {
  it("renders active parking in-progress step with session details", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(
      <ParkingFlow
        nav={nav}
        initialSession={{
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
        }}
      />,
    );

    expect(markup).toContain("Parking Mercedes C200");
    expect(markup).toContain("Mercedes C200 · 55-88888");
    expect(markup).toContain("Key");
    expect(markup).toContain("A-101");
    expect(markup).toContain("Zone A");
    expect(markup).toContain("Park Vehicle");
  });

  it("renders prototype fallback correctly", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(<ParkingFlow nav={nav} />);
    expect(markup).toContain("Parking Vehicle");
    expect(markup).toContain("Park Vehicle");
    expect(markup).toContain("Report Issue");
  });
});
