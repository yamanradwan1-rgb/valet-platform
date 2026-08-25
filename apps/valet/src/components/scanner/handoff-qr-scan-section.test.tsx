import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HandoffQrScanSection } from "./handoff-qr-scan-section";
import { employeeDictionary } from "../../lib/i18n/dictionary";
import { DYNAMIC_QR_PATTERN } from "../../features/handoff/handoff-types";

type CaptureOptions = {
  interpret: (text: string) => { ok: boolean; value?: string; reason?: string };
  onDecoded: (payload: string) => void;
};

let captured: CaptureOptions | null = null;

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

import { useQrScannerCapture } from "../../features/scanner/use-qr-scanner-capture";

// Exactly 43 base64url characters after the prefix.
const RAW_PAYLOAD = `vhq1.${"a".repeat(42)}_`;

describe("HandoffQrScanSection (DEC-067 §5)", () => {
  it("uses the existing dynamic QR pattern for the raw payload shape", () => {
    expect(DYNAMIC_QR_PATTERN.test(RAW_PAYLOAD)).toBe(true);
  });

  it("idle state offers scan plus the always-available manual fallback", () => {
    const t = employeeDictionary("en");
    const markup = renderToStaticMarkup(
      <HandoffQrScanSection onCaptured={() => {}} t={t} />,
    );
    expect(markup).toContain(t.scannerStartScan);
    expect(markup).toContain(t.scannerManualAlwaysAvailable);
  });

  it("accepts a RAW vhq1.* payload byte-exact through the existing pattern", () => {
    renderToStaticMarkup(
      <HandoffQrScanSection
        onCaptured={() => {}}
        t={employeeDictionary("en")}
      />,
    );
    if (captured === null) throw new Error("hook not captured");
    const ok = captured.interpret(RAW_PAYLOAD);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toBe(RAW_PAYLOAD);
  });

  it("rejects anything that is not the existing dynamic handoff format", () => {
    renderToStaticMarkup(
      <HandoffQrScanSection
        onCaptured={() => {}}
        t={employeeDictionary("en")}
      />,
    );
    if (captured === null) throw new Error("hook not captured");
    expect(captured.interpret("").ok).toBe(false);
    expect(captured.interpret("vaylet:key-slot:B-214").ok).toBe(false);
    expect(captured.interpret("vhq1.tooshort").ok).toBe(false);
    // A wrapped payload is never accepted: the raw format is reused exactly.
    expect(captured.interpret(`vaylet:key-slot:${RAW_PAYLOAD}`).ok).toBe(false);
  });

  it("shows a truthful localized message for non-handoff QR codes", () => {
    const t = employeeDictionary("en");
    stubScanner({ rejectionReason: "invalid-format", uiState: "scanning" });
    const markup = renderToStaticMarkup(<HandoffQrScanSection onCaptured={() => {}} t={t} />);
    expect(markup).toContain(t.scannerWrongTypeHandoff);
    expect(markup).not.toContain("invalid-format");
  });

  it("delivers the captured payload to the proof input filler unchanged", () => {
    const onCaptured = vi.fn();
    vi.mocked(useQrScannerCapture).mockImplementation(((options: CaptureOptions) => {
      options.onDecoded(RAW_PAYLOAD);
      return {
        close: vi.fn(),
        rejectionReason: null,
        start: vi.fn(),
        uiState: "idle",
        videoRef: { current: null },
      };
    }) as never);
    renderToStaticMarkup(
      <HandoffQrScanSection
        onCaptured={onCaptured}
        t={employeeDictionary("en")}
      />,
    );
    expect(onCaptured).toHaveBeenCalledTimes(1);
    expect(onCaptured).toHaveBeenCalledWith(RAW_PAYLOAD);
  });
});
