import { describe, expect, it } from "vitest";

import {
  classifyCameraStartError,
  evaluateCameraAvailability,
  probeCameraEnvironment,
} from "./camera-environment";

describe("camera environment evaluation (DEC-067 §2)", () => {
  it("reports supported only with mediaDevices AND a secure context", () => {
    expect(
      evaluateCameraAvailability({ hasMediaDevices: true, isSecureContext: true }),
    ).toBe("supported");
  });

  it("reports insecure context truthfully", () => {
    expect(
      evaluateCameraAvailability({
        hasMediaDevices: true,
        isSecureContext: false,
      }),
    ).toBe("insecure-context");
  });

  it("reports unavailable when getUserMedia is missing", () => {
    expect(
      evaluateCameraAvailability({
        hasMediaDevices: false,
        isSecureContext: true,
      }),
    ).toBe("unavailable");
  });

  it("probes the real environment; plain node truthfully lacks a camera", () => {
    const probe = probeCameraEnvironment();
    expect(probe.hasMediaDevices).toBe(false);
    expect(evaluateCameraAvailability(probe)).not.toBe("supported");
  });
});

function namedError(name: string): { name: string } {
  return { name };
}

describe("camera start failure classification", () => {
  it("maps permission failures to denied", () => {
    expect(classifyCameraStartError(namedError("NotAllowedError"))).toBe(
      "denied",
    );
    expect(classifyCameraStartError(namedError("SecurityError"))).toBe(
      "denied",
    );
  });

  it("maps busy/hardware-held failures to busy", () => {
    expect(classifyCameraStartError(namedError("NotReadableError"))).toBe(
      "busy",
    );
    expect(classifyCameraStartError(namedError("OverconstrainedError"))).toBe(
      "busy",
    );
  });

  it("maps missing hardware to no-device", () => {
    expect(classifyCameraStartError(namedError("NotFoundError"))).toBe(
      "no-device",
    );
    expect(classifyCameraStartError(namedError("DevicesNotFoundError"))).toBe(
      "no-device",
    );
  });

  it("fails closed to the generic error state for anything else", () => {
    expect(classifyCameraStartError(new Error("boom"))).toBe("error");
    expect(classifyCameraStartError(undefined)).toBe("error");
    expect(classifyCameraStartError({ name: 42 })).toBe("error");
  });
});
