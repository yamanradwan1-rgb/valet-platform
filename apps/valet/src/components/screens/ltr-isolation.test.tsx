import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { IncidentLiveForm } from "./incident-live-form";
import {
  LiveHandoffPendingStep,
} from "./retrieval/retrieval-handoff-live-steps";

describe("LTR isolation for direction-sensitive values", () => {
  const detail = {
    checkIn: { conditionCompletedAt: null },
    guestAccess: {
      expiresAt: null,
      revokedAt: null,
      status: "NOT_ISSUED" as const,
    },
    handoff: {
      pendingAt: "2026-08-22T10:00:00.000Z",
      verification: null,
    },
    keySlot: null,
    locationId: "33333333-3333-4333-8333-333333333333",
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: null,
      parkingZoneCode: null,
    },
    sessionId: "11111111-1111-4111-8111-111111111111",
    state: "HANDOFF_PENDING" as const,
    vehicle: {
      color: "Black",
      make: "Audi",
      model: "A6",
      plateCountry: "JO",
      plateNumberRaw: "77-99999",
      temporaryDescriptor: null,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-22T09:00:00.000Z",
    },
    version: 9,
  };

  it("incident form wraps vehicle identity in bdi for LTR isolation", () => {
    const markup = renderToStaticMarkup(
      <IncidentLiveForm
        detail={detail}
        onSubmit={vi.fn()}
        state={{
          error: null,
          phase: "idle" as const,
          report: null,
        }}
      />,
    );
    expect(markup).toContain('<bdi dir="ltr">');
    expect(markup).toContain("77-99999");
  });

  it("handoff pending step wraps vehicle and key in bdi for LTR isolation", () => {
    const markup = renderToStaticMarkup(
      <LiveHandoffPendingStep
        abortError={null}
        error={null}
        isMutating={false}
        isSupervisor={false}
        onAbort={vi.fn()}
        onOpenIncident={vi.fn()}
        onOverride={vi.fn()}
        onVerifyPickupCode={vi.fn()}
        onVerifyQrPayload={vi.fn()}
        retryAfterSeconds={null}
        vehicleInfo="Audi A6 · 77-99999"
      />,
    );
    expect(markup).toContain('<bdi dir="ltr">');
    expect(markup).toContain("77-99999");
    // Pickup code input preserves leading zeros logically.
    expect(markup).toContain('maxLength="4"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('dir="ltr"');
  });
});
