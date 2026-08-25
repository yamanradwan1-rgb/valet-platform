import { describe, expect, it, vi } from "vitest";

import { parseResourceQr } from "./qr-resource-payload";
import { QrScanSession } from "./qr-scan-session";
import type { CameraEnvironmentProbe } from "./camera-environment";

const SUPPORTED: CameraEnvironmentProbe = {
  hasMediaDevices: true,
  isSecureContext: true,
};

function makeFakeStream() {
  const trackStops = [vi.fn(), vi.fn()];
  const stream = {
    getTracks: () => trackStops.map((stop) => ({ stop })),
  };
  return { stream, trackStops };
}

function makeHarness(
  probe: CameraEnvironmentProbe = SUPPORTED,
  openError?: unknown,
) {
  const { stream, trackStops } = makeFakeStream();
  const decoderStop = vi.fn();
  let deliver: ((text: string) => void) | null = null;
  const phases: string[] = [];
  const failures: string[] = [];
  const rejections: string[] = [];
  const accepted: string[] = [];
  let interpretations = 0;
  let openCalls = 0;

  const session = new QrScanSession<string>({
    interpret: (text) => {
      interpretations += 1;
      const parsed = parseResourceQr(text, "key-slot");
      return parsed.ok
        ? { ok: true, value: parsed.payload.resourceCode }
        : { ok: false, reason: parsed.reason };
    },
    openCamera: async (onText) => {
      openCalls += 1;
      if (openError !== undefined) throw openError;
      deliver = onText;
      return { stop: decoderStop };
    },
    onAccepted: (value) => {
      accepted.push(value);
    },
    onFailure: (state) => {
      failures.push(state);
    },
    onPhase: (phase) => {
      phases.push(phase);
    },
    onRejected: (reason) => {
      rejections.push(reason);
    },
    previewStream: () => stream,
    probeEnvironment: () => probe,
  });

  const emit = (text: string): void => {
    if (deliver === null) throw new Error("camera not open in test");
    deliver(text);
  };

  return {
    accepted,
    decoderStop,
    emit,
    failures,
    getInterpretations: () => interpretations,
    getOpenCalls: () => openCalls,
    phases,
    rejections,
    session,
    trackStops,
  };
}

describe("QrScanSession lifecycle (DEC-067 §3/§6)", () => {
  it("transitions starting -> scanning on a successful open", async () => {
    const h = makeHarness();
    await h.session.begin();
    expect(h.phases).toEqual(["starting", "scanning"]);
    expect(h.session.getPhase()).toBe("scanning");
  });

  it("stops every camera resource on an accepted decode and delivers it once", async () => {
    const h = makeHarness();
    await h.session.begin();
    h.emit("vaylet:key-slot:B-214");
    expect(h.decoderStop).toHaveBeenCalledTimes(1);
    for (const stop of h.trackStops) expect(stop).toHaveBeenCalledTimes(1);
    expect(h.accepted).toEqual(["B-214"]);
    expect(h.session.getPhase()).toBe("idle");
    expect(h.session.isSuppressed()).toBe(true);
  });

  it("suppresses duplicate decodes until the consumer re-arms", async () => {
    const h = makeHarness();
    await h.session.begin();
    h.emit("vaylet:key-slot:B-214");
    h.emit("vaylet:key-slot:B-214");
    h.emit("vaylet:key-slot:C-9");
    expect(h.accepted).toEqual(["B-214"]);
    expect(h.getInterpretations()).toBe(1);
    h.session.armNextScan();
    expect(h.session.isSuppressed()).toBe(false);
  });

  it("rejects wrong-type payloads without touching inputs and dedupes consecutive repeats", async () => {
    const h = makeHarness();
    await h.session.begin();
    h.emit("vaylet:parking-spot:A-1");
    h.emit("vaylet:parking-spot:A-1");
    h.emit("total garbage");
    expect(h.rejections).toEqual(["wrong-type", "unrecognized"]);
    expect(h.accepted).toEqual([]);
    expect(h.decoderStop).not.toHaveBeenCalled();
  });

  it("releases everything on close and allows a fresh reopen", async () => {
    const h = makeHarness();
    await h.session.begin();
    h.emit("vaylet:key-slot:B-214");
    expect(h.decoderStop).toHaveBeenCalledTimes(1);
    h.session.close();
    expect(h.session.getPhase()).toBe("idle");
    expect(h.session.isSuppressed()).toBe(false);
    await h.session.begin();
    expect(h.getOpenCalls()).toBe(2);
    expect(h.phases.filter((p) => p === "starting")).toHaveLength(2);
    h.emit("vaylet:key-slot:C-9");
    expect(h.accepted).toEqual(["B-214", "C-9"]);
    expect(h.decoderStop).toHaveBeenCalledTimes(2);
  });

  it("reports unsupported environments truthfully without opening the camera", async () => {
    for (const probe of [
      { hasMediaDevices: false, isSecureContext: true },
      { hasMediaDevices: true, isSecureContext: false },
    ]) {
      const h = makeHarness(probe);
      await h.session.begin();
      expect(h.failures).toEqual(["unsupported"]);
      expect(h.getOpenCalls()).toBe(0);
      expect(h.session.getPhase()).toBe("idle");
      // Defensive cleanup still runs against any attached preview stream.
      for (const stop of h.trackStops) expect(stop).toHaveBeenCalledTimes(1);
    }
  });

  it("classifies start failures and cleans up before reporting them", async () => {
    const cases: Array<[unknown, string]> = [
      [{ name: "NotAllowedError" }, "denied"],
      [{ name: "NotReadableError" }, "busy"],
      [{ name: "NotFoundError" }, "no-device"],
      [new Error("weird"), "error"],
    ];
    for (const [error, expected] of cases) {
      const h = makeHarness(SUPPORTED, error);
      await h.session.begin();
      expect(h.failures).toEqual([expected]);
      expect(h.session.getPhase()).toBe("idle");
      expect(h.accepted).toEqual([]);
    }
  });

  it("ignores decoded frames when no scan session is active", () => {
    const h = makeHarness();
    expect(() =>
      h.session.handleDecodedText("vaylet:key-slot:B-214"),
    ).not.toThrow();
    expect(h.accepted).toEqual([]);
  });
});
