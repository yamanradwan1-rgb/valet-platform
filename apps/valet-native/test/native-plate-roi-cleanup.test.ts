import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ delete: vi.fn(), exists: true }));
vi.mock("expo-file-system", () => ({
  File: class {
    exists = mocks.exists;
    delete() {
      mocks.delete();
    }
  },
}));
const { removePlateFile } =
  await import("../src/check-in/native-plate-roi-files");
beforeEach(() => {
  mocks.delete.mockReset();
  mocks.exists = true;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("bounded transient cleanup", () => {
  it("deletes once and treats already removed files as safe", async () => {
    await removePlateFile("private");
    expect(mocks.delete).toHaveBeenCalledOnce();
    mocks.exists = false;
    await removePlateFile("private");
    expect(mocks.delete).toHaveBeenCalledOnce();
  });
  it("retries deletion locally but reports failure even when cleanup recovers", async () => {
    mocks.delete.mockImplementationOnce(() => {
      throw new Error("private-path");
    });
    await expect(removePlateFile("private-path")).rejects.toThrow(
      "Plate image cleanup unavailable.",
    );
    expect(mocks.delete).toHaveBeenCalledTimes(2);
  });
  it("bounds persistent failure and logs only classification", async () => {
    vi.stubGlobal("__DEV__", true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.delete.mockImplementation(() => {
      throw new Error("private-path token-secret");
    });
    await expect(removePlateFile("private-path")).rejects.toThrow(
      "Plate image cleanup unavailable.",
    );
    expect(mocks.delete).toHaveBeenCalledTimes(2);
    expect(log.mock.calls).toEqual([
      ["PLATE_OCR_NATIVE roi-cleanup-failure"],
      ["PLATE_OCR_NATIVE roi-cleanup-failure"],
    ]);
  });
});
