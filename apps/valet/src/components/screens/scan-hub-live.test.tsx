import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StartParkingPayload } from "../../features/check-in";
import { employeeDictionary } from "../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "../shell/employee-i18n";
import type {
  ActiveParkingTarget,
  ActiveRetrievalTarget,
} from "../shell/employee-workspace";
import { ScanHubLive } from "./scan-hub-live";

const PARKING_TARGET: ActiveParkingTarget = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskVersion: 3,
};

const PARKING_PAYLOAD: StartParkingPayload = {
  keySlotCode: "K-07",
  locationId: "33333333-3333-4333-8333-333333333333",
  parkingStartedAt: "2026-08-25T10:00:00.000Z",
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
  currentAssigneeMembershipId: null,
  sessionId: "77777777-7777-4777-8777-777777777777",
  taskId: "88888888-8888-4888-8888-888888888888",
  taskStatus: "ACCEPTED",
  taskVersion: 2,
};

function renderHub(
  options: {
    locale?: "ar" | "en";
    parkingPayload?: StartParkingPayload | null;
    parkingTarget?: ActiveParkingTarget | null;
    retrievalTarget?: ActiveRetrievalTarget | null;
  } = {},
): string {
  const hub = (
    <ScanHubLive
      nav={() => undefined}
      parkingPayload={options.parkingPayload ?? null}
      parkingTarget={options.parkingTarget ?? null}
      retrievalTarget={options.retrievalTarget ?? null}
    />
  );
  if (options.locale === undefined) return renderToStaticMarkup(hub);
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={options.locale}>
      {hub}
    </EmployeeI18nProvider>,
  );
}

/** Extracts one rendered <button …> element whose content contains `label`. */
function buttonTagFor(markup: string, label: string): string {
  const parts = markup.split("<button");
  const part = parts.find((candidate) => candidate.includes(label));
  expect(part).toBeDefined();
  return `<button${part ?? ""}`;
}

describe("DEC-066 §5 context-aware Scan Hub (VUI-011B)", () => {
  it("renders the truthful Live launcher with no prototype or camera copy", () => {
    const markup = renderHub();
    expect(markup).toContain("Scan");
    expect(markup).toContain("Choose how to continue");
    // Prototype strings never leak into Live mode.
    expect(markup).not.toContain("Check-in new vehicle");
    expect(markup).not.toContain("Key QR");
    expect(markup).not.toContain("Assign or verify a key");
    expect(markup).not.toContain("Pickup QR");
    expect(markup).not.toContain("Verify guest at handoff");
    expect(markup).not.toContain("Confirm parking location");
    expect(markup).not.toContain("Select what to scan");
    // No camera/fake-scanner affordance exists in this slice.
    expect(/camera|scanner|getUserMedia|BarcodeDetector/i.test(markup)).toBe(
      false,
    );
    expect(/Simulate/.test(markup)).toBe(false);
  });

  it("starts with only License Plate actionable; other tiles state truthful reasons", () => {
    const markup = renderHub();
    expect(buttonTagFor(markup, "License Plate")).not.toContain('disabled=""');
    expect(buttonTagFor(markup, "License Plate")).toContain(
      "Check in a new vehicle",
    );

    const keyTag = buttonTagFor(markup, "Key slot");
    expect(keyTag).toContain('disabled=""');
    expect(keyTag).toContain("Open the vehicle workflow first.");

    const parkingTag = buttonTagFor(markup, "Parking Spot");
    expect(parkingTag).toContain('disabled=""');
    expect(parkingTag).toContain("Open an active parking task first.");

    const handoffTag = buttonTagFor(markup, "Pickup Handoff");
    expect(handoffTag).toContain('disabled=""');
    expect(handoffTag).toContain("Open an active retrieval task first.");
  });

  it("unlocks Parking Spot exactly when existing parking context is held", () => {
    const byTarget = renderHub({ parkingTarget: PARKING_TARGET });
    const targetTag = buttonTagFor(byTarget, "Parking Spot");
    expect(targetTag).not.toContain('disabled=""');
    expect(targetTag).toContain("Resume active parking");

    const byPayload = renderHub({ parkingPayload: PARKING_PAYLOAD });
    expect(buttonTagFor(byPayload, "Parking Spot")).not.toContain(
      'disabled=""',
    );
  });

  it("unlocks Pickup/Handoff only via the retrieval target, independently of Parking", () => {
    const markup = renderHub({ retrievalTarget: RETRIEVAL_TARGET });
    const handoffTag = buttonTagFor(markup, "Pickup Handoff");
    expect(handoffTag).not.toContain('disabled=""');
    expect(handoffTag).toContain("Resume active retrieval");
    // Parking stays locked: one context kind never unlocks another tile.
    expect(buttonTagFor(markup, "Parking Spot")).toContain('disabled=""');
  });

  it("never renders raw operational identifiers on the hub itself", () => {
    const markup = renderHub({
      parkingTarget: PARKING_TARGET,
      retrievalTarget: RETRIEVAL_TARGET,
    });
    expect(markup).not.toContain(PARKING_TARGET.sessionId);
    expect(markup).not.toContain(PARKING_TARGET.taskId);
    expect(markup).not.toContain(RETRIEVAL_TARGET.sessionId);
    expect(markup).not.toContain("K-07");
    expect(markup).not.toContain("12-34567");
  });

  it("renders localized Arabic copy for every tile and reason", () => {
    const ar = employeeDictionary("ar");
    const markup = renderHub({ locale: "ar" });
    expect(markup).toContain(ar.scanNav);
    expect(markup).toContain(ar.scanHubSubtitle);
    expect(markup).toContain(ar.licensePlate);
    expect(markup).toContain(ar.scanHubLicensePlateSub);
    expect(markup).toContain(ar.keySlot);
    expect(markup).toContain(ar.parkingSpot);
    expect(markup).toContain(ar.scanHubPickupLabel);
    expect(markup).toContain(ar.scanHubKeySlotDisabled);
    expect(markup).toContain(ar.scanHubParkingDisabled);
    expect(markup).toContain(ar.scanHubRetrievalDisabled);
  });

  it("shows Arabic resume copy once contextual targets exist", () => {
    const ar = employeeDictionary("ar");
    const markup = renderHub({
      locale: "ar",
      parkingTarget: PARKING_TARGET,
      retrievalTarget: RETRIEVAL_TARGET,
    });
    expect(markup).toContain(ar.scanHubParkingResume);
    expect(markup).toContain(ar.scanHubRetrievalResume);
    expect(markup).not.toContain(ar.scanHubParkingDisabled);
    expect(markup).not.toContain(ar.scanHubRetrievalDisabled);
  });
});
