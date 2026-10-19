import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { CONDITION_PHOTO_MAX_JPEG_BYTES } from "@valet/contracts";
import { nativeSecureRandomUUID } from "../crypto/native-secure-crypto";
import { hasUndiscardedSdkJpeg, isOwnedCameraCacheUri,
  isScopedGeneratedSourceUri } from "./native-condition-photo-path";
export { isOwnedCameraCacheUri } from "./native-condition-photo-path";
import { notify, observePhotoStage, observePhotoStageAsync,
  type NativePhotoStageObserver } from "./native-photo-stage";
import { NativeConditionPhotoOwnedCopy } from "./native-condition-photo-owned-copy";

/** Only files copied into this feature's private cache are owned here. */
export class NativeConditionPhotoFiles {
  private readonly folder = new Directory(Paths.cache, "vaylet-condition-photos-v1");
  private readonly recoveryFile = new File(Paths.document, "vaylet-photo-source-cleanup-v1.json");
  private readonly handles = new Map<string, File>();
  private readonly ownedCopy = new NativeConditionPhotoOwnedCopy();
  /** Private, in-process retry handles; never exported or added to telemetry. */
  private readonly pendingSourceCleanup = new Map<string, File>();
  private cleanupBlocked = false;
  private capturePending = false;

  /** Do not activate a shutter while cleanup of prior private photos is blocked. */
  canCapture(): boolean { return !this.cleanupBlocked && !this.capturePending; }
  /** Camera failed before producing a usable URI: never assume no JPEG exists. */
  resolveUnknownCapture(): void {
    if (!this.capturePending || this.cleanupBlocked) return;
    try {
      if (hasUndiscardedSdkJpeg() || this.pendingSourceCleanup.size > 0) {
        this.cleanupBlocked = true;
        return;
      }
      this.capturePending = false;
      this.persistPendingSources();
    } catch {
      this.capturePending = true;
      this.cleanupBlocked = true;
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
  }

  /** Commit a private crash barrier before the camera creates JPEG bytes. */
  beginCapture(): void {
    if (!this.canCapture()) throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    this.capturePending = true;
    try {
      this.persistPendingSources();
      if (this.recoveryFile.textSync() !== this.recoveryJournal())
        throw new Error("private journal readback failed");
    } catch {
      this.cleanupBlocked = true;
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
  }
  /** Only after the captured source was actually handled by the file owner. */
  finishCapture(): void {
    if (this.cleanupBlocked || this.pendingSourceCleanup.size > 0) return;
    this.capturePending = false;
    try { this.persistPendingSources(); } catch {
      this.cleanupBlocked = true;
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
  }
  private recoveryJournal(): string {
    return JSON.stringify({ capturePending: this.capturePending,
      sources: [...this.pendingSourceCleanup.keys()].filter(isScopedGeneratedSourceUri) });
  }
  /** A durable list contains only validated app-private Camera JPEG paths. */
  private persistPendingSources(): void {
    const scoped = [...this.pendingSourceCleanup.keys()].filter(isScopedGeneratedSourceUri);
    if (scoped.length === 0 && !this.capturePending) {
      if (this.recoveryFile.exists) this.recoveryFile.delete();
    } else {
      this.recoveryFile.write(this.recoveryJournal());
    }
  }
  discardCapturedCameraSource(uri: string): void {
    if (isOwnedCameraCacheUri(uri)) this.deletePrivateSource(new File(uri));
  }
  private deletePrivateSource(file: File): void {
    try {
      if (file.exists) file.delete();
      this.pendingSourceCleanup.delete(file.uri);
    } catch {
      this.cleanupBlocked = true;
      // Only known private camera/manipulator JPEGs may be retained for retry.
      if (isOwnedCameraCacheUri(file.uri) && this.pendingSourceCleanup.size < 16) {
        this.pendingSourceCleanup.set(file.uri, file);
        try { this.persistPendingSources(); } catch { /* fail closed */ }
      }
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
  }
  purgeStartup(): void {
    if (!this.ownedCopy.canPurge()) {
      this.cleanupBlocked = true;
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
    let journalInvalid = false;
    if (this.recoveryFile.exists) {
      try {
        const stored: unknown = JSON.parse(this.recoveryFile.textSync());
        if (!stored || typeof stored !== "object" || Array.isArray(stored))
          throw new Error("invalid scoped recovery");
        const parsed = stored as { capturePending?: unknown; sources?: unknown };
        if (typeof parsed.capturePending !== "boolean" ||
            !Array.isArray(parsed.sources) || parsed.sources.length > 16 ||
            !parsed.sources.every((uri) => typeof uri === "string" && isScopedGeneratedSourceUri(uri)))
          throw new Error("invalid scoped recovery");
        this.capturePending = parsed.capturePending;
        for (const uri of parsed.sources) this.pendingSourceCleanup.set(uri, new File(uri));
      } catch {
        this.cleanupBlocked = true;
        journalInvalid = true;
      }
    }
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
    for (const file of this.pendingSourceCleanup.values()) {
      try { this.deletePrivateSource(file); } catch { failure = true; }
    }
    // An interrupted shutter can leave no known URI. Never sweep shared SDK
    // camera cache: only lift the crash barrier after both SDK output folders
    // contain zero UUID-named generated JPEGs (e.g. after OS Clear Cache).
    if (!failure && (this.capturePending || journalInvalid)) {
      try {
        if (!hasUndiscardedSdkJpeg()) {
          this.capturePending = false;
          journalInvalid = false;
        }
      } catch { failure = true; }
    }
    if (failure || this.capturePending || journalInvalid) {
      this.cleanupBlocked = true;
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
    try { this.persistPendingSources(); } catch {
      this.cleanupBlocked = true;
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
    this.handles.clear();
    this.cleanupBlocked = false;
  }

  async capture(
    uri: string, width: number, height: number,
    observe?: NativePhotoStageObserver,
  ): Promise<string> {
    const generation = this.ownedCopy.generation();
    if (this.cleanupBlocked) {
      // The camera already created a new raw JPEG before this call. Discard
      // only verified camera-cache input even while owned-cache cleanup is blocked.
      if (isOwnedCameraCacheUri(uri)) {
        try { this.discardCapturedCameraSource(uri); }
        catch { /* remain blocked; no unsafe location or path emitted */ }
      }
      notify(observe, "cleanup", "error");
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
    observePhotoStage(observe, "cache-uri", () => {
      if (!isOwnedCameraCacheUri(uri)) throw new Error("CONDITION_PHOTO_FILE_INVALID");
    });
    let source: File;
    try {
      source = observePhotoStage(observe, "source-file", () => {
        const file = new File(uri);
        if (!file.exists || width <= 0 || height <= 0 ||
          !Number.isFinite(width) || !Number.isFinite(height))
          throw new Error("CONDITION_PHOTO_FILE_INVALID");
        return file;
      });
    } catch (error) {
      // The URI has already passed our private camera-cache containment check.
      // A malformed dimension result must not strand raw photo bytes.
      try {
        this.deletePrivateSource(new File(uri));
        notify(observe, "cleanup", "success");
      } catch {
        notify(observe, "cleanup", "error");
      }
      throw error;
    }
    const reduction = Math.min(1, 4096 / Math.max(width, height),
      Math.sqrt(12_000_000 / (width * height)));
    let context: ReturnType<typeof ImageManipulator.manipulate> | null = null;
    let rendered: Awaited<ReturnType<
      ReturnType<typeof ImageManipulator.manipulate>["renderAsync"]
    >> | null = null;
    const temporary: File[] = [];
    let claimedHandle: string | null = null;
    let captureFailure: unknown = null;
    let cleanupFailed = false;
    try {
      const currentContext = observePhotoStage(observe, "manipulator-init", () =>
        ImageManipulator.manipulate(uri));
      context = currentContext;
      observePhotoStage(observe, "image-resize", () => {
        if (reduction < 1) currentContext.resize({
          width: Math.floor(width * reduction), height: Math.floor(height * reduction),
        });
      });
      rendered = await observePhotoStageAsync(observe, "image-render", () =>
        currentContext.renderAsync());
      for (const compression of [0.8, 0.55] as const) {
        const saved = await observePhotoStageAsync(observe, "jpeg-save", () =>
          rendered!.saveAsync({
            format: SaveFormat.JPEG, compress: compression, base64: false,
          }));
        const output = observePhotoStage(observe, "jpeg-size", () => {
          const file = new File(saved.uri);
          if (!file.exists || file.size <= 0)
            throw new Error("CONDITION_PHOTO_FILE_INVALID");
          return file;
        });
        temporary.push(output);
        if (output.size > CONDITION_PHOTO_MAX_JPEG_BYTES) continue;
        const handle = observePhotoStage(observe, "photo-handle-uuid",
          createPhotoHandle);
        const owned = new File(this.folder, `${handle}.jpg`);
        this.handles.set(handle, owned);
        try {
          await this.ownedCopy.copyAndVerify(handle, output, owned, this.folder,
            generation, observe);
        } catch {
          try { await this.discard(handle); } catch { /* retained for purge */ }
          if (this.cleanupBlocked) throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
          throw new Error("CONDITION_PHOTO_FILE_INVALID");
        }
        claimedHandle = handle;
        break;
      }
      if (claimedHandle === null) {
        notify(observe, "jpeg-size", "error");
        throw new Error("CONDITION_PHOTO_FILE_TOO_LARGE");
      }
    } catch (error) {
      captureFailure = error;
    } finally {
      try { rendered?.release(); } catch { cleanupFailed = true; }
      try { context?.release(); } catch { cleanupFailed = true; }
      for (const file of temporary) {
        try { this.deletePrivateSource(file); } catch { cleanupFailed = true; }
      }
      try { this.deletePrivateSource(source); } catch { cleanupFailed = true; }
      notify(observe, "cleanup", cleanupFailed ? "error" : "success");
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
      await this.ownedCopy.settleBeforeDiscard(handle);
      if (file.exists) file.delete();
      this.handles.delete(handle);
    } catch {
      // A bounded startup sweep can recover only this application's cache.
      this.cleanupBlocked = true;
      throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
    }
  }

  async discardAll(): Promise<void> {
    this.ownedCopy.retireScope();
    let failure = false;
    for (const handle of Array.from(this.handles.keys())) {
      try { await this.discard(handle); } catch { failure = true; }
    }
    if (failure) throw new Error("CONDITION_PHOTO_CLEANUP_UNAVAILABLE");
  }
}
function createPhotoHandle(): string {
  try { return nativeSecureRandomUUID(); }
  catch { throw new Error("CONDITION_PHOTO_RANDOM_UNAVAILABLE"); }
}
