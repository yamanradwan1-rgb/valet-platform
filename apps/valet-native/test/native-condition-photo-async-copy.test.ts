import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  files: new Map<string, number>(),
  deleted: [] as string[],
  copy: null as null | {
    from: string; to: string; resolve: () => void;
    reject: (partial?: boolean) => void;
  },
  failOwnedDelete: false,
}));

vi.mock("../src/crypto/native-secure-crypto", () => ({
  nativeSecureRandomUUID: () => "55555555-5555-4555-8555-555555555555",
}));

vi.mock("expo-file-system", () => {
  class File {
    readonly uri: string;
    constructor(parent: string | { uri: string }, name?: string) {
      this.uri = typeof parent === "string" ? parent : `${parent.uri}/${name}`;
    }
    get exists() { return state.files.has(this.uri); }
    get size() { return state.files.get(this.uri) ?? 0; }
    copy(destination: File): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        state.copy = {
          from: this.uri, to: destination.uri,
          resolve: () => { state.files.set(destination.uri, this.size); resolve(); },
          reject: (partial = false) => {
            if (partial) state.files.set(destination.uri, 99);
            reject(new Error("PRIVATE_COPY_NATIVE_FAILURE"));
          },
        };
      });
    }
    delete() {
      state.deleted.push(this.uri);
      if (state.failOwnedDelete && this.uri.includes("vaylet-condition-photos-v1"))
        throw new Error("PRIVATE_DELETE_FAILURE");
      state.files.delete(this.uri);
    }
  }
  class Directory {
    readonly uri: string;
    constructor(parent: { uri: string }, name: string) { this.uri = `${parent.uri}/${name}`; }
    create() { /* private cache folder */ }
    list() { return [...state.files.keys()].filter((uri) => uri.startsWith(`${this.uri}/`))
      .map((uri) => new File(uri)); }
  }
  return { File, Directory, Paths: {
    cache: { uri: "file:///app/cache" }, document: { uri: "file:///app/docs" },
  } };
});

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: () => undefined,
      release: () => undefined,
      renderAsync: async () => ({
        release: () => undefined,
        saveAsync: async () => {
          state.files.set("file:///app/cache/rendered.jpg", 512);
          return { uri: "file:///app/cache/rendered.jpg" };
        },
      }),
    }),
  },
}));

const { NativeConditionPhotoFiles } =
  await import("../src/check-in/native-condition-photo-files");

async function pendingCopy() {
  for (let i = 0; i < 20 && state.copy === null; i++) await Promise.resolve();
  if (state.copy === null) throw new Error("test never reached copy");
  return state.copy;
}

beforeEach(() => {
  state.files.clear(); state.deleted.length = 0;
  state.copy = null; state.failOwnedDelete = false;
});

describe("Expo Native File.copy Promise completion and lifecycle", () => {
  it("does not verify, delete sources, or preview before native copy resolves", async () => {
    const source = "file:///app/cache/Camera/timing.jpg";
    state.files.set(source, 1200);
    const stages: string[] = [];
    const files = new NativeConditionPhotoFiles();
    let finished = false;
    const capture = files.capture(source, 1200, 900, (stage, outcome) =>
      stages.push(`${stage}.${outcome}`)).finally(() => { finished = true; });
    const native = await pendingCopy();
    expect(stages).toContain("owned-copy.start");
    expect(stages).not.toContain("owned-copy.success");
    expect(stages).not.toContain("copy-verify.start");
    expect(state.files.has(source)).toBe(true);
    expect(state.files.has(native.from)).toBe(true);
    expect(finished).toBe(false);
    native.resolve();
    const handle = await capture;
    expect(files.preview(handle)).toBe(native.to);
    expect(stages).toContain("owned-copy.success");
    expect(stages).toContain("copy-verify.success");
    expect(state.files.has(source)).toBe(false);
    expect(state.files.has(native.from)).toBe(false);
  });

  it("rejects native copy Promise with owned-copy.error, cleaning partial JPEG", async () => {
    const source = "file:///app/cache/Camera/rejected.jpg";
    state.files.set(source, 1200);
    const stages: string[] = [];
    const files = new NativeConditionPhotoFiles();
    const capture = files.capture(source, 1200, 900, (stage, outcome) =>
      stages.push(`${stage}.${outcome}`));
    const native = await pendingCopy();
    native.reject(true);
    await expect(capture).rejects.toThrow("CONDITION_PHOTO_FILE_INVALID");
    expect(stages).toContain("owned-copy.error");
    expect(stages).not.toContain("copy-verify.start");
    expect(state.files.has(native.to)).toBe(false);
    expect(state.files.has(source)).toBe(false);
    expect(state.files.has(native.from)).toBe(false);
    expect(stages.join(" ")).not.toContain("PRIVATE_COPY_NATIVE_FAILURE");
  });

  it.each(["missing", "wrong-size"])("rejects a completed %s destination at copy-verify", async (kind) => {
    const source = "file:///app/cache/Camera/verify.jpg";
    state.files.set(source, 1200);
    const stages: string[] = [];
    const files = new NativeConditionPhotoFiles();
    const capture = files.capture(source, 1200, 900, (stage, outcome) =>
      stages.push(`${stage}.${outcome}`));
    const native = await pendingCopy();
    native.resolve();
    if (kind === "missing") state.files.delete(native.to);
    else state.files.set(native.to, 99);
    await expect(capture).rejects.toThrow("CONDITION_PHOTO_FILE_INVALID");
    expect(stages).toContain("owned-copy.success");
    expect(stages).toContain("copy-verify.error");
    expect(state.files.has(native.to)).toBe(false);
  });

  it("cancellation while copying never recreates a privately owned orphan", async () => {
    const source = "file:///app/cache/Camera/cancelled.jpg";
    state.files.set(source, 1200);
    const files = new NativeConditionPhotoFiles();
    const capture = files.capture(source, 1200, 900);
    const native = await pendingCopy();
    const retired = files.discardAll();
    expect(state.files.has(source)).toBe(true);
    native.resolve();
    await retired;
    await expect(capture).rejects.toThrow();
    expect(state.files.has(native.to)).toBe(false);
    expect(state.files.has(source)).toBe(false);
  });

  it("rejects a synchronous startup purge while Android still writes the destination", async () => {
    const source = "file:///app/cache/Camera/switch-identity.jpg";
    state.files.set(source, 1200);
    const files = new NativeConditionPhotoFiles();
    const capture = files.capture(source, 1200, 900);
    const native = await pendingCopy();
    expect(() => files.purgeStartup()).toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(state.files.has(source)).toBe(true);
    native.resolve();
    await expect(capture).rejects.toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(state.files.has(native.to)).toBe(false);
    expect(files.canCapture()).toBe(false);
    files.purgeStartup();
    expect(files.canCapture()).toBe(true);
  });

  it("direct discard during a pending copy waits for completion before deletion", async () => {
    const source = "file:///app/cache/Camera/close-screen.jpg";
    state.files.set(source, 1200);
    const files = new NativeConditionPhotoFiles();
    const capture = files.capture(source, 1200, 900);
    const native = await pendingCopy();
    const handle = "55555555-5555-4555-8555-555555555555";
    const discarded = files.discard(handle);
    expect(state.deleted).not.toContain(native.to);
    native.resolve();
    await discarded;
    await expect(capture).rejects.toThrow();
    expect(state.files.has(native.to)).toBe(false);
  });

  it("marks cleanup blocked if partial copy rejection cannot delete owned output", async () => {
    const source = "file:///app/cache/Camera/partial-delete.jpg";
    state.files.set(source, 1200);
    const files = new NativeConditionPhotoFiles();
    const capture = files.capture(source, 1200, 900);
    const native = await pendingCopy();
    state.failOwnedDelete = true;
    native.reject(true);
    await expect(capture).rejects.toThrow();
    expect(files.canCapture()).toBe(false);
    expect(state.files.has(native.to)).toBe(true);
    state.failOwnedDelete = false;
    files.purgeStartup();
    expect(state.files.has(native.to)).toBe(false);
    expect(files.canCapture()).toBe(true);
  });
});
