import { describe, expect, it, vi } from "vitest";
import type { CameraView } from "expo-camera";
import {
  capturePlateRoi,
  type PlateRoiCapturePorts,
} from "../src/check-in/native-plate-roi-capture";
import {
  roiGeometry,
  roiPicture,
  roiPreview,
} from "./native-plate-roi-test-fixture";

function setup(sizes = [100]) {
  const signal = new AbortController();
  let current = true;
  const events: string[] = [];
  const image = {
    save: vi.fn(async (quality: number) => {
      events.push(`save:${quality}`);
      return { uri: `roi-${quality}`, width: 692, height: 216 };
    }),
    release: vi.fn(() => {
      events.push("release");
    }),
  };
  const camera = { takePictureAsync: vi.fn(async () => roiPicture("source")) };
  const ports: PlateRoiCapturePorts = {
    camera: camera as unknown as CameraView,
    geometry: roiGeometry,
    preview: roiPreview,
    current: () => current,
    render: vi.fn(async () => {
      events.push("render");
      return image;
    }),
    inspect: vi.fn(() => ({
      exists: true,
      size: sizes[
        Math.min(image.save.mock.calls.length - 1, sizes.length - 1)
      ]!,
    })),
    remove: vi.fn(async (uri) => {
      events.push(`delete:${uri}`);
    }),
  };
  const capture = () => capturePlateRoi(ports, signal.signal);
  return {
    capture,
    ports,
    camera,
    image,
    events,
    signal,
    stale: () => {
      current = false;
    },
  };
}
describe("ROI-only capture ownership", () => {
  it("captures quality 1 once, crops once, deletes the source before handing off ROI", async () => {
    const c = setup();
    expect(await c.capture()).toBe("roi-0.6");
    expect(c.camera.takePictureAsync).toHaveBeenCalledExactlyOnceWith({
      quality: 1,
      skipProcessing: false,
      exif: false,
      base64: false,
      plateRoiMetadata: { generation: 1, mountId: 1, revision: 1 },
    });
    expect(c.ports.render).toHaveBeenCalledExactlyOnceWith("source", {
      originX: 14,
      originY: 532,
      width: 692,
      height: 216,
    });
    expect(c.events).toEqual([
      "render",
      "save:0.6",
      "delete:source",
      "release",
    ]);
  });
  it("re-encodes the SAME crop locally after oversize, without recapture", async () => {
    const c = setup([1048577, 1048576]);
    expect(await c.capture()).toBe("roi-0.45");
    expect(c.camera.takePictureAsync).toHaveBeenCalledOnce();
    expect(c.ports.render).toHaveBeenCalledOnce();
    expect(c.events).toEqual([
      "render",
      "save:0.6",
      "delete:roi-0.6",
      "save:0.45",
      "delete:source",
      "release",
    ]);
  });
  it.each([0, -1, NaN, 1048577])(
    "fails closed for unusable final size %s and removes every known file",
    async (bytes) => {
      const c = setup([bytes]);
      await expect(c.capture()).rejects.toThrow();
      expect(c.ports.remove).toHaveBeenCalledWith("source");
      expect(c.ports.remove).toHaveBeenCalledWith("roi-0.6");
      expect(c.image.release).toHaveBeenCalledOnce();
    },
  );
  it.each(["capture", "render", "save"] as const)(
    "cleans late-created resources after cancellation at %s",
    async (stage) => {
      const c = setup();
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      if (stage === "capture")
        c.camera.takePictureAsync.mockImplementationOnce(async () => {
          await pending;
          return roiPicture("late-source");
        });
      if (stage === "render")
        vi.mocked(c.ports.render).mockImplementationOnce(async () => {
          await pending;
          return c.image;
        });
      if (stage === "save")
        c.image.save.mockImplementationOnce(async () => {
          await pending;
          return { uri: "late-roi", width: 692, height: 216 };
        });
      const result = c.capture();
      await vi.waitFor(() =>
        expect(
          stage === "capture"
            ? c.camera.takePictureAsync
            : stage === "render"
              ? c.ports.render
              : c.image.save,
        ).toHaveBeenCalledOnce(),
      );
      c.signal.abort();
      finish();
      await expect(result).rejects.toThrow();
      expect(c.ports.remove).toHaveBeenCalledWith(
        stage === "capture" ? "late-source" : "source",
      );
      if (stage === "save")
        expect(c.ports.remove).toHaveBeenCalledWith("late-roi");
      if (stage !== "capture") expect(c.image.release).toHaveBeenCalledOnce();
    },
  );
  it("rejects a stale layout even without AbortSignal and cleans output", async () => {
    const c = setup();
    c.image.save.mockImplementationOnce(async () => {
      c.stale();
      return { uri: "stale-roi", width: 692, height: 216 };
    });
    await expect(c.capture()).rejects.toThrow();
    expect(c.ports.remove).toHaveBeenCalledWith("stale-roi");
    expect(c.ports.remove).toHaveBeenCalledWith("source");
  });
  it("rejects absent metadata without rendering or retaining the source", async () => {
    const c = setup();
    c.camera.takePictureAsync.mockResolvedValueOnce({
      ...roiPicture("source"),
      plateRoiMetadata: undefined,
    } as never);
    await expect(c.capture()).rejects.toThrow();
    expect(c.ports.render).not.toHaveBeenCalled();
    expect(c.ports.remove).toHaveBeenCalledExactlyOnceWith("source");
  });
  it.each(["source", "roi-0.6"])(
    "suppresses handoff on %s deletion failure",
    async (uri) => {
      const c = setup(uri === "source" ? [100] : [1048577, 100]);
      vi.mocked(c.ports.remove).mockImplementation(async (value) => {
        if (value === uri) throw new Error("private uri");
      });
      await expect(c.capture()).rejects.toThrow("cleanup");
      expect(c.image.release).toHaveBeenCalledOnce();
      expect(c.ports.remove).toHaveBeenCalledWith("source");
      expect(c.ports.remove).toHaveBeenCalledWith("roi-0.6");
    },
  );
  it.each(["render", "save", "release"] as const)(
    "cleans on native %s failure",
    async (stage) => {
      const c = setup();
      if (stage === "render")
        vi.mocked(c.ports.render).mockRejectedValueOnce(new Error("private"));
      if (stage === "save")
        c.image.save.mockRejectedValueOnce(new Error("private"));
      if (stage === "release")
        c.image.release.mockImplementationOnce(() => {
          throw new Error("private");
        });
      await expect(c.capture()).rejects.toThrow("Automatic plate reading");
      expect(c.ports.remove).toHaveBeenCalledWith("source");
      if (stage === "release")
        expect(c.ports.remove).toHaveBeenCalledWith("roi-0.6");
    },
  );
  it.each(["missing", "stat-throw"])(
    "cleans original and ROI on %s file inspection",
    async (reason) => {
      const c = setup();
      vi.mocked(c.ports.inspect).mockImplementation(() => {
        if (reason === "stat-throw") throw new Error("private-path");
        return { exists: false, size: 100 };
      });
      await expect(c.capture()).rejects.toThrow(
        "Automatic plate reading is unavailable.",
      );
      expect(c.ports.remove).toHaveBeenCalledWith("source");
      expect(c.ports.remove).toHaveBeenCalledWith("roi-0.6");
      expect(c.image.release).toHaveBeenCalledOnce();
    },
  );
  it("rejects a saved image whose actual dimensions do not match the crop", async () => {
    const c = setup();
    c.image.save.mockResolvedValueOnce({
      uri: "wrong-roi",
      width: 720,
      height: 1280,
    });
    await expect(c.capture()).rejects.toThrow();
    expect(c.ports.remove).toHaveBeenCalledWith("wrong-roi");
    expect(c.ports.remove).toHaveBeenCalledWith("source");
  });
});
