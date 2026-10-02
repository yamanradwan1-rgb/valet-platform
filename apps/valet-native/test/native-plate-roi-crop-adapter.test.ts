import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  crop: vi.fn(),
  render: vi.fn(),
  save: vi.fn(),
  imageRelease: vi.fn(),
  contextRelease: vi.fn(),
  manipulate: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: mocks.manipulate },
  SaveFormat: { JPEG: "jpeg" },
}));
const { renderPlateRoi } =
  await import("../src/check-in/native-plate-roi-crop-adapter");
const crop = { originX: 14, originY: 532, width: 692, height: 216 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.manipulate.mockReturnValue({
    crop: mocks.crop,
    renderAsync: mocks.render,
    release: mocks.contextRelease,
  });
  mocks.render.mockResolvedValue({
    saveAsync: mocks.save,
    release: mocks.imageRelease,
  });
  mocks.save.mockResolvedValue({ uri: "private-roi", width: 692, height: 216 });
});
describe("device crop and JPEG adapter", () => {
  it("crops once and encodes JPEG twice from one rendered native image without base64 or resize", async () => {
    const image = await renderPlateRoi("private-source", crop);
    await image.save(0.6);
    await image.save(0.45);
    image.release();
    expect(mocks.manipulate).toHaveBeenCalledExactlyOnceWith("private-source");
    expect(mocks.crop).toHaveBeenCalledExactlyOnceWith(crop);
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls).toEqual([
      [{ format: "jpeg", compress: 0.6, base64: false }],
      [{ format: "jpeg", compress: 0.45, base64: false }],
    ]);
    expect(mocks.imageRelease).toHaveBeenCalledOnce();
    expect(mocks.contextRelease).toHaveBeenCalledOnce();
  });
  it.each(["crop", "render"])(
    "releases native context after %s failure with sanitized error",
    async (stage) => {
      if (stage === "crop")
        mocks.crop.mockImplementation(() => {
          throw new Error("private-source");
        });
      else mocks.render.mockRejectedValue(new Error("private-source"));
      await expect(renderPlateRoi("private-source", crop)).rejects.toThrow(
        "Plate cropping unavailable.",
      );
      expect(mocks.contextRelease).toHaveBeenCalledOnce();
      expect(mocks.imageRelease).not.toHaveBeenCalled();
    },
  );
  it("releases context even if native image release fails", async () => {
    const image = await renderPlateRoi("private-source", crop);
    mocks.imageRelease.mockImplementation(() => {
      throw new Error("native failure");
    });
    expect(() => image.release()).toThrow();
    expect(mocks.contextRelease).toHaveBeenCalledOnce();
  });
});
