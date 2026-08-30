import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EmployeeI18nProvider } from "../../shell/employee-i18n";
import { employeeDictionary } from "../../../lib/i18n/dictionary";
import { CheckInPlateCameraStep } from "./check-in-plate-camera-step";

const cameraActions = {
  capture: vi.fn(),
  close: vi.fn(),
  retake: vi.fn(),
  start: vi.fn(),
};
let cameraState = "idle";

vi.mock("../../../features/plate-camera/use-plate-camera", () => ({
  usePlateCamera: vi.fn(() => ({
    ...cameraActions,
    canvasRef: { current: null },
    state: cameraState,
    videoRef: { current: null },
  })),
}));

function renderStep(locale: "en" | "ar" = "en"): string {
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={locale}>
      <CheckInPlateCameraStep
        identityKey="member:location"
        onBack={vi.fn()}
        onChangePlateCountry={vi.fn()}
        onChangePlateNumber={vi.fn()}
        onContinue={vi.fn()}
        onManualEntry={vi.fn()}
        onNoPlate={vi.fn()}
        plateCountry="JO"
        plateNumber="12-34567"
      />
    </EmployeeI18nProvider>,
  );
}

beforeEach(() => {
  cameraState = "idle";
  vi.clearAllMocks();
});

describe("CheckInPlateCameraStep", () => {
  it("keeps real camera, manual entry, and no-plate actions available", () => {
    const t = employeeDictionary("en");
    const markup = renderStep();
    expect(markup).toContain(t.plateCameraOpen);
    expect(markup).toContain(t.enterManually);
    expect(markup).toContain(t.noPlateUnreadable);
    expect(markup).not.toContain(t.simulatePlate);
  });

  it("shows a live preview and capture action without an OCR claim", () => {
    const t = employeeDictionary("en");
    cameraState = "preview";
    const markup = renderStep();
    expect(markup).toContain("<video");
    expect(markup).toContain(t.plateCameraCapture);
    expect(markup).toContain(t.plateCameraClose);
    expect(markup).not.toContain(t.plateDetected);
    expect(markup).not.toContain(t.detected);
  });

  it("keeps the frozen frame beside LTR manual confirmation fields", () => {
    const t = employeeDictionary("en");
    cameraState = "captured";
    const markup = renderStep();
    expect(markup).toContain("<canvas");
    expect(markup).toContain(t.plateCameraCapturedHint);
    expect(markup).toContain(t.plateCameraRetake);
    expect(markup).toContain('value="12-34567"');
    expect(markup).toContain('dir="ltr"');
    expect(markup).toContain(t.noPlateUnreadable);
    expect(markup).not.toContain(t.highConfidence);
  });

  it.each([
    ["denied", "plateCameraPermissionDenied"],
    ["insecure-context", "plateCameraInsecureContext"],
    ["unavailable", "plateCameraUnavailable"],
    ["busy", "plateCameraBusy"],
    ["no-device", "plateCameraNoDevice"],
    ["error", "plateCameraError"],
  ] as const)("renders truthful %s fallback copy", (state, key) => {
    const t = employeeDictionary("en");
    cameraState = state;
    const markup = renderStep();
    expect(markup).toContain(t[key]);
    expect(markup).toContain(t.enterManually);
    expect(markup).toContain(t.plateCameraClose);
  });

  it("renders Arabic camera copy while plate input remains LTR", () => {
    const t = employeeDictionary("ar");
    cameraState = "captured";
    const markup = renderStep("ar");
    expect(markup).toContain(t.plateCameraCapturedHint);
    expect(markup).toContain(t.plateCameraRetake);
    expect(markup).toContain('dir="ltr"');
  });
});
