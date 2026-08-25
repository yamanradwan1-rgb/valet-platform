import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

import { CheckInKeyScanStep } from "./check-in/check-in-key-steps";

describe("DEC-067 live Check-In key assignment scanner", () => {
  it("live key scan step offers camera capture beside manual entry", () => {
    sectionProps.length = 0;
    const markup = renderToStaticMarkup(
      <CheckInKeyScanStep
        mode="live"
        keyScanDone={false}
        keySlotCode=""
        isSubmitting={false}
        error={null}
        onChangeKeySlotCode={vi.fn()}
        onManualEntry={vi.fn()}
        onAssignKey={vi.fn()}
        onScanAnother={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("resource-qr-scan-mock");
    expect(markup).toContain("Enter key slot manually");
    expect(sectionProps[0]?.expectedKind).toBe("key-slot");
  });

  it("an accepted decode fills the existing input and reveals it; Assign Key stays the only mutation", () => {
    sectionProps.length = 0;
    const onChangeKeySlotCode = vi.fn();
    const onManualEntry = vi.fn();
    const onAssignKey = vi.fn();
    renderToStaticMarkup(
      <CheckInKeyScanStep
        mode="live"
        keyScanDone={false}
        keySlotCode=""
        isSubmitting={false}
        error={null}
        onChangeKeySlotCode={onChangeKeySlotCode}
        onManualEntry={onManualEntry}
        onAssignKey={onAssignKey}
        onScanAnother={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const scanProps = sectionProps[0];
    if (scanProps === undefined) throw new Error("scan section not rendered");
    scanProps.onDecoded("B-214");
    expect(onChangeKeySlotCode).toHaveBeenCalledWith("B-214");
    expect(onManualEntry).toHaveBeenCalled();
    expect(onAssignKey).not.toHaveBeenCalled();
  });

  it("the revealed manual input shows the captured code with Assign enabled", () => {
    sectionProps.length = 0;
    const markup = renderToStaticMarkup(
      <CheckInKeyScanStep
        mode="live"
        keyScanDone={true}
        keySlotCode="B-214"
        isSubmitting={false}
        error={null}
        onChangeKeySlotCode={vi.fn()}
        onManualEntry={vi.fn()}
        onAssignKey={vi.fn()}
        onScanAnother={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain('value="B-214"');
    expect(markup).not.toContain("resource-qr-scan-mock");
    expect(markup).toContain("Assign Key");
  });

  it("prototype mode keeps the fake ScannerFrame and simulate button untouched", () => {
    sectionProps.length = 0;
    const markup = renderToStaticMarkup(
      <CheckInKeyScanStep
        mode="prototype"
        keyScanDone={false}
        keySlotCode=""
        isSubmitting={false}
        error={null}
        onChangeKeySlotCode={vi.fn()}
        onSimulateScan={vi.fn()}
        onManualEntry={vi.fn()}
        onAssignKey={vi.fn()}
        onScanAnother={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("Scan key slot QR");
    expect(markup).toContain("Simulate Key QR Scan");
    expect(markup).not.toContain("resource-qr-scan-mock");
  });
});
