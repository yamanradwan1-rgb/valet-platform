import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { nativeSecureRandomUUID } from "../crypto/native-secure-crypto";
import { isScopedGeneratedSourceUri } from "./native-condition-photo-path";
import { conditionPhotoThumbnailSize } from "./native-condition-photo-thumbnail-size";

const MAX_THUMBNAILS = 4;
const MAX_THUMBNAIL_BYTES = 256 * 1024;
const MAX_AGGREGATE_BYTES = 1024 * 1024;
const SOURCE_FOLDER = "vaylet-condition-photos-v1";

interface OwnedThumbnail {
  readonly captureId: string;
  readonly scopeKey: string;
  readonly file: File;
}

/** Ephemeral, in-process private thumbnails; never a durable offline photo store. */
export class NativeConditionPhotoThumbnails {
  private readonly folder = new Directory(Paths.cache, "vaylet-condition-photo-thumbs-v1");
  private readonly owned = new Map<string, OwnedThumbnail>();
  private readonly retiredCaptures = new Set<string>();
  private epoch = 0;
  private pending = 0;
  private blocked = false;

  /** Startup cleanup has to succeed before a new captured image is displayable. */
  purgeStartup(): void {
    this.retireScope();
    if (this.pending) {
      this.blocked = true;
      throw new Error("CONDITION_PHOTO_THUMBNAIL_CLEANUP_UNAVAILABLE");
    }
    try {
      this.folder.create({ idempotent: true, intermediates: true });
      for (const entry of this.folder.list()) {
        if (!(entry instanceof File)) throw new Error("Unexpected thumbnail directory");
        entry.delete();
      }
      this.owned.clear();
      this.retiredCaptures.clear();
      this.blocked = false;
    } catch {
      this.blocked = true;
      throw new Error("CONDITION_PHOTO_THUMBNAIL_CLEANUP_UNAVAILABLE");
    }
  }

  private deleteOwned(file: File): void {
    try { if (file.exists) file.delete(); }
    catch {
      this.blocked = true;
      throw new Error("CONDITION_PHOTO_THUMBNAIL_CLEANUP_UNAVAILABLE");
    }
  }

  private bytes() {
    return [...this.owned.values()].reduce((size, record) =>
      size + (record.file.exists ? record.file.size : 0), 0);
  }

  async create(input: {
    readonly sourceUri: string;
    readonly scopeKey: string;
    readonly captureId: string;
  }): Promise<string | null> {
    if (this.blocked || !input.scopeKey || !input.captureId)
      throw new Error("CONDITION_PHOTO_THUMBNAIL_SCOPE_UNAVAILABLE");
    const sourceRoot = new Directory(Paths.cache, SOURCE_FOLDER).uri.replace(/\/+$/, "") + "/";
    const sourceName = input.sourceUri.slice(sourceRoot.length);
    if (!input.sourceUri.startsWith(sourceRoot) ||
        !input.sourceUri.startsWith("file://") ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i
          .test(sourceName))
      throw new Error("CONDITION_PHOTO_THUMBNAIL_SOURCE_NOT_OWNED");
    const existing = this.owned.get(input.captureId);
    if (existing) return existing.scopeKey === input.scopeKey ? existing.file.uri : null;
    if (this.owned.size + this.pending >= MAX_THUMBNAILS) return null;

    const generation = this.epoch;
    this.pending += 1;
    let rendered: File | null = null;
    let target: File | null = null;
    let outcome: string | null = null;
    let cleanupFailed = false;
    let operationBlocked = false;
    try {
      const size = await conditionPhotoThumbnailSize(input.sourceUri);
      const manipulator = ImageManipulator.manipulate(input.sourceUri);
      try {
        manipulator.resize(size);
        const result = await manipulator.renderAsync();
        try {
          const saved = await result.saveAsync({ format: SaveFormat.JPEG, compress: 0.72 });
          if (!isScopedGeneratedSourceUri(saved.uri))
            throw new Error("CONDITION_PHOTO_THUMBNAIL_TEMP_NOT_OWNED");
          rendered = new File(saved.uri);
        } finally { result.release(); }
      } finally { manipulator.release(); }
      if (this.epoch === generation && !this.retiredCaptures.has(input.captureId)) {
        const id = nativeSecureRandomUUID();
        target = new File(this.folder, `${id}.jpg`);
        this.folder.create({ idempotent: true, intermediates: true });
        await rendered.copy(target);
        if (target.exists && target.size >= 1 && target.size <= MAX_THUMBNAIL_BYTES &&
            this.bytes() + target.size <= MAX_AGGREGATE_BYTES &&
            this.epoch === generation && !this.retiredCaptures.has(input.captureId)) {
          this.owned.set(input.captureId, {
            captureId: input.captureId, scopeKey: input.scopeKey, file: target,
          });
          outcome = target.uri;
          target = null; // ownership now belongs to the bounded active map
        }
      }
    } catch {
      operationBlocked = this.blocked;
    } finally {
      try {
        if (target) this.deleteOwned(target);
        if (rendered && isScopedGeneratedSourceUri(rendered.uri))
          this.deleteOwned(rendered);
      } catch { cleanupFailed = true; this.blocked = true; }
      this.pending -= 1;
      if (this.pending === 0) this.retiredCaptures.clear();
    }
    if (operationBlocked || cleanupFailed)
      throw new Error("CONDITION_PHOTO_THUMBNAIL_CLEANUP_UNAVAILABLE");
    return outcome; // a failed thumbnail cannot invent a JPEG upload failure
  }

  /** A retained URI is valid only for this exact in-process actor/Check-In scope. */
  preview(captureId: string, scopeKey: string): string | null {
    const record = this.owned.get(captureId);
    if (!record || record.scopeKey !== scopeKey || this.blocked) return null;
    return record.file.exists && record.file.size <= MAX_THUMBNAIL_BYTES ?
      record.file.uri : null;
  }

  discardByCaptureId(captureId: string): void {
    if (this.pending) this.retiredCaptures.add(captureId);
    const record = this.owned.get(captureId);
    if (!record) return;
    this.deleteOwned(record.file);
    this.owned.delete(captureId);
  }

  discardByUri(uri: string): void {
    for (const record of this.owned.values())
      if (record.file.uri === uri) this.discardByCaptureId(record.captureId);
  }

  retireScope(): void { this.epoch += 1; }

  discardAll(): void {
    this.retireScope();
    for (const captureId of [...this.owned.keys()])
      this.discardByCaptureId(captureId);
  }
}
