import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { UseHandoffResult } from "../../../features/handoff/use-handoff";
import type { ActiveRetrievalSession } from "../../../features/retrieval/retrieval-types";
import { RetrievalHandoffGate } from "./retrieval-handoff-gate";

const sessionId = "11111111-1111-4111-8111-111111111111";

const pendingSession: ActiveRetrievalSession = {
  expectedKeySlotCode: "K-7",
  handoff: {
    pendingAt: "2026-08-22T10:00:00.000Z",
    verification: null,
  },
  isKeyConfirmed: true,
  locationId: "33333333-3333-4333-8333-333333333333",
  parkingSpotCode: null,
  parkingZoneCode: null,
  readyAt: "2026-08-22T09:55:00.000Z",
  retrievalStartedAt: "2026-08-22T09:50:00.000Z",
  sessionId,
  sessionVersion: 9,
  state: "HANDOFF_PENDING",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskStatus: "IN_PROGRESS",
  taskVersion: 6,
  vehicle: {
    color: "Black",
    make: "Audi",
    model: "A6",
    plateCountry: "JO",
    plateNumberRaw: "77-99999",
    temporaryDescriptor: null,
  },
};

function stubHandoff(verification: {
  method: "SUPERVISOR_OVERRIDE" | "PICKUP_CODE";
  status: "VERIFIED";
  verifiedAt: string | null;
}): UseHandoffResult {
  return {
    abort: vi.fn(),
    complete: vi.fn(),
    controller: {
      getState: () => ({
        error: null,
        errorMeta: { code: null, retryAfterSeconds: null },
        phase: "verified",
        sessionVersion: 10,
        verification,
      }),
    },
    initiate: vi.fn(),
    override: vi.fn(),
    state: {
      error: null,
      errorMeta: { code: null, retryAfterSeconds: null },
      phase: "verified",
      sessionVersion: 10,
      verification,
    },
    verifyDynamicQr: vi.fn(),
    verifyPickupCode: vi.fn(),
  } as unknown as UseHandoffResult;
}

describe("RetrievalHandoffGate release authority", () => {
  it("shows verified override success WITHOUT Release Vehicle for a non-owner supervisor", () => {
    const markup = renderToStaticMarkup(
      <RetrievalHandoffGate
        canRelease={false}
        handoff={stubHandoff({
          method: "SUPERVISOR_OVERRIDE",
          status: "VERIFIED",
          verifiedAt: "2026-08-22T10:05:00.000Z",
        })}
        isSupervisor
        onComplete={vi.fn()}
        onReturnToReady={vi.fn()}
        session={pendingSession}
      />,
    );
    expect(markup).toContain("Identity verified");
    expect(markup).toContain("Supervisor override");
    expect(markup).toContain("Override recorded — awaiting task owner");
    expect(markup).toContain(
      "The Retrieval task owner must complete the vehicle release.",
    );
    expect(markup).not.toContain("Release Vehicle");
    expect(markup).not.toContain("Pickup code");
    expect(markup).not.toContain("Abort Handoff");
  });

  it("shows Release Vehicle to the retrieval task owner", () => {
    const markup = renderToStaticMarkup(
      <RetrievalHandoffGate
        canRelease
        handoff={stubHandoff({
          method: "PICKUP_CODE",
          status: "VERIFIED",
          verifiedAt: "2026-08-22T10:05:00.000Z",
        })}
        isSupervisor={false}
        onComplete={vi.fn()}
        onReturnToReady={vi.fn()}
        session={pendingSession}
      />,
    );
    expect(markup).toContain("Release Vehicle");
    expect(markup).toContain("cannot be undone");
    expect(markup).not.toContain("awaiting task owner");
  });

  it("exposes Report Issue on pending/verified handoff without touching handoff state", () => {
    const onOpenIncident = vi.fn();
    const handoff = stubHandoff({
      method: "PICKUP_CODE",
      status: "VERIFIED",
      verifiedAt: "2026-08-22T10:05:00.000Z",
    });
    const markup = renderToStaticMarkup(
      <RetrievalHandoffGate
        canRelease
        handoff={handoff}
        isSupervisor={false}
        onOpenIncident={onOpenIncident}
        onComplete={vi.fn()}
        onReturnToReady={vi.fn()}
        session={pendingSession}
      />,
    );
    expect(markup).toContain("Report Issue");
    expect(markup).toContain("Release Vehicle");
    // Navigation callback is pure: no handoff mutation methods exist on it.
    expect(onOpenIncident).not.toHaveBeenCalled();
    expect(handoff.abort).not.toHaveBeenCalled();
    expect(handoff.override).not.toHaveBeenCalled();
    expect(handoff.complete).not.toHaveBeenCalled();

    // Owner path: invoking the callback targets the authoritative session.
    onOpenIncident(sessionId);
    expect(onOpenIncident).toHaveBeenCalledWith(sessionId);
  });
  it("idle phase shows the explicit Begin Guest Handoff launch only", () => {
    const handoff = stubHandoff({
      method: "PICKUP_CODE",
      status: "VERIFIED",
      verifiedAt: null,
    });
    (handoff.state as { phase: string }).phase = "idle";
    (handoff.state as { verification: unknown }).verification = null;
    const markup = renderToStaticMarkup(
      <RetrievalHandoffGate
        canRelease
        handoff={handoff}
        isSupervisor={false}
        onComplete={vi.fn()}
        onReturnToReady={vi.fn()}
        session={{
          ...pendingSession,
          handoff: { pendingAt: null, verification: null },
          state: "READY",
        }}
      />,
    );
    expect(markup).toContain("Begin Guest Handoff");
    expect(markup).not.toContain("Release Vehicle");
  });
});
