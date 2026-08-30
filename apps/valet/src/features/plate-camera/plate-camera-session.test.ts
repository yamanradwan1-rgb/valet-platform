import { describe, expect, it, vi } from "vitest";

import type { CameraEnvironmentProbe } from "../scanner/camera-environment";
import { PlateCameraSession } from "./plate-camera-session";

const SUPPORTED: CameraEnvironmentProbe = {
  hasMediaDevices: true,
  isSecureContext: true,
};

function frameTargets() {
  const drawImage = vi.fn();
  const clearRect = vi.fn();
  const canvas = {
    getContext: () => ({ clearRect, drawImage }),
    height: 0,
    width: 0,
  } as unknown as HTMLCanvasElement;
  const video = {
    srcObject: null,
    videoHeight: 600,
    videoWidth: 800,
  } as unknown as HTMLVideoElement;
  return { canvas, clearRect, drawImage, video };
}

function streamWithStops(count = 2) {
  const stops = Array.from({ length: count }, () => vi.fn<() => void>());
  const stream = {
    getTracks: () => stops.map((stop) => ({ stop })),
  } as unknown as MediaStream;
  return { stops, stream };
}

describe("PlateCameraSession", () => {
  it("captures one frame, stops every track immediately, then clears on close", async () => {
    const states: string[] = [];
    const { stops, stream } = streamWithStops();
    const target = frameTargets();
    const session = new PlateCameraSession({
      onState: (state) => states.push(state),
      openCamera: async (video) => {
        video.srcObject = stream;
        return stream;
      },
      probeEnvironment: () => SUPPORTED,
    });

    expect(session.getPhase()).toBe("idle");
    await session.begin(target.video);
    expect(states).toEqual(["starting", "preview"]);
    session.capture(target.video, target.canvas);

    expect(target.drawImage).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["starting", "preview", "captured"]);
    expect(session.getPhase()).toBe("captured");
    for (const stop of stops) expect(stop).toHaveBeenCalledTimes(1);
    expect(target.video.srcObject).toBeNull();

    session.close();
    expect(target.clearRect).toHaveBeenLastCalledWith(0, 0, 800, 600);
    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
    for (const stop of stops) expect(stop).toHaveBeenCalledTimes(1);
  });

  it("retake uses a fresh stream while the old stream remains stopped", async () => {
    const first = streamWithStops(1);
    const second = streamWithStops(1);
    const streams = [first.stream, second.stream];
    const target = frameTargets();
    const openCamera = vi.fn(async (video: HTMLVideoElement) => {
      const stream = streams.shift();
      if (stream === undefined) throw new Error("missing stream");
      video.srcObject = stream;
      return stream;
    });
    const session = new PlateCameraSession({
      onState: vi.fn(), openCamera, probeEnvironment: () => SUPPORTED,
    });

    await session.begin(target.video);
    session.capture(target.video, target.canvas);
    session.close();
    await session.begin(target.video);

    expect(openCamera).toHaveBeenCalledTimes(2);
    expect(first.stops[0]).toHaveBeenCalledTimes(1);
    expect(second.stops[0]).not.toHaveBeenCalled();
    expect(session.getPhase()).toBe("preview");
  });

  it("neutralizes a stream that resolves after close", async () => {
    let resolveOpen!: (stream: MediaStream) => void;
    const opening = new Promise<MediaStream>((resolve) => { resolveOpen = resolve; });
    const { stops, stream } = streamWithStops();
    const target = frameTargets();
    const states: string[] = [];
    const session = new PlateCameraSession({
      onState: (state) => states.push(state),
      openCamera: () => opening,
      probeEnvironment: () => SUPPORTED,
    });

    const pending = session.begin(target.video);
    session.close();
    resolveOpen(stream);
    await pending;

    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(session.getPhase()).toBe("idle");
    expect(states).toEqual(["starting", "idle"]);
    expect(states).not.toContain("preview");
  });

  it.each([
    [{ hasMediaDevices: false, isSecureContext: true }, "unavailable"],
    [{ hasMediaDevices: true, isSecureContext: false }, "insecure-context"],
    [{ hasMediaDevices: false, isSecureContext: false }, "insecure-context"],
  ] as const)("reports environment %j as %s", async (probe, failure) => {
    const states: string[] = [];
    const openCamera = vi.fn();
    const session = new PlateCameraSession({
      onState: (state) => states.push(state), openCamera,
      probeEnvironment: () => probe,
    });
    await session.begin(frameTargets().video);
    expect(states).toEqual(["starting", failure]);
    expect(openCamera).not.toHaveBeenCalled();
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["NotFoundError", "no-device"],
    ["NotReadableError", "busy"],
    ["UnknownError", "error"],
  ])("maps %s startup errors to %s without retaining a stream", async (name, failure) => {
    const states: string[] = [];
    const session = new PlateCameraSession({
      onState: (state) => states.push(state),
      openCamera: async () => { throw { name }; },
      probeEnvironment: () => SUPPORTED,
    });
    await session.begin(frameTargets().video);
    expect(states).toEqual(["starting", failure]);
    expect(session.getPhase()).toBe("idle");
  });
});
