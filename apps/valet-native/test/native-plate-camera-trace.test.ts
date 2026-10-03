import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableTrace, traceFixture } from "./native-plate-camera-trace-fixture";
import {
  NativePlateCameraTrace,
  PLATE_CAMERA_TRACE_CAPACITY,
  readNativePlateCameraTrace,
} from "../src/check-in/native-plate-camera-trace";

beforeEach(enableTrace);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("plate investigation trace boundary", () => {
  it("is explicitly opt-in and never changes a snapshot or publishes business state", async () => {
    vi.stubEnv("EXPO_PUBLIC_PLATE_CAMERA_TRACE", "0");
    const c = traceFixture();
    await c.controller.open();
    expect(c.records()).toEqual([]);
    vi.stubEnv("EXPO_PUBLIC_PLATE_CAMERA_TRACE", "1");
    const before = c.controller.current();
    const publish = vi.fn();
    c.controller.subscribe(publish);
    c.trace.record("native-error", { reason: "native" });
    expect(c.controller.current()).toBe(before);
    expect(publish).not.toHaveBeenCalled();
    c.cleanup();
  });

  it("orders open, permission, mount, validated preview and close with owner identities", async () => {
    const c = traceFixture();
    await c.controller.open();
    const ids = c.mount();
    await c.roi.ready(ids.generation, ids.mountId);
    c.controller.toggleTorch(ids.generation, ids.mountId);
    c.controller.close();
    const records = c.records();
    const index = (event: string) =>
      records.findIndex((r) => r.event === event);
    const order = [
      "open-request",
      "permission-read",
      "permission-result",
      "mount-request",
      "ref-attach",
      "metadata-start",
      "metadata-success",
      "preview-validated",
      "controller-close",
      "torch-cleanup",
    ].map(index);
    expect(order.every((n) => n >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(records.every((r) => r.details.identityGeneration === 7)).toBe(true);
    expect(
      records.find((r) => r.event === "metadata-start")?.details,
    ).toMatchObject(ids);
    for (let i = 1; i < records.length; i++) {
      expect(records[i]!.sequence).toBeGreaterThan(records[i - 1]!.sequence);
      expect(records[i]!.elapsedMs).toBeGreaterThanOrEqual(
        records[i - 1]!.elapsedMs,
      );
    }
    c.cleanup();
  });

  it("bounds storage, strips arbitrary fields and rejects untrusted enum/string values", () => {
    const trace = new NativePlateCameraTrace();
    const unsafe = {
      plateNumber: "PRIVATE_PLATE",
      imageBytes: "PRIVATE_IMAGE",
      uri: "PRIVATE_PATH",
      token: "PRIVATE_TOKEN",
      phone: "PRIVATE_PHONE",
      rawOcrResponse: "PRIVATE_RESPONSE",
      appState: "PRIVATE_STATE",
      pictureSize: "PRIVATE_SIZE",
      reason: "PRIVATE_ERROR",
      phase: "PRIVATE_PHASE",
      count: NaN,
      mountId: Infinity,
    };
    trace.record("native-error", unsafe as never);
    const safe = readNativePlateCameraTrace().at(-1)!;
    expect(JSON.stringify(safe)).not.toContain("PRIVATE");
    expect(safe.details).not.toHaveProperty("count");
    trace.record("roi-layout", { width: 360.5, height: 260.25 });
    expect(readNativePlateCameraTrace().at(-1)?.details).toMatchObject({
      width: 360.5,
      height: 260.25,
    });
    for (let n = 0; n < PLATE_CAMERA_TRACE_CAPACITY + 20; n++)
      trace.record("open-request");
    const records = readNativePlateCameraTrace();
    expect(records).toHaveLength(PLATE_CAMERA_TRACE_CAPACITY);
    expect(records.at(-1)!.sequence - records[0]!.sequence).toBe(
      PLATE_CAMERA_TRACE_CAPACITY - 1,
    );
    expect(Object.isFrozen(records[0]!.details)).toBe(true);
    const copy = records as unknown[];
    copy.pop();
    expect(readNativePlateCameraTrace()).toHaveLength(
      PLATE_CAMERA_TRACE_CAPACITY,
    );
  });

  it("never lets a failed diagnostic sink affect permission or preview", async () => {
    vi.mocked(console.info).mockImplementation(() => {
      throw new Error("sink failure");
    });
    const c = traceFixture();
    await c.controller.open();
    const ids = c.mount();
    await c.roi.ready(ids.generation, ids.mountId);
    expect(c.controller.current().phase).toBe("preview");
    c.cleanup();
  });
});
