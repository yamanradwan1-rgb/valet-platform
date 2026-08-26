import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/connectivity/use-online-status", () => ({
  useOnlineStatus: vi.fn(() => true),
}));

const { useParking } = await import("../../features/parking");

vi.mock("../../features/parking", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/parking")>();
  return { ...actual, useParking: vi.fn() };
});

type SectionProps = {
  expectedKind: string;
  onDecoded: (code: string) => void;
};

const sectionProps: Array<SectionProps & Record<string, unknown>> = [];

vi.mock("../scanner/resource-qr-scan-section", () => ({
  resourceQrScanLabels: vi.fn(() => ({})),
  ResourceQrScanSection: (props: SectionProps) => {
    sectionProps.push(props);
    return <div data-testid="resource-qr-scan-mock" />;
  },
}));

import { ParkingFlow } from "./parking-flow";
import { ParkingKeyReturnStep } from "./parking-key-return-step";
import { ParkingSpotConfirmStep } from "./parking-spot-confirm-step";

function stubbedUseParking(overrides: Record<string, unknown>): {
  confirmParked: ReturnType<typeof vi.fn>;
} {
  const stub = {
    activeSession: null,
    confirmParked: vi.fn(async () => {}),
    error: null,
    isHydrating: false,
    isSubmitting: false,
    retry: vi.fn(async () => {}),
    setStep: vi.fn(),
    step: "in-progress",
    ...overrides,
  };
  vi.mocked(useParking).mockReturnValue(
    stub as unknown as ReturnType<typeof useParking>,
  );
  return { confirmParked: stub.confirmParked };
}

describe("DEC-067 live parking scanner integrations", () => {
  it("live spot step renders the camera scan section beside manual entry", () => {
    sectionProps.length = 0;
    stubbedUseParking({ step: "spot-scan" });
    const markup = renderToStaticMarkup(<ParkingFlow nav={vi.fn()} />);
    expect(markup).toContain("resource-qr-scan-mock");
    expect(markup).toContain("Enter spot code manually");
    expect(sectionProps[0]?.expectedKind).toBe("parking-spot");
  });

  it("an accepted spot decode fills the existing input and flips to confirm view without any mutation", () => {
    sectionProps.length = 0;
    const onChangeSpot = vi.fn();
    const onEnterManually = vi.fn();
    renderToStaticMarkup(
      <ParkingSpotConfirmStep
        destination="Zone North-A"
        mode="live"
        spotScanned={false}
        value=""
        onChangeSpot={onChangeSpot}
        onContinue={vi.fn()}
        onBack={vi.fn()}
        onEnterManually={onEnterManually}
        onRescan={vi.fn()}
      />,
    );
    expect(sectionProps.length).toBe(1);
    const spotProps = sectionProps[0];
    if (spotProps === undefined) throw new Error("scan section not rendered");
    spotProps.onDecoded("P-12");
    expect(onChangeSpot).toHaveBeenCalledWith("P-12");
    expect(onEnterManually).toHaveBeenCalled();
  });

  it("key-return decode fills the existing slot input; Confirm Parked needs its own action", () => {
    sectionProps.length = 0;
    const onChangeKeySlotCode = vi.fn();
    const onConfirm = vi.fn();
    renderToStaticMarkup(
      <ParkingKeyReturnStep
        error={null}
        isOnline={true}
        isSubmitting={false}
        keySlotCodeInput=""
        mode="live"
        onChangeKeySlotCode={onChangeKeySlotCode}
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );
    expect(markupContainsKeySlotSection()).toBe(true);
    const keyProps = sectionProps[0];
    if (keyProps === undefined) throw new Error("scan section not rendered");
    keyProps.onDecoded("K-03");
    expect(onChangeKeySlotCode).toHaveBeenCalledWith("K-03");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("prototype parking steps keep the fake ScannerFrame visuals and simulate buttons", () => {
    sectionProps.length = 0;
    stubbedUseParking({ step: "spot-scan" });
    const markup = renderToStaticMarkup(
      <ParkingFlow nav={vi.fn()} initialSession={null} mode="prototype" />,
    );
    expect(markup).toContain("Scan parking spot QR");
    expect(markup).toContain("Simulate Spot Scan");
    expect(markup).not.toContain("resource-qr-scan-mock");
  });

  it("flow-level decode path performs zero business mutations", () => {
    sectionProps.length = 0;
    const { confirmParked } = stubbedUseParking({ step: "spot-scan" });
    renderToStaticMarkup(<ParkingFlow nav={vi.fn()} />);
    if (sectionProps[0] !== undefined) sectionProps[0].onDecoded("A-9");
    expect(confirmParked).not.toHaveBeenCalled();
  });
});

function markupContainsKeySlotSection(): boolean {
  return sectionProps.some((p) => p.expectedKind === "key-slot");
}
