import { describe, expect, it, vi } from "vitest";
import type { CameraView } from "expo-camera";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";
import { NativePlateRoiBinding } from "../src/check-in/native-plate-roi-binding";

const preview = {
  width: 1080,
  height: 780,
  sensorToView: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};
async function setup() {
  const controller = new NativePlateCameraController({
    get: async () => ({ granted: true, canAskAgain: true }),
    request: vi.fn(),
  });
  controller.setEligible(true);
  await controller.open();
  const binding = new NativePlateRoiBinding(controller);
  const camera = {
    getPlatePreviewMetadataAsync: vi.fn().mockResolvedValue(preview),
  } as unknown as CameraView;
  const mount = () => {
    const { generation, mountId } = controller.current();
    binding.ref(camera, generation, mountId);
    binding.layout(generation, mountId, 360, 260);
    return { generation, mountId };
  };
  return { binding, controller, camera, mount };
}
describe("native mount and layout readiness fence", () => {
  it.each([true, false])(
    "requires current layout and metadata for readiness, layout first=%s",
    async (layoutFirst) => {
      const c = await setup();
      const { generation, mountId } = c.controller.current();
      c.binding.ref(c.camera, generation, mountId);
      if (layoutFirst) c.binding.layout(generation, mountId, 360, 260);
      await c.binding.ready(generation, mountId);
      if (!layoutFirst) {
        expect(c.controller.current().phase).toBe("starting");
        c.binding.layout(generation, mountId, 360, 260);
        await Promise.resolve();
        await Promise.resolve();
      }
      expect(c.controller.current().phase).toBe("preview");
      expect(c.binding.capture().preview.width).toBe(1080);
      c.controller.close();
    },
  );
  it("ignores old ref/layout/readiness callbacks from a same-generation remount", async () => {
    const c = await setup();
    const old = c.mount();
    c.controller.configurePictureSizes(old.generation, "1280x720", "1024x576");
    const active = c.mount();
    c.binding.ref(null, old.generation, old.mountId);
    c.binding.layout(old.generation, old.mountId, 500, 260);
    await c.binding.ready(old.generation, old.mountId);
    expect(c.controller.current().phase).toBe("starting");
    await c.binding.ready(active.generation, active.mountId);
    expect(c.binding.capture().camera).toBe(c.camera);
    expect(c.binding.capture().geometry).toMatchObject({
      mountId: active.mountId,
      width: 360,
    });
    c.controller.close();
  });
  it("ignores late native metadata from a replaced mount", async () => {
    const c = await setup();
    const old = c.mount();
    let resolve!: (value: unknown) => void;
    vi.mocked(c.camera.getPlatePreviewMetadataAsync).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = c.binding.ready(old.generation, old.mountId);
    c.controller.configurePictureSizes(old.generation, "1280x720");
    const active = c.mount();
    resolve(preview);
    await pending;
    expect(c.controller.current().phase).toBe("starting");
    await c.binding.ready(active.generation, active.mountId);
    expect(c.binding.capture().geometry.mountId).toBe(active.mountId);
    c.controller.close();
  });
  it("invalidates in-flight geometry when the measured layout changes", async () => {
    const c = await setup();
    const ids = c.mount();
    await c.binding.ready(ids.generation, ids.mountId);
    const captured = c.binding.capture();
    c.binding.layout(ids.generation, ids.mountId, 361, 260);
    expect(c.binding.isCurrent(captured)).toBe(false);
    expect(c.controller.current().phase).toBe("unavailable");
    expect(() => c.binding.capture()).toThrow();
  });
  it.each([
    undefined,
    { ...preview, width: 0 },
    { ...preview, sensorToView: [0, 0, 0, 0, 0, 0, 0, 0, 1] },
  ])("fails closed for unavailable/invalid native geometry", async (value) => {
    const c = await setup();
    const ids = c.mount();
    vi.mocked(c.camera.getPlatePreviewMetadataAsync).mockResolvedValueOnce(
      value,
    );
    await c.binding.ready(ids.generation, ids.mountId);
    expect(c.controller.current().phase).toBe("unavailable");
    expect(() => c.binding.capture()).toThrow();
  });
  it("ignores native metadata after close and reopening", async () => {
    const c = await setup();
    const old = c.mount();
    let finish!: () => void;
    vi.mocked(c.camera.getPlatePreviewMetadataAsync).mockReturnValueOnce(
      new Promise((done) => {
        finish = () => done(preview);
      }),
    );
    const pending = c.binding.ready(old.generation, old.mountId);
    c.controller.close();
    await c.controller.open();
    c.mount();
    finish();
    await pending;
    expect(c.controller.current().phase).toBe("starting");
    expect(() => c.binding.capture()).toThrow();
    c.controller.close();
  });
});
