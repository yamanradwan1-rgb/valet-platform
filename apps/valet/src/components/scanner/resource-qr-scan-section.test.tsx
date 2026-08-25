import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ResourceQrScanSection,
  resourceQrScanLabels,
} from "./resource-qr-scan-section";
import { employeeDictionary } from "../../lib/i18n/dictionary";

type CaptureOptions = {
  interpret: (text: string) => { ok: boolean; value?: string; reason?: string };
  onDecoded: (code: string) => void;
};

let captured: CaptureOptions | null = null;

vi.mock("../../features/scanner/use-qr-scanner-capture", () => ({
  useQrScannerCapture: vi.fn((options: CaptureOptions) => {
    captured = options;
    return {
      close: vi.fn(),
      rejectionReason: null,
      start: vi.fn(),
      uiState: "idle",
      videoRef: { current: null },
    };
  }),
}));

const { useQrScannerCapture } = await import(
  "../../features/scanner/use-qr-scanner-capture"
);

function stubScanner(overrides: Record<string, unknown>): void {
  vi.mocked(useQrScannerCapture).mockImplementation(((options: CaptureOptions) => {
    captured = options;
    return {
      close: vi.fn(),
      rejectionReason: null,
      start: vi.fn(),
      uiState: "idle",
      videoRef: { current: null },
      ...overrides,
    };
  }) as never);
}

function renderSection(
  kind: "key-slot" | "parking-spot" = "key-slot",
): string {
  const t = employeeDictionary("en");
  return renderToStaticMarkup(
    <ResourceQrScanSection
      expectedKind={kind}
      labels={resourceQrScanLabels(t, kind)}
      onDecoded={() => {}}
    />,
  );
}

describe("ResourceQrScanSection (DEC-067 §2/§6/§7)", () => {
  it("idle state shows the localized scan action and the manual fallback hint", () => {
    const t = employeeDictionary("en");
    const markup = renderSection();
    expect(markup).toContain(t.scannerStartScan);
    expect(markup).toContain("qr-scan-start");
    expect(markup).toContain(t.scannerManualAlwaysAvailable);
  });

  it("scanning state shows live preview, large Close control and hint", () => {
    const t = employeeDictionary("en");
    stubScanner({ uiState: "scanning" });
    const markup = renderSection();
    expect(markup).toContain("<video");
    expect(markup).toContain(t.scannerCloseScanner);
    expect(markup).toContain(t.scannerScanningHint);
    expect(markup).toContain(t.scannerManualAlwaysAvailable);
  });

  it("maps every failure state to its own truthful localized message", () => {
    const t = employeeDictionary("en");
    const cases: Array<[string, string]> = [
      ["unsupported", t.scannerCameraUnavailable],
      ["denied", t.scannerCameraPermissionDenied],
      ["busy", t.scannerCameraBusy],
      ["no-device", t.scannerNoCameraFound],
      ["error", t.scannerCameraError],
    ];
    for (const [uiState, message] of cases) {
      stubScanner({ uiState });
      const markup = renderSection();
      expect(markup).toContain(message);
      // Manual fallback stays operable in every failure state.
      expect(markup).toContain(t.scannerManualAlwaysAvailable);
      expect(markup).toContain(t.scannerCloseScanner);
    }
  });

  it("shows the friendly wrong-type message and never a raw reason code", () => {
    const t = employeeDictionary("en");
    stubScanner({ rejectionReason: "wrong-type", uiState: "scanning" });
    const spotMarkup = renderSection("parking-spot");
    expect(spotMarkup).toContain(t.scannerWrongTypeParkingSpot);
    expect(spotMarkup).not.toContain("wrong-type");
    const keyMarkup = renderSection("key-slot");
    expect(keyMarkup).toContain(t.scannerWrongTypeKeySlot);
  });

  it("shows the unreadable message for garbage payloads", () => {
    const t = employeeDictionary("en");
    stubScanner({ rejectionReason: "unrecognized", uiState: "scanning" });
    expect(renderSection()).toContain(t.scannerUnreadableQr);
  });

  it("wires the strict parser through interpret with byte-exact codes", () => {
    renderSection("key-slot");
    if (captured === null) throw new Error("hook not captured");
    const ok = captured.interpret("vaylet:key-slot:k-Ab_07.x");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toBe("k-Ab_07.x");
    expect(captured.interpret("vaylet:parking-spot:A-1").ok).toBe(false);
    expect(captured.interpret("https://x.example").ok).toBe(false);
  });

  it("delivers accepted decodes to the consumer exactly once per frame", () => {
    const onDecoded = vi.fn();
    vi.mocked(useQrScannerCapture).mockImplementation(((options: CaptureOptions) => {
      options.onDecoded("P-12");
      return {
        close: vi.fn(),
        rejectionReason: null,
        start: vi.fn(),
        uiState: "idle",
        videoRef: { current: null },
      };
    }) as never);
    renderToStaticMarkup(
      <ResourceQrScanSection
        expectedKind="parking-spot"
        labels={resourceQrScanLabels(employeeDictionary("en"), "parking-spot")}
        onDecoded={onDecoded}
      />,
    );
    expect(onDecoded).toHaveBeenCalledTimes(1);
    expect(onDecoded).toHaveBeenCalledWith("P-12");
  });
});
