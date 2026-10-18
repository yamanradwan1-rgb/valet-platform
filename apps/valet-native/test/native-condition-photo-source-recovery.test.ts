import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  bytes: new Map<string, number>(),
  text: new Map<string, string>(),
  blocked: new Set<string>(),
  failedWrite: false,
  deleted: [] as string[],
}));

vi.mock("../src/crypto/native-secure-crypto", () => ({
  nativeSecureRandomUUID: () => "12345678-1234-4123-8123-123456789abc",
}));
vi.mock("expo-file-system", () => {
  class File {
    readonly uri: string;
    constructor(input: string | { uri: string }, name?: string) {
      this.uri = typeof input === "string" ? input : `${input.uri}/${name}`;
    }
    get exists() { return io.bytes.has(this.uri) || io.text.has(this.uri); }
    get size() { return io.bytes.get(this.uri) ?? 0; }
    textSync() { return io.text.get(this.uri) ?? ""; }
    write(value: string) {
      if (io.failedWrite) throw new Error("PRIVATE_FS_WRITE_FAILURE");
      io.text.set(this.uri, value);
    }
    delete() {
      io.deleted.push(this.uri);
      if (io.blocked.has(this.uri)) throw new Error("PRIVATE_FS_ERROR");
      io.bytes.delete(this.uri);
      io.text.delete(this.uri);
    }
  }
  class Directory {
    readonly uri: string;
    constructor(parent: { uri: string }, name: string) { this.uri = `${parent.uri}/${name}`; }
    create() { /* private folder */ }
    get exists() { return [...io.bytes.keys()].some((key) => key.startsWith(`${this.uri}/`)); }
    list() { return [...io.bytes.keys()].filter((key) => key.startsWith(`${this.uri}/`))
      .map((key) => new File(key)); }
  }
  return { File, Directory, Paths: {
    cache: { uri: "file:///app/cache" }, document: { uri: "file:///app/docs" },
  } };
});
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: {}, SaveFormat: { JPEG: "jpeg" },
}));
const { NativeConditionPhotoFiles } =
  await import("../src/check-in/native-condition-photo-files");

beforeEach(() => {
  io.bytes.clear(); io.text.clear(); io.blocked.clear(); io.deleted.length = 0;
  io.failedWrite = false;
});

describe("private Camera cache cleanup after process death", () => {
  it("persists only a contained JPEG cleanup pointer and retries after a new instance", () => {
    const raw = "file:///app/cache/Camera/550e8400-e29b-41d4-a716-446655440000.jpg";
    const journal = "file:///app/docs/vaylet-photo-source-cleanup-v1.json";
    io.bytes.set(raw, 2000); io.blocked.add(raw);
    const first = new NativeConditionPhotoFiles();
    expect(() => first.discardCapturedCameraSource(raw))
      .toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(first.canCapture()).toBe(false);
    expect(io.text.get(journal)).toBe(JSON.stringify({ capturePending: false, sources: [raw] }));
    const restarted = new NativeConditionPhotoFiles();
    expect(() => restarted.purgeStartup()).toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(restarted.canCapture()).toBe(false);
    io.blocked.delete(raw);
    const recovered = new NativeConditionPhotoFiles();
    recovered.purgeStartup();
    expect(recovered.canCapture()).toBe(true);
    expect(io.bytes.has(raw)).toBe(false);
    expect(io.text.has(journal)).toBe(false);
  });

  it("rejects tampered journal rather than deleting arbitrary app data", () => {
    const foreign = "file:///app/cache/another-feature/customer.jpg";
    const owned = "file:///app/cache/vaylet-condition-photos-v1/orphan.jpg";
    const unknown = "file:///app/cache/Camera/12345678-1234-4123-8123-123456789abc.jpg";
    io.bytes.set(foreign, 1200);
    io.bytes.set(owned, 2200);
    io.bytes.set(unknown, 512);
    io.text.set("file:///app/docs/vaylet-photo-source-cleanup-v1.json",
      JSON.stringify([foreign]));
    const files = new NativeConditionPhotoFiles();
    expect(() => files.purgeStartup()).toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(files.canCapture()).toBe(false);
    expect(io.deleted).not.toContain(foreign);
    expect(JSON.stringify(io.deleted)).not.toContain("customer.jpg");
    expect(io.deleted).toContain(owned);
    io.bytes.delete(unknown);
    const clean = new NativeConditionPhotoFiles();
    clean.purgeStartup();
    expect(clean.canCapture()).toBe(true);
    expect(io.bytes.has(foreign)).toBe(true);
  });

  it("rejects a journal write failure before any camera shutter could open", () => {
    io.failedWrite = true;
    const files = new NativeConditionPhotoFiles();
    expect(() => files.beginCapture()).toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(files.canCapture()).toBe(false);
    expect(io.deleted).toEqual([]);
  });

  it("preserves a pre-shutter crash marker across process restart", () => {
    const first = new NativeConditionPhotoFiles();
    first.beginCapture();
    expect(first.canCapture()).toBe(false);
    const uncertain = "file:///app/cache/Camera/12345678-1234-4123-8123-123456789abc.jpg";
    io.bytes.set(uncertain, 2048);
    const next = new NativeConditionPhotoFiles();
    expect(() => next.purgeStartup()).toThrow("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    expect(next.canCapture()).toBe(false);
    // Only a verified empty SDK Camera cache allows fail-closed recovery.
    io.bytes.delete(uncertain);
    const clean = new NativeConditionPhotoFiles();
    clean.purgeStartup();
    expect(clean.canCapture()).toBe(true);
  });

  it("recovers from a transient camera rejection only after safe cache scan", () => {
    const files = new NativeConditionPhotoFiles();
    files.beginCapture();
    files.resolveUnknownCapture();
    expect(files.canCapture()).toBe(true);
    const raw = "file:///app/cache/Camera/12345678-1234-4123-8123-123456789abc.jpg";
    io.bytes.set(raw, 2300);
    files.beginCapture();
    files.resolveUnknownCapture();
    expect(files.canCapture()).toBe(false);
    expect(io.bytes.has(raw)).toBe(true);
  });
});
