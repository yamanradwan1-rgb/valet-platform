import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { CONDITION_PHOTO_MAX_JPEG_BYTES } from "@valet/contracts";

/** Only files copied into this feature's private cache are owned here. */
export class NativeConditionPhotoFiles {
  private readonly folder = new Directory(Paths.cache, "vaylet-condition-photos-v1");
  private readonly handles = new Map<string, File>();
  private cleanupBlocked = false;

  purgeStartup(): void {
    this.folder.create({ idempotent: true, intermediates: true });
    let failure = false;
    for (const entry of this.folder.list()) {
      // The name is fixed and only this owned subdirectory is touched.
      try {
        if (entry instanceof File) entry.delete();
        else failure = true;
      } catch {
        failure = true;
      }
    }
    if (failure) throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    this.handles.clear();
    this.cleanupBlocked = false;
  }

  async capture(uri: string, width: number, height: number): Promise<string> {
    if (this.cleanupBlocked) throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    if (!isOwnedCameraCacheUri(uri)) throw new Error("CONDITION_PHOTO_FILE_INVALID");
    const source = new File(uri);
    if (!source.exists || width <= 0 || height <= 0 ||
      !Number.isFinite(width) || !Number.isFinite(height))
      throw new Error("CONDITION_PHOTO_FILE_INVALID");
    const reduction = Math.min(1, 4096 / Math.max(width, height),
      Math.sqrt(12_000_000 / (width * height)));
    const context = ImageManipulator.manipulate(uri);
    let rendered: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
    const temporary: File[] = [];
    let claimedHandle: string | null = null;
    let captureFailure: unknown = null;
    let cleanupFailed = false;
    try {
      if (reduction < 1) context.resize({
        width: Math.floor(width * reduction), height: Math.floor(height * reduction),
      });
      rendered = await context.renderAsync();
      for (const compression of [0.8, 0.55] as const) {
        const saved = await rendered.saveAsync({
          format: SaveFormat.JPEG, compress: compression, base64: false,
        });
        const output = new File(saved.uri);
        temporary.push(output);
        if (!output.exists || output.size <= 0) throw new Error("CONDITION_PHOTO_FILE_INVALID");
        if (output.size > CONDITION_PHOTO_MAX_JPEG_BYTES) continue;
        this.folder.create({ idempotent: true, intermediates: true });
        const handle = createPhotoHandle();
        const owned = new File(this.folder, `${handle}.jpg`);
        this.handles.set(handle, owned);
        try {
          output.copy(owned);
          if (!owned.exists || owned.size !== output.size)
            throw new Error("CONDITION_PHOTO_FILE_INVALID");
        } catch {
          try { await this.discard(handle); } catch { /* retained for purge */ }
          throw new Error("CONDITION_PHOTO_FILE_INVALID");
        }
        claimedHandle = handle;
        break;
      }
      if (claimedHandle === null) throw new Error("CONDITION_PHOTO_FILE_TOO_LARGE");
    } catch (error) {
      captureFailure = error;
    } finally {
      try { rendered?.release(); } catch { cleanupFailed = true; }
      try { context.release(); } catch { cleanupFailed = true; }
      for (const file of temporary) {
        try { if (file.exists) file.delete(); } catch { cleanupFailed = true; }
      }
      try { if (source.exists) source.delete(); } catch { cleanupFailed = true; }
    }
    if (cleanupFailed) {
      if (claimedHandle !== null) await this.discard(claimedHandle);
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
    if (captureFailure !== null) throw captureFailure;
    if (claimedHandle === null) throw new Error("CONDITION_PHOTO_FILE_INVALID");
    return claimedHandle;
  }

  file(handle: string): File {
    const file = this.handles.get(handle);
    if (file === undefined || !file.exists || file.size < 1 ||
      file.size > CONDITION_PHOTO_MAX_JPEG_BYTES)
      throw new Error("CONDITION_PHOTO_FILE_INVALID");
    return file;
  }

  preview(handle: string): string {
    return this.file(handle).uri;
  }

  async discard(handle: string): Promise<void> {
    const file = this.handles.get(handle);
    if (file === undefined) return;
    try {
      if (file.exists) file.delete();
      this.handles.delete(handle);
    } catch {
      // A bounded startup sweep can recover only this application's cache.
      this.cleanupBlocked = true;
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
  }

  async discardAll(): Promise<void> {
    let failure = false;
    for (const handle of Array.from(this.handles.keys())) {
      try { await this.discard(handle); } catch { failure = true; }
    }
    if (failure) throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
  }
}

function createPhotoHandle(): string {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  throw new Error("CONDITION_PHOTO_RANDOM_UNAVAILABLE");
}

/** Camera outputs must be ordinary files inside the app's own cache. */
export function isOwnedCameraCacheUri(uri: string): boolean {
  const root = Paths.cache.uri.replace(/\/+$/, "") + "/";
  if (!uri.startsWith("file://") || !uri.startsWith(root)) return false;
  const tail = uri.slice(root.length);
  return /\.(jpe?g)$/i.test(tail) && !tail.split("/").some((part) =>
    part === "" || part === "." || part === ".." ||
    /%2e|%2f|%5c/i.test(part));
}
