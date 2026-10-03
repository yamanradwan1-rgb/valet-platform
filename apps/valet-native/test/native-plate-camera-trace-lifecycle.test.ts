import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferred,
  enableTrace,
  traceFixture,
} from "./native-plate-camera-trace-fixture";

beforeEach(() => {
  enableTrace();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("trace of existing lifecycle fences", () => {
  it.each(["starting", "preview"])(
    "orders background invalidation and explicit reopen from %s",
    async (phase) => {
      const c = traceFixture();
      await c.controller.open();
      const ids = c.mount();
      if (phase === "preview") await c.roi.ready(ids.generation, ids.mountId);
      c.background();
      c.background("active");
      expect(c.controller.current().phase).toBe("idle");
      await c.roi.ready(ids.generation, ids.mountId);
      expect(c.controller.current().phase).toBe("idle");
      await c.controller.open();
      expect(c.controller.current().generation).toBeGreaterThan(ids.generation);
      const records = c.records();
      const background = records.findIndex(
        (r) => r.event === "app-state" && r.details.appState === "background",
      );
      const close = records.findIndex(
        (r, i) => i > background && r.event === "controller-close",
      );
      expect(close).toBeGreaterThan(background);
      expect(records[background]!.details.phase).toBe(phase);
      expect(records.some((r) => r.event === "background-invalidation")).toBe(
        true,
      );
      c.cleanup();
      expect(c.records().some((r) => r.event === "lifecycle-cleanup")).toBe(
        true,
      );
    },
  );

  it("retains cancelled capture ownership and observes the blocked slot without freeing it", async () => {
    const capture = deferred<string>();
    const recognize = vi.fn();
    const remove = vi.fn().mockResolvedValue(undefined);
    const accept = vi.fn();
    const c = traceFixture({
      capture: () => capture.promise,
      recognize,
      remove,
      accept,
    });
    await c.controller.open();
    const old = c.mount();
    await c.roi.ready(old.generation, old.mountId);
    await vi.advanceTimersByTimeAsync(1200);
    c.background();
    c.background("active");
    await c.controller.open();
    const replacement = c.mount();
    await c.roi.ready(replacement.generation, replacement.mountId);
    expect(
      c.records().find((r) => r.event === "ocr-start-blocked")?.details,
    ).toMatchObject({
      generation: replacement.generation,
      operationActive: true,
    });
    capture.resolve("PRIVATE_CAPTURE_PATH");
    await vi.advanceTimersByTimeAsync(0);
    expect(recognize).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("PRIVATE_CAPTURE_PATH");
    expect(
      c.records().find((r) => r.event === "capture-success")?.details,
    ).toMatchObject({
      ...old,
      current: false,
      aborted: true,
      currentGeneration: replacement.generation,
      currentMountId: replacement.mountId,
    });
    expect(JSON.stringify(c.records())).not.toContain("PRIVATE");
    c.cleanup();
  });

  it("cleans a late capture after Check-In workflow retirement without publishing", async () => {
    const capture = deferred<string>();
    const recognize = vi.fn();
    const accept = vi.fn();
    const remove = vi.fn().mockResolvedValue(undefined);
    const c = traceFixture({
      capture: () => capture.promise,
      recognize,
      accept,
      remove,
    });
    await c.controller.open();
    const old = c.mount();
    await c.roi.ready(old.generation, old.mountId);
    await vi.advanceTimersByTimeAsync(1200);
    c.scope("scope-B");
    capture.resolve("PRIVATE_RETIRED_CAPTURE_PATH");
    await vi.advanceTimersByTimeAsync(0);
    const records = c.records();
    const retired = records.findIndex((r) => r.event === "workflow-retired");
    const cleaned = records.findIndex((r) => r.event === "capture-cleanup");
    expect(retired).toBeGreaterThanOrEqual(0);
    expect(cleaned).toBeGreaterThan(retired);
    expect(records[cleaned]?.details).toMatchObject(old);
    expect(
      records.find((r) => r.event === "capture-discard")?.details,
    ).toMatchObject({ ...old, current: false });
    expect(recognize).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("PRIVATE_RETIRED_CAPTURE_PATH");
    expect(JSON.stringify(records)).not.toContain("PRIVATE");
    c.cleanup();
  });

  it("fences an old completion after workflow A→B→A retirement", async () => {
    const pending = deferred<{ granted: boolean; canAskAgain: boolean }>();
    const c = traceFixture();
    c.get.mockReturnValueOnce(pending.promise);
    const opening = c.controller.open();
    const old = c.controller.current();
    c.scope("scope-B");
    c.scope("scope-A");
    pending.resolve({ granted: true, canAskAgain: true });
    await opening;
    await c.controller.open();
    expect(c.controller.current().phase).toBe("idle");
    expect(
      c.records().find((r) => r.event === "permission-result")?.details,
    ).toMatchObject({
      generation: old.generation,
      mountId: old.mountId,
      current: false,
    });
    expect(
      c.records().filter((r) => r.event === "workflow-retired"),
    ).toHaveLength(1);
    c.cleanup();
  });

  it.each([true, false])(
    "records permission-owned background and settled focus, returns active=%s",
    async (active) => {
      const c = traceFixture();
      const pending = deferred<{ granted: boolean; canAskAgain: boolean }>();
      c.get.mockResolvedValueOnce({ granted: false, canAskAgain: true });
      c.request.mockReturnValueOnce(pending.promise);
      const opening = c.controller.open();
      await vi.advanceTimersByTimeAsync(0);
      c.background();
      expect(c.controller.current().phase).toBe("requesting");
      if (active) c.background("active");
      pending.resolve({ granted: true, canAskAgain: true });
      await opening;
      expect(c.controller.current().phase).toBe(active ? "starting" : "idle");
      expect(
        c
          .records()
          .find(
            (r) =>
              r.event === "app-state" && r.details.appState === "background",
          )?.details.deferred,
      ).toBe(true);
      c.cleanup();
    },
  );

  it.each(["ready", "close", "abort"])(
    "observes fallback remount and its %s outcome",
    async (outcome) => {
      const c = traceFixture();
      await c.controller.open();
      const first = c.mount();
      c.controller.configurePictureSizes(
        first.generation,
        "1280x720",
        "1024x576",
      );
      const preferred = c.mount();
      await c.roi.ready(preferred.generation, preferred.mountId);
      const abort = new AbortController();
      const wait = c.controller.waitForCaptureFallback(
        preferred.generation,
        abort.signal,
      );
      const fallback = c.mount();
      expect(c.controller.current()).toMatchObject({
        phase: "starting",
        captureFallbackUsed: true,
      });
      expect(
        c.records().find((r) => r.event === "fallback-wait")?.details,
      ).toMatchObject(fallback);
      if (outcome === "ready")
        await c.roi.ready(fallback.generation, fallback.mountId);
      if (outcome === "close") c.controller.close();
      if (outcome === "abort") abort.abort();
      await expect(wait).resolves.toBe(outcome === "ready");
      const terminal =
        outcome === "ready" ? "fallback-ready" : "fallback-aborted";
      expect(c.records().some((r) => r.event === terminal)).toBe(true);
      c.cleanup();
    },
  );
});
