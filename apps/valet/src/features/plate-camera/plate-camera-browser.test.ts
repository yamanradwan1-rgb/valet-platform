import { afterEach, describe, expect, it, vi } from "vitest";

import {
  capturePlateFrame,
  clearPlateFrame,
  openPlateCamera,
  PLATE_CAMERA_CONSTRAINTS,
} from "./plate-camera-browser";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("plate camera browser boundary", () => {
  it("requests a non-fatal rear preference with video only", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    const play = vi.fn(async () => undefined);
    const video = { play, srcObject: null } as unknown as HTMLVideoElement;

    await expect(
      openPlateCamera(video, { getUserMedia }),
    ).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    expect(PLATE_CAMERA_CONSTRAINTS).toEqual({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    expect(video.srcObject).toBe(stream);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("stops the acquired stream if preview playback fails", async () => {
    const stop = vi.fn<() => void>();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    const video = {
      play: vi.fn(async () => { throw new Error("play failed"); }),
      srcObject: null,
    } as unknown as HTMLVideoElement;

    await expect(
      openPlateCamera(video, { getUserMedia: async () => stream }),
    ).rejects.toThrow("play failed");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it("copies exactly one displayed frame and clears the pixel buffer", () => {
    const drawImage = vi.fn();
    const clearRect = vi.fn();
    const canvas = {
      getContext: () => ({ clearRect, drawImage }),
      height: 0,
      width: 0,
    } as unknown as HTMLCanvasElement;
    const video = {
      videoHeight: 720,
      videoWidth: 1280,
    } as HTMLVideoElement;

    capturePlateFrame(video, canvas);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);

    clearPlateFrame(canvas);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 1280, 720);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("captures without network, storage, or object-URL side effects", () => {
    const fetch = vi.fn();
    const setItem = vi.fn();
    const createObjectURL = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", { setItem });
    vi.stubGlobal("URL", { createObjectURL });
    const canvas = {
      getContext: () => ({ drawImage: vi.fn() }),
      height: 0,
      width: 0,
    } as unknown as HTMLCanvasElement;
    const video = {
      videoHeight: 480,
      videoWidth: 640,
    } as HTMLVideoElement;

    capturePlateFrame(video, canvas);

    expect(fetch).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
