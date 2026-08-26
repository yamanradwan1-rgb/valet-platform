import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ParkingFlow } from "./parking-flow";
import { ParkingSpotConfirmStep } from "./parking-spot-confirm-step";
import type { ActiveParkingSession } from "../../features/parking";
import { employeeDictionary } from "../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "../shell/employee-i18n";
vi.mock("../../lib/connectivity/use-online-status", () => ({
  useOnlineStatus: vi.fn(() => true),
}));

const { useOnlineStatus } = await import(
  "../../lib/connectivity/use-online-status"
);

const { useParking } = await import("../../features/parking");

vi.mock("../../features/parking", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/parking")>();
  return {
    ...actual,
    useParking: vi.fn(),
  };
});

const assignedSession: ActiveParkingSession = {
  keySlotCode: "K-03",
  locationId: "11111111-1111-4111-8111-111111111111",
  parkedAt: null,
  parkingSpotCode: "A-03",
  parkingStartedAt: "2026-08-25T10:00:00.000Z",
  parkingZoneCode: null,
  sessionId: "22222222-2222-4222-8222-222222222222",
  sessionVersion: 3,
  taskId: "33333333-3333-4333-8333-333333333333",
  taskVersion: 4,
  vehicle: {
    color: null,
    make: null,
    model: null,
    plateCountry: null,
    plateNumberRaw: null,
    temporaryDescriptor: null,
  },
};

function stubParking(overrides: Record<string, unknown>) {
  return {
    activeSession: null,
    confirmParked: vi.fn(async () => {}),
    error: null,
    errorCode: null,
    isHydrating: false,
    isSubmitting: false,
    retry: vi.fn(async () => {}),
    setStep: vi.fn(),
    step: "in-progress",
    ...overrides,
  };
}

function stubbedUseParking(overrides: Record<string, unknown>) {
  const stub = stubParking(overrides);
  vi.mocked(useParking).mockReturnValue(
    stub as unknown as ReturnType<typeof useParking>,
  );
  return stub as unknown as {
    confirmParked: (spot: string, keySlot: string) => Promise<void>;
    setStep: (step: string) => void;
  };
}

function renderWith(
  overrides: Record<string, unknown>,
  options: { locale?: "ar" | "en"; online?: boolean } = {},
): string {
  const stub = stubbedUseParking(overrides);
  void stub;
  vi.mocked(useOnlineStatus).mockReturnValue(options.online ?? true);
  const flow = <ParkingFlow nav={vi.fn()} />;
  if (options.locale === undefined) return renderToStaticMarkup(flow);
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={options.locale}>
      {flow}
    </EmployeeI18nProvider>,
  );
}

describe("DEC-068 post-parking key slot binding Employee flow", () => {
  it("keeps the spot step submission-free before key return", () => {
    const stub = stubbedUseParking({
      activeSession: assignedSession,
      step: "spot-scan",
    });
    const markup = renderWith({ activeSession: assignedSession, step: "spot-scan" });
    // VUI-012/DEC-067: live mode offers real camera capture plus manual entry;
    // the step itself stays submission-free.
    expect(markup).toContain("Scan QR code");
    expect(markup).toContain("Enter spot code manually");
    expect(markup).not.toContain("Confirm Parked");
    expect(stub.confirmParked).not.toHaveBeenCalled();
  });

  it("keeps Spot -> Key Return available while offline without any POST", () => {
    const stub = stubbedUseParking({
      activeSession: assignedSession,
      step: "spot-scan",
    });
    const markup = renderToStaticMarkup(
      <ParkingSpotConfirmStep
        destination="Zone North-A"
        spotScanned={true}
        value="A-03"
        onChangeSpot={() => {}}
        onContinue={() => stub.setStep("key-return")}
        onBack={() => {}}
        onEnterManually={() => {}}
        onRescan={() => {}}
      />,
    );
    // Continue stays enabled offline: it is only an in-memory draft action.
    expect(markup).toContain("Continue");
    const continueIdx = markup.indexOf(">Continue</button>");
    expect(continueIdx).toBeGreaterThan(-1);
    const continueTagStart = markup.lastIndexOf("<button", continueIdx);
    const continueButtonMarkup = markup.slice(continueTagStart, continueIdx);
    expect(continueButtonMarkup).not.toContain('disabled=""');
    expect(stub.confirmParked).not.toHaveBeenCalled();
  });

  it("gives the physical free-slot instruction with no assigned-slot framing or prefill", () => {
    const markup = renderWith({
      activeSession: assignedSession,
      step: "key-return",
    });
    // DEC-068 §23: place key into ANY free slot, then scan/enter THAT slot.
    // (Prefix asserted because React SSR-escapes the apostrophe in "slot's".)
    expect(markup).toContain(
      "Place the key into any available free slot",
    );
    expect(markup).toContain("Scan QR code");
    expect(markup).toContain("Enter Key Slot Code");
    // No pre-assigned slot display, no "return to <code>" instruction, and
    // no prefilled code from the session.
    expect(markup).not.toContain("Assigned key slot");
    expect(markup).not.toContain("Return key to");
    expect(markup).not.toContain('value="K-03"');
  });

  it("blocks the final submission truthfully while offline", () => {
    const stub = stubbedUseParking({
      activeSession: assignedSession,
      step: "key-return",
    });
    const markup = renderWith(
      { activeSession: assignedSession, step: "key-return" },
      { online: false },
    );
    expect(markup).toContain(
      "No network connection. Reconnect to refresh and continue.",
    );
    expect(markup).toMatch(/disabled=""/);
    expect(stub.confirmParked).not.toHaveBeenCalled();
  });

  it("uses the accepted Arabic copy for the physical deposit flow", () => {
    const ar = employeeDictionary("ar");
    const markup = renderWith(
      { activeSession: assignedSession, step: "key-return" },
      { locale: "ar" },
    );
    // Physical meaning locked by DEC-068 §23: ضع المفتاح في خانة متاحة /
    // امسح رمز خانة المفتاح / أكد ركن السيارة.
    expect(ar.returnKeyAvailable).toBe(
      "ضع المفتاح في أي خانة فارغة متاحة، ثم امسح رمزها أو أدخل رمز الخانة.",
    );
    expect(ar.scanKeySlot).toBe("امسح رمز خانة المفتاح");
    expect(ar.confirmParked).toBe("تأكيد الإيقاف");
    expect(ar.vehicleParkedAndKeyReturned).toBe("تم صف السيارة وإعادة المفتاح");
    expect(markup).toContain(ar.returnKeyAvailable);
    expect(markup).not.toContain('<bdi dir="ltr">K-03</bdi>');
  });

  it("localizes KEY_CUSTODY_NOT_READY as a calm scan-another-slot retry hint", () => {
    const en = employeeDictionary("en");
    const stub = stubbedUseParking({
      activeSession: assignedSession,
      error: "Key slot is currently occupied by another session.",
      errorCode: "KEY_CUSTODY_NOT_READY",
      step: "key-return",
    });
    const markup = renderWith({
      activeSession: assignedSession,
      error: "Key slot is currently occupied by another session.",
      errorCode: "KEY_CUSTODY_NOT_READY",
      step: "key-return",
    });
    expect(en.keySlotUnavailableRetry).toBe(
      "This key slot is no longer available. Scan another slot.",
    );
    expect(markup).toContain(en.keySlotUnavailableRetry);
    expect(markup).not.toContain(
      "Key slot is currently occupied by another session.",
    );
    expect(stub.confirmParked).not.toHaveBeenCalled();
  });

  it("localizes Key Return operation errors in Arabic instead of raw server text", () => {
    const ar = employeeDictionary("ar");
    const markup = renderWith(
      {
        activeSession: assignedSession,
        error: "Key custody is not ready for parking completion.",
        step: "key-return",
      },
      { locale: "ar" },
    );
    expect(markup).toContain(ar.operationFailed);
    expect(markup).not.toContain(
      "Key custody is not ready for parking completion.",
    );
  });

  it("shows the combined success copy after confirmation", () => {
    const markup = renderWith({
      activeSession: {
        ...assignedSession,
        parkedAt: "2026-08-25T10:05:00.000Z",
        parkingZoneCode: "North-A",
        sessionVersion: 4,
        taskVersion: 5,
      },
      step: "success",
    });
    expect(markup).toContain("Vehicle parked and key returned");
  });
});
