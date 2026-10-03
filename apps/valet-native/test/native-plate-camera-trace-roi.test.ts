import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraView } from "expo-camera";
import {
  deferred,
  enableTrace,
  previewMetadata,
  traceFixture,
} from "./native-plate-camera-trace-fixture";

beforeEach(enableTrace);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("trace ownership around ROI retirement", () => {
  it("records old mount detach and metadata as stale after preferred remount", async () => {
    const c = traceFixture();
    await c.controller.open();
    const old = c.mount();
    const pending = deferred<unknown>();
    c.metadata.mockReturnValueOnce(pending.promise);
    const ready = c.roi.ready(old.generation, old.mountId);
    c.controller.configurePictureSizes(old.generation, "1280x720", "1024x576");
    const current = c.mount();
    c.roi.ref(null, old.generation, old.mountId);
    await c.roi.ready(old.generation, old.mountId);
    pending.resolve(previewMetadata);
    await ready;
    expect(c.controller.current().phase).toBe("starting");
    expect(
      c.records().find((r) => r.event === "metadata-discard")?.details,
    ).toMatchObject({
      ...old,
      current: false,
      currentMountId: current.mountId,
    });
    expect(
      c.records().find((r) => r.event === "ref-detach")?.details,
    ).toMatchObject({ ...old, current: false, refId: -1 });
    await c.roi.ready(current.generation, current.mountId);
    expect(c.roi.capture().geometry.mountId).toBe(current.mountId);
    c.cleanup();
  });

  it.each(["layout", "ref", "background"])(
    "discards metadata after %s replacement without relabeling its origin",
    async (replacement) => {
      const c = traceFixture();
      await c.controller.open();
      const ids = c.mount();
      const pending = deferred<unknown>();
      c.metadata.mockReturnValueOnce(pending.promise);
      const ready = c.roi.ready(ids.generation, ids.mountId);
      if (replacement === "layout")
        c.roi.layout(ids.generation, ids.mountId, 361, 260);
      if (replacement === "ref")
        c.roi.ref(
          {
            getPlatePreviewMetadataAsync: async () => previewMetadata,
          } as CameraView,
          ids.generation,
          ids.mountId,
        );
      if (replacement === "background") c.background();
      pending.resolve(previewMetadata);
      await ready;
      expect(
        c.records().find((r) => r.event === "metadata-discard")?.details,
      ).toMatchObject({ ...ids, geometryRevision: 1, current: false });
      if (replacement === "ref") {
        expect(c.controller.current().phase).toBe("starting");
        expect(() => c.roi.capture()).toThrow();
        await c.roi.ready(ids.generation, ids.mountId);
        expect(c.roi.capture().camera).not.toBe(c.camera);
      }
      c.cleanup();
    },
  );

  it("observes the existing preview/ref mismatch without repairing it", async () => {
    const c = traceFixture();
    await c.controller.open();
    const ids = c.mount();
    await c.roi.ready(ids.generation, ids.mountId);
    c.roi.ref(null, ids.generation, ids.mountId);
    c.roi.ref(c.camera, ids.generation, ids.mountId);
    await c.roi.ready(ids.generation, ids.mountId);
    expect(c.controller.current().phase).toBe("preview");
    expect(() => c.roi.capture()).toThrow();
    expect(
      c
        .records()
        .filter((r) => r.event === "roi-state")
        .at(-1)?.details,
    ).toMatchObject({ phase: "preview", attached: true, validated: false });
    c.cleanup();
  });
});
