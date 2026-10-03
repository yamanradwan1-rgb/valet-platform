import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferred,
  enableTrace,
  traceFixture,
} from "./native-plate-camera-trace-fixture";
import {
  capturePlateRoi,
  CameraCaptureFailure,
} from "../src/check-in/native-plate-roi-capture";

beforeEach(enableTrace);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("native promise trace without retained media", () => {
  it.each(["resolve", "reject"])(
    "keeps native %s ownership after background",
    async (outcome) => {
      const c = traceFixture();
      await c.controller.open();
      const ids = c.mount();
      await c.roi.ready(ids.generation, ids.mountId);
      const pending = deferred<unknown>();
      Object.assign(c.camera, {
        takePictureAsync: vi.fn().mockReturnValue(pending.promise),
      });
      const remove = vi.fn().mockResolvedValue(undefined);
      const abort = new AbortController();
      const snapshot = c.roi.capture();
      const capture = capturePlateRoi(
        {
          ...snapshot,
          trace: c.trace,
          current: () => c.roi.isCurrent(snapshot),
          render: vi.fn(),
          inspect: vi.fn(),
          remove,
        },
        abort.signal,
      );
      const assertion = expect(capture).rejects.toThrow();
      expect(
        c.records().find((r) => r.event === "native-capture-start")?.details,
      ).toMatchObject(ids);
      c.background();
      abort.abort();
      if (outcome === "resolve") pending.resolve({ uri: "PRIVATE_MEDIA_PATH" });
      else pending.reject(new Error("PRIVATE_TOKEN_PLATE_IMAGE"));
      await assertion;
      const event =
        outcome === "resolve"
          ? "native-capture-success"
          : "native-capture-failure";
      expect(c.records().find((r) => r.event === event)?.details).toMatchObject(
        { ...ids, current: false, aborted: true },
      );
      if (outcome === "resolve")
        expect(remove).toHaveBeenCalledWith("PRIVATE_MEDIA_PATH");
      expect(JSON.stringify(c.records())).not.toContain("PRIVATE");
      c.cleanup();
    },
  );

  it("normalizes a current native rejection to its existing fallback failure class", async () => {
    const c = traceFixture();
    await c.controller.open();
    const ids = c.mount();
    await c.roi.ready(ids.generation, ids.mountId);
    Object.assign(c.camera, {
      takePictureAsync: vi
        .fn()
        .mockRejectedValue(new Error("PRIVATE_OCR_RESPONSE")),
    });
    const snapshot = c.roi.capture();
    await expect(
      capturePlateRoi(
        {
          ...snapshot,
          trace: c.trace,
          current: () => true,
          render: vi.fn(),
          inspect: vi.fn(),
          remove: vi.fn(),
        },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(CameraCaptureFailure);
    expect(
      c.records().find((r) => r.event === "native-capture-failure")?.details,
    ).toMatchObject({ ...ids, current: true, reason: "native" });
    expect(JSON.stringify(c.records())).not.toContain("PRIVATE");
    c.cleanup();
  });
});
