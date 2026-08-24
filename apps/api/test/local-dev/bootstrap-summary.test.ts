import { describe, expect, it } from "vitest";

import {
  renderBootstrapSummary,
  type BootstrapOutcome,
} from "../../tools/local-dev/bootstrap";
import { AMMAN_DEMO_LOCATION_CODE } from "../../tools/local-dev/demo-employee-credential";

function outcomeFixture(): BootstrapOutcome {
  return {
    credential: {
      activeShift: true,
      email: "valet@vaylet.demo.invalid",
      locationCodes: [AMMAN_DEMO_LOCATION_CODE],
      membershipRole: "VALET_EMPLOYEE",
    },
    keySlots: [
      {
        active: true,
        code: "K-01",
        locationCode: AMMAN_DEMO_LOCATION_CODE,
        occupancy: "OCCUPIED",
        sessionId: "00000000-0000-4000-8000-000000000080",
        sessionState: "PARKED",
        vehicleDescriptor: "DEMO-A-101",
      },
      {
        active: true,
        code: "K-02",
        locationCode: AMMAN_DEMO_LOCATION_CODE,
        occupancy: "OCCUPIED",
        sessionId: "00000000-0000-4000-8000-000000000081",
        sessionState: "READY",
        vehicleDescriptor: "Unreadable plate — silver demo SUV",
      },
      {
        active: true,
        code: "K-03",
        locationCode: AMMAN_DEMO_LOCATION_CODE,
        occupancy: "FREE",
      },
      {
        active: true,
        code: "K-04",
        locationCode: AMMAN_DEMO_LOCATION_CODE,
        occupancy: "FREE",
      },
    ],
    parkingSpots: [
      {
        active: true,
        code: "A-01",
        locationCode: AMMAN_DEMO_LOCATION_CODE,
        occupancy: "OCCUPIED",
        sessionId: "00000000-0000-4000-8000-000000000080",
        sessionState: "PARKED",
        vehicleDescriptor: "DEMO-A-101",
      },
      {
        active: true,
        code: "A-02",
        locationCode: AMMAN_DEMO_LOCATION_CODE,
        occupancy: "FREE",
      },
    ],
    purge: {
      antiAbuseEventsDeleted: 2,
      refreshCredentialsDeleted: 1,
      staffSessionsDeleted: 3,
    },
  };
}

describe("bootstrap completion summary", () => {
  it("prints service URLs, canonical credential and deterministic resource lines", () => {
    const lines = renderBootstrapSummary(outcomeFixture());
    const text = lines.join("\n");
    expect(text).toContain("VAYLET local environment ready");
    expect(text).toContain("API:       http://localhost:3001");
    expect(text).toContain("Employee:  http://localhost:3000");
    expect(text).toContain("Customer:  http://localhost:3002");
    expect(text).toContain("valet@vaylet.demo.invalid");
    expect(text).toContain("VayletPassword123!");
    expect(text).toContain(
      "K-01 | OCCUPIED | PARKED | DEMO-A-101 | session 00000000-0000-4000-8000-000000000080",
    );
    expect(text).toContain("K-03 | FREE");
    expect(text).toContain("K-04 | FREE");
    expect(text).toContain(
      "A-01 | OCCUPIED | PARKED | DEMO-A-101 | session 00000000-0000-4000-8000-000000000080",
    );
    expect(lines.filter((line) => line === "KeySlots:").length).toBe(1);
    expect(lines.filter((line) => line === "Parking spots:").length).toBe(1);
  });

  it("never prints hashes, connection strings or tokens", () => {
    const text = renderBootstrapSummary(outcomeFixture()).join("\n");
    expect(text).not.toMatch(/argon2id/i);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toMatch(/password_hash/i);
    expect(text).not.toMatch(/bearer|refresh token|hmac/i);
  });
});
