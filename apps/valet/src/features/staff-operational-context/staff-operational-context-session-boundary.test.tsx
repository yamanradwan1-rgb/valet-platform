import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StaffOperationalContextResponse } from "@valet/contracts";

import { selectEffectiveOperationalResponse } from "./staff-operational-context-selectors";
import type { StaffOperationalContextState } from "./staff-operational-context-controller";
import { StaffAuthClient } from "../../lib/auth/staff-auth-client";
import { StaffAuthProvider } from "../../lib/auth/staff-auth-context";
import { useStaffOperationalContext } from "./use-staff-operational-context";

const sampleContextA: StaffOperationalContextResponse = {
  contexts: [
    {
      membershipId: "11111111-1111-4111-8111-111111111111",
      role: "VALET_EMPLOYEE",
      organization: {
        organizationId: "22222222-2222-4222-8222-222222222222",
        name: "Apex Valet",
      },
      activeShift: {
        shiftId: "33333333-3333-4333-8333-333333333333",
        locationId: "44444444-4444-4444-8444-444444444444",
        startedAt: "2026-08-21T18:00:00.000Z",
        status: "ACTIVE",
      },
      currentLocation: { currency: "JOD", locationId: "44444444-4444-4444-8444-444444444444", name: "Hotel Alpha", code: "LOC-01", timezone: "Asia/Amman" },
      eligibleLocations: [],
    },
  ],
};

describe("Staff Operational Context Session Boundary & Selector Gating", () => {
  it("synchronously hides User A context upon direct authenticated replacement to User B", () => {
    const controllerStateWithUserA: StaffOperationalContextState = {
      sessionGeneration: 10,
      response: sampleContextA,
      isLoading: false,
      error: null,
    };

    // User A authenticated with generation 10
    const resultUserA = selectEffectiveOperationalResponse(
      "authenticated",
      "token_user_A",
      10,
      controllerStateWithUserA,
    );
    expect(resultUserA).toEqual(sampleContextA);

    // Auth session replaced with User B (generation 11) before effect runs
    const resultUserB = selectEffectiveOperationalResponse(
      "authenticated",
      "token_user_B",
      11,
      controllerStateWithUserA,
    );

    // INVARIANT: User A context is immediately hidden (null)
    expect(resultUserB).toBeNull();
  });

  it("synchronously prevents resurrection of old context upon same-token reauthentication", () => {
    const controllerStateOldLifecycle: StaffOperationalContextState = {
      sessionGeneration: 5,
      response: sampleContextA,
      isLoading: false,
      error: null,
    };

    // New login lifecycle produces new sessionGeneration 6 even with same token text
    const resultNewSession = selectEffectiveOperationalResponse(
      "authenticated",
      "same_token_text",
      6,
      controllerStateOldLifecycle,
    );

    expect(resultNewSession).toBeNull();
  });

  it("hides context during initial render when auth is unauthenticated", () => {
    const controllerState: StaffOperationalContextState = {
      sessionGeneration: 1,
      response: sampleContextA,
      isLoading: false,
      error: null,
    };

    const result = selectEffectiveOperationalResponse(
      "unauthenticated",
      null,
      2,
      controllerState,
    );

    expect(result).toBeNull();
  });

  it("renders fail-closed (NO_ACTIVE_SHIFT) in React component when session is not loaded", () => {
    const authClient = new StaffAuthClient();

    function TestConsumer() {
      const { resolution, response } = useStaffOperationalContext();
      return (
        <div id="test-output">
          <span>{resolution.kind}</span>
          <span>{response ? "HAS_DATA" : "NO_DATA"}</span>
        </div>
      );
    }

    const html = renderToStaticMarkup(
      <StaffAuthProvider client={authClient}>
        <TestConsumer />
      </StaffAuthProvider>,
    );

    expect(html).toContain("NO_ACTIVE_SHIFT");
    expect(html).toContain("NO_DATA");
  });
});
