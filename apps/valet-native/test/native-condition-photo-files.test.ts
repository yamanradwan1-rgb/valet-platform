import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  files: new Map<string, number>(),
  deleted: [] as string[],
  failDeletes: new Set<string>(),
  failCopyAfterPartialWrite: false,
  failOwnedDelete: false,
}));

vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    create() { /* mock private directory creation */ }
    list() {
      return Array.from(state.files.keys())
        .filter((path) => path.startsWith(`${this.uri}/`))
        .map((path) => new File(path));
    }
  }
  class File {
    uri: string;
    constructor(path: string | { uri: string }, name?: string) {
      this.uri = typeof path === "string" ? path : `${path.uri}/${name}`;
    }
    get exists() { return state.files.has(this.uri); }
    get size() { return state.files.get(this.uri) ?? 0; }
    copy(dest: File) {
      state.files.set(dest.uri, state.failCopyAfterPartialWrite ? 99 : this.size);
      if (state.failCopyAfterPartialWrite) throw new Error("copy partially wrote JPEG");
    }
    delete() {
      state.deleted.push(this.uri);
      if (state.failDeletes.has(this.uri) ||
        (state.failOwnedDelete && this.uri.includes("vaylet-condition-photos-v1")))
        throw new Error("I/O rejected");
      state.files.delete(this.uri);
    }
  }
  return { File, Directory, Paths: { cache: { uri: "file:///app/cache" } } };
});
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: () => undefined,
      renderAsync: async () => ({
        saveAsync: async () => {
          state.files.set("file:///app/cache/rendered.jpg", 512);
          return { uri: "file:///app/cache/rendered.jpg" };
        },
        release: () => undefined,
      }),
      release: () => undefined,
    }),
  },
}));

const { NativeConditionPhotoFiles, isOwnedCameraCacheUri } =
  await import("../src/check-in/native-condition-photo-files");

beforeEach(() => {
  state.files.clear();
  state.deleted.length = 0;
  state.failDeletes.clear();
  state.failCopyAfterPartialWrite = false;
  state.failOwnedDelete = false;
});

describe("Native condition photo private source and cache", () => {
  it.each([
    "file:///sdcard/DCIM/photo.jpg",
    "https://example.com/photo.jpg",
    "file:///app/cache/../document.jpg",
    "file:///app/cache/%2e%2e/document.jpg",
    "file:///app/cache/config.json",
  ])("refuses to delete non-camera source %s", async (source) => {
    state.files.set(source, 1024);
    expect(isOwnedCameraCacheUri(source)).toBe(false);
    await expect(new NativeConditionPhotoFiles().capture(source, 800, 600)).rejects.toThrow();
    expect(state.deleted).not.toContain(source);
    expect(state.files.has(source)).toBe(true);
  });

  it("reencodes to an owned private JPEG and deletes its camera and temporary source", async () => {
    const original = "file:///app/cache/Camera/abc.jpg";
    state.files.set(original, 1234);
    const files = new NativeConditionPhotoFiles();
    const handle = await files.capture(original, 2400, 1600);
    expect(files.file(handle).size).toBe(512);
    const ownedUri = files.preview(handle);
    expect(ownedUri).toContain("vaylet-condition-photos-v1");
    expect(state.deleted).toContain(original);
    expect(state.deleted).toContain("file:///app/cache/rendered.jpg");
    await files.discard(handle);
    expect(state.files.has(ownedUri)).toBe(false);
    expect(() => files.file(handle)).toThrow();
  });

  it("retains failed delete handles for retry, and owned startup cleanup visits all files", async () => {
    const original = "file:///app/cache/Camera/xyz.jpg";
    state.files.set(original, 1234);
    const files = new NativeConditionPhotoFiles();
    const handle = await files.capture(original, 1200, 800);
    const uri = files.preview(handle);
    state.failDeletes.add(uri);
    await expect(files.discard(handle)).rejects.toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(files.file(handle).uri).toBe(uri);
    state.failDeletes.delete(uri);
    await files.discard(handle);
    expect(state.files.has(uri)).toBe(false);
    state.files.set("file:///app/cache/vaylet-condition-photos-v1/orphan.jpg", 10);
    state.files.set("file:///app/cache/vaylet-condition-photos-v1/orphan2.jpg", 10);
    const other = "file:///app/cache/other-app/test.jpg";
    state.files.set(other, 10);
    state.failDeletes.add("file:///app/cache/vaylet-condition-photos-v1/orphan.jpg");
    expect(() => files.purgeStartup()).toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(state.files.has(other)).toBe(true);
    expect(state.files.has("file:///app/cache/vaylet-condition-photos-v1/orphan2.jpg")).toBe(false);
  });

  it("cleans a partially written owned JPEG when File.copy throws", async () => {
    const source = "file:///app/cache/Camera/partial.jpg";
    state.files.set(source, 1024);
    state.failCopyAfterPartialWrite = true;
    const files = new NativeConditionPhotoFiles();
    await expect(files.capture(source, 1200, 900)).rejects.toThrow("CONDITION_PHOTO_FILE_INVALID");
    expect(Array.from(state.files.keys()).filter((uri) =>
      uri.includes("vaylet-condition-photos-v1"))).toEqual([]);
    expect(state.deleted.some((uri) => uri.includes("vaylet-condition-photos-v1")))
      .toBe(true);
    expect(state.deleted).toContain(source);
  });

  it("blocks additional captures when a partially written JPEG cannot be deleted", async () => {
    const source = "file:///app/cache/Camera/partial2.jpg";
    state.files.set(source, 1024);
    state.failCopyAfterPartialWrite = true;
    state.failOwnedDelete = true;
    const files = new NativeConditionPhotoFiles();
    await expect(files.capture(source, 1200, 900)).rejects.toThrow();
    expect(Array.from(state.files.keys()).some((uri) =>
      uri.includes("vaylet-condition-photos-v1"))).toBe(true);
    await expect(files.capture(source, 1200, 900)).rejects.toThrow(
      "CONDITION_PHOTO_CLEANUP_UNAVAILABLE",
    );
    state.failOwnedDelete = false;
    state.failCopyAfterPartialWrite = false;
    files.purgeStartup();
    state.files.set(source, 1024);
    const handle = await files.capture(source, 1200, 900);
    expect(files.file(handle).exists).toBe(true);
  });
});
