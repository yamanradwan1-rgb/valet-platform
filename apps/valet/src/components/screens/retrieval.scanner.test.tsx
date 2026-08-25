import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type ResourceSectionProps = {
  expectedKind: string;
  onDecoded: (code: string) => void;
};
type HandoffSectionProps = { onCaptured: (payload: string) => void };

const resourceSectionProps: ResourceSectionProps[] = [];
const handoffSectionProps: HandoffSectionProps[] = [];

vi.mock("../scanner/resource-qr-scan-section", () => ({
  resourceQrScanLabels: vi.fn(() => ({})),
  ResourceQrScanSection: (props: ResourceSectionProps) => {
    resourceSectionProps.push(props);
    return <div data-testid="resource-qr-scan-mock" />;
  },
}));

vi.mock("../scanner/handoff-qr-scan-section", () => ({
  HandoffQrScanSection: (props: HandoffSectionProps) => {
    handoffSectionProps.push(props);
    return <div data-testid="handoff-qr-scan-mock" />;
  },
}));

import { LiveRetrievalKeyCheckoutStep } from "./retrieval/retrieval-live-steps";
import {
  LiveHandoffPendingStep,
} from "./retrieval/retrieval-handoff-live-steps";

describe("DEC-067 retrieval key checkout scanner", () => {
  it("renders camera capture above the existing manual input before key confirmation", () => {
    resourceSectionProps.length = 0;
    const onConfirmKey = vi.fn();
    const onStartRetrieval = vi.fn();
    const markup = renderToStaticMarkup(
      <LiveRetrievalKeyCheckoutStep
        expectedKey="K-03"
        isKeyConfirmed={false}
        isSubmitting={false}
        error={null}
        vehicleInfo="Toyota Corolla"
        parkingLocation={null}
        onConfirmKey={onConfirmKey}
        onStartRetrieval={onStartRetrieval}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("resource-qr-scan-mock");
    expect(markup).toContain("Enter Key Slot Code");
    expect(resourceSectionProps[0]?.expectedKind).toBe("key-slot");
  });

  it("an accepted decode fills the input only; key verification stays explicit", () => {
    resourceSectionProps.length = 0;
    const onConfirmKey = vi.fn();
    const onStartRetrieval = vi.fn();
    renderToStaticMarkup(
      <LiveRetrievalKeyCheckoutStep
        expectedKey="K-03"
        isKeyConfirmed={false}
        isSubmitting={false}
        error={null}
        vehicleInfo="Toyota Corolla"
        parkingLocation={null}
        onConfirmKey={onConfirmKey}
        onStartRetrieval={onStartRetrieval}
        onBack={vi.fn()}
      />,
    );
    const checkoutProps = resourceSectionProps[0];
    if (checkoutProps === undefined) {
      throw new Error("scan section not rendered");
    }
    checkoutProps.onDecoded("K-03");
    expect(onConfirmKey).not.toHaveBeenCalled();
    expect(onStartRetrieval).not.toHaveBeenCalled();
  });
});

describe("DEC-067 handoff dynamic QR capture (HANDOFF_PENDING)", () => {
  function renderPending(): {
    onVerifyQrPayload: ReturnType<typeof vi.fn>;
    onVerifyPickupCode: ReturnType<typeof vi.fn>;
    markup: string;
  } {
    resourceSectionProps.length = 0;
    handoffSectionProps.length = 0;
    const onVerifyQrPayload = vi.fn();
    const onVerifyPickupCode = vi.fn();
    const markup = renderToStaticMarkup(
      <LiveHandoffPendingStep
        abortError={null}
        error={null}
        isMutating={false}
        isSupervisor={false}
        onAbort={vi.fn()}
        onOverride={vi.fn()}
        onVerifyPickupCode={onVerifyPickupCode}
        onVerifyQrPayload={onVerifyQrPayload}
        retryAfterSeconds={null}
        vehicleInfo="Toyota Corolla"
      />,
    );
    return { markup, onVerifyPickupCode, onVerifyQrPayload };
  }

  it("offers raw vhq1.* capture beside the untouched manual proof inputs", () => {
    const { markup } = renderPending();
    expect(markup).toContain("handoff-qr-scan-mock");
    expect(markup).toContain("vhq1.…");
    expect(markup).toContain("0000");
    expect(markup).toContain("Verify QR");
    expect(markup).toContain("Verify Code");
  });

  it("a captured payload fills the proof input path but NEVER verifies locally", () => {
    const { onVerifyQrPayload, onVerifyPickupCode } = renderPending();
    const handoffProps = handoffSectionProps[0];
    if (handoffProps === undefined) {
      throw new Error("handoff scan section not rendered");
    }
    handoffProps.onCaptured("vhq1.abcABC123_-".padEnd(48, "x"));
    expect(onVerifyQrPayload).not.toHaveBeenCalled();
    expect(onVerifyPickupCode).not.toHaveBeenCalled();
  });
});
