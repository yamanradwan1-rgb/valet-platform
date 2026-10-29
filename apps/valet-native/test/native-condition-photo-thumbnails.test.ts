import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  files: new Map<string, number>(),
  deleted: [] as string[],
  resized: [] as Array<{ width: number; height: number }>,
  failDelete: false,
  oversized: false,
  serial: 0,
  copyGate: null as Promise<void> | null,
}));

vi.mock("react-native", () => ({
  Image: { getSize: (_uri: string, success: (w: number, h: number) => void) =>
    success(1200, 600) },
}));
vi.mock("../src/crypto/native-secure-crypto", () => ({
  nativeSecureRandomUUID: () => `44444444-4444-4444-8444-${String(++state.serial).padStart(12, "0")}`,
}));
vi.mock("expo-file-system", () => {
  class File {
    readonly uri: string;
    constructor(parent: string | { uri: string }, name?: string) {
      this.uri = typeof parent === "string" ? parent : `${parent.uri}/${name}`;
    }
    get exists() { return state.files.has(this.uri); }
    get size() { return state.files.get(this.uri) ?? 0; }
    async copy(target: File) {
      await state.copyGate;
      state.files.set(target.uri, this.size);
    }
    delete() {
      if (state.failDelete && this.uri.includes("vaylet-condition-photo-thumbs-v1"))
        throw new Error("PRIVATE_DELETE_FAILED");
      state.deleted.push(this.uri);
      state.files.delete(this.uri);
    }
  }
  class Directory {
    readonly uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    create() { /* directory already exists in memory */ }
    list() { return [...state.files.keys()]
      .filter((uri) => uri.startsWith(this.uri + "/"))
      .map((uri) => new File(uri)); }
  }
  return { File, Directory, Paths: { cache: { uri: "file:///app/cache" } } };
});
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: (size: { width: number; height: number }) => state.resized.push(size),
      release: () => undefined,
      renderAsync: async () => ({
        release: () => undefined,
        saveAsync: async () => {
          const uri = "file:///app/cache/ImageManipulator/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
          state.files.set(uri, state.oversized ? 300 * 1024 : 120 * 1024);
          return { uri };
        },
      }),
    }),
  },
}));

const { NativeConditionPhotoThumbnails } = await import(
  "../src/check-in/native-condition-photo-thumbnails");
const source = (index: number) =>
  `file:///app/cache/vaylet-condition-photos-v1/11111111-1111-4111-8111-${String(index).padStart(12, "0")}.jpg`;
const make = async (owner: InstanceType<typeof NativeConditionPhotoThumbnails>,
  index: number) => {
  state.files.set(source(index), 1200 * 1024);
  return await owner.create({ sourceUri: source(index), scopeKey: "exact-actor-scope-A",
    captureId: `capture-${index}` });
};

beforeEach(() => {
  state.files.clear(); state.deleted.length = 0; state.resized.length = 0;
  state.serial = 0; state.failDelete = false; state.oversized = false;
  state.copyGate = null;
});

describe("Issue #336 private B1 thumbnail lifetime", () => {
  it("keeps real resized local preview after original JPEG is discarded", async () => {
    const owner = new NativeConditionPhotoThumbnails();
    owner.purgeStartup();
    const uri = await make(owner, 1);
    expect(uri).toContain("vaylet-condition-photo-thumbs-v1");
    expect(state.resized).toEqual([{ width: 320, height: 160 }]);
    state.files.delete(source(1)); // existing upload owner discards original after VERIFIED
    expect(owner.preview("capture-1", "exact-actor-scope-A")).toBe(uri);
    expect(owner.preview("capture-1", "different-actor-scope")).toBeNull();
    owner.discardAll();
    expect(owner.preview("capture-1", "exact-actor-scope-A")).toBeNull();
    expect(state.files.has(uri!)).toBe(false);
  });

  it("bounds to four private thumbnails and purges only its own cache at startup", async () => {
    const owner = new NativeConditionPhotoThumbnails();
    owner.purgeStartup();
    const values = [];
    for (let index = 1; index <= 4; index += 1)
      values.push(await make(owner, index));
    expect(values.every(Boolean)).toBe(true);
    expect(await make(owner, 5)).toBeNull();
    const extraSource = source(2);
    const oldThumbnail = values[0]!;
    owner.purgeStartup();
    expect(state.files.has(oldThumbnail)).toBe(false);
    expect(state.files.has(extraSource)).toBe(true);
  });

  it("rejects foreign files, oversize previews and fails closed on unsafe cleanup", async () => {
    const owner = new NativeConditionPhotoThumbnails();
    owner.purgeStartup();
    await expect(owner.create({ sourceUri: "https://example.com/photo.jpg",
      scopeKey: "exact-actor-scope-A", captureId: "foreign" })).rejects.toThrow();
    await expect(owner.create({ sourceUri:
      "file:///app/cache/vaylet-condition-photos-v1/../foreign.jpg",
      scopeKey: "exact-actor-scope-A", captureId: "traversal" })).rejects.toThrow();
    state.oversized = true;
    expect(await make(owner, 1)).toBeNull();
    state.oversized = false;
    const uri = await make(owner, 2);
    expect(uri).not.toBeNull();
    state.failDelete = true;
    expect(() => owner.discardByCaptureId("capture-2")).toThrow();
    await expect(make(owner, 3)).rejects.toThrow();
  });

  it("retires in-flight copies on scope change without publishing stale private bytes", async () => {
    const owner = new NativeConditionPhotoThumbnails();
    owner.purgeStartup();
    let release!: () => void;
    state.copyGate = new Promise<void>((resolve) => { release = resolve; });
    const pending = make(owner, 1);
    await vi.waitFor(() => expect(state.resized.length).toBe(1));
    owner.discardAll(); // identity loss while File.copy is still in flight
    release();
    expect(await pending).toBeNull();
    expect([...state.files.keys()].filter((uri) =>
      uri.includes("vaylet-condition-photo-thumbs-v1"))).toHaveLength(0);
    state.copyGate = null;
    expect(await make(owner, 2)).not.toBeNull();
    expect(owner.preview("capture-1", "exact-actor-scope-A")).toBeNull();
  });
});
