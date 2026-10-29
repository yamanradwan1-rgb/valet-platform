import type {
  ConditionPhotoEvidenceSummary,
  ConditionPhotoUploadStatus,
} from "@valet/contracts";

export type ConditionPhotoSlotPhase =
  | "EMPTY" | "CAPTURED_LOCAL" | "UPLOADING" | "UPLOAD_PENDING"
  | "UPLOADED_VERIFIED" | "UPLOAD_FAILED" | "RETRY_PENDING";

export interface ConditionPhotoSlot {
  readonly slotId: number;
  readonly captureGeneration: number;
  readonly phase: ConditionPhotoSlotPhase;
  readonly thumbnailUri: string | null;
  readonly operationId: string | null;
  readonly vehiclePhotoId: string | null;
  readonly verifiedAt: string | null;
  readonly previewUnavailable: boolean;
  readonly hasCapture: boolean;
}

type MutableSlot = {
  -readonly [K in keyof ConditionPhotoSlot]: ConditionPhotoSlot[K];
} & { handle: string | null };

function emptySlot(slotId: number): MutableSlot {
  return {
    slotId, captureGeneration: 0, phase: "EMPTY", thumbnailUri: null,
    operationId: null, vehiclePhotoId: null, verifiedAt: null,
    previewUnavailable: false, hasCapture: false, handle: null,
  };
}

/** Four presentation slots; immutable server evidence remains independent of local JPEGs. */
export class EmployeeConditionPhotoGallery {
  private slots: MutableSlot[] = Array.from({ length: 4 }, (_, i) => emptySlot(i + 1));
  private generation = 0;
  private historicalTotal = 0;

  get snapshot() {
    const slots: ConditionPhotoSlot[] = this.slots.map((slot) => ({
      slotId: slot.slotId, captureGeneration: slot.captureGeneration,
      phase: slot.phase, thumbnailUri: slot.thumbnailUri,
      operationId: slot.operationId, vehiclePhotoId: slot.vehiclePhotoId,
      verifiedAt: slot.verifiedAt, previewUnavailable: slot.previewUnavailable,
      hasCapture: slot.hasCapture,
    }));
    // Verified records form the deterministic oldest-to-newest visible window.
    // Slot IDs and operation IDs remain stable even when the window advances.
    slots.sort((a, b) => a.phase === "UPLOADED_VERIFIED" &&
        b.phase === "UPLOADED_VERIFIED" ?
      (a.verifiedAt ?? "").localeCompare(b.verifiedAt ?? "") ||
        (a.operationId ?? "").localeCompare(b.operationId ?? "") :
      a.phase === "UPLOADED_VERIFIED" ? -1 :
      b.phase === "UPLOADED_VERIFIED" ? 1 : a.slotId - b.slotId);
    const uploaded = new Set(slots.filter((slot) =>
      slot.phase === "UPLOADED_VERIFIED" && slot.vehiclePhotoId !== null)
      .map((slot) => slot.vehiclePhotoId));
    return {
      slots, capturedCount: slots.filter((slot) => slot.hasCapture ||
        slot.phase === "UPLOADED_VERIFIED").length,
      uploadedCount: uploaded.size,
      verifiedTotal: this.historicalTotal,
    };
  }

  capture(handle: string, thumbnailUri: string | null): number | null {
    const slot = this.slots.find((item) => item.phase === "EMPTY");
    if (!slot) return null;
    slot.phase = "CAPTURED_LOCAL";
    slot.handle = handle;
    slot.hasCapture = true;
    slot.thumbnailUri = thumbnailUri;
    slot.captureGeneration = ++this.generation;
    slot.previewUnavailable = thumbnailUri === null;
    return slot.slotId;
  }

  uploadCandidate(allowSameByteResend = false) {
    const slot = this.slots.find((item) => item.handle !== null &&
      (item.phase === "CAPTURED_LOCAL" ||
        (allowSameByteResend && item.phase === "UPLOAD_PENDING")));
    return slot ? { slotId: slot.slotId, handle: slot.handle!,
      captureGeneration: slot.captureGeneration, operationId: slot.operationId } : null;
  }

  findOperation(operationId: string) {
    return this.slots.find((slot) => slot.operationId === operationId) ?? null;
  }

  begin(slotId: number, operationId: string) {
    const slot = this.slots.find((item) => item.slotId === slotId);
    if (!slot || !slot.handle || (slot.operationId && slot.operationId !== operationId))
      return false;
    if (this.slots.some((item) => item.slotId !== slotId &&
      item.operationId === operationId)) return false;
    slot.operationId = operationId;
    slot.phase = "UPLOADING";
    return true;
  }

  unknown(operationId: string) {
    const slot = this.findOperation(operationId);
    if (slot && slot.phase !== "UPLOADED_VERIFIED") slot.phase = "RETRY_PENDING";
  }

  accept(status: ConditionPhotoUploadStatus): string | null {
    const slot = this.findOperation(status.operationId);
    if (!slot) return null;
    if (status.status === "PENDING") {
      slot.phase = "UPLOAD_PENDING";
      return null;
    }
    const source = slot.handle;
    slot.handle = null;
    if (status.status === "VERIFIED") {
      slot.phase = "UPLOADED_VERIFIED";
      slot.hasCapture = true;
      slot.vehiclePhotoId = status.vehiclePhotoId;
      slot.verifiedAt = status.verifiedAt;
      this.historicalTotal = Math.max(this.historicalTotal, this.verifiedCount());
    } else {
      slot.phase = "UPLOAD_FAILED";
      slot.hasCapture = false;
    }
    return source;
  }

  markMissingSource(slotId: number) {
    const slot = this.slots.find((item) => item.slotId === slotId);
    if (!slot || slot.phase !== "CAPTURED_LOCAL") return;
    slot.handle = null;
    slot.hasCapture = false;
    slot.phase = "UPLOAD_FAILED";
  }

  private verifiedCount() {
    return new Set(this.slots.map((slot) => slot.vehiclePhotoId)
      .filter((id): id is string => id !== null)).size;
  }

  /** Server summary is newest-first; slots display oldest-to-newest within its window. */
  recover(summary: ConditionPhotoEvidenceSummary) {
    this.historicalTotal = summary.verifiedTotal;
    const latest = summary.latestVerified.slice().reverse();
    const ids = new Set(latest.map((record) => record.vehiclePhotoId));
    const discardedThumbs: string[] = [];
    const verifiedSources: string[] = [];
    for (const slot of this.slots) {
      if (slot.phase !== "UPLOADED_VERIFIED" ||
          slot.vehiclePhotoId === null || ids.has(slot.vehiclePhotoId)) continue;
      if (slot.thumbnailUri) discardedThumbs.push(slot.thumbnailUri);
      this.slots[slot.slotId - 1] = emptySlot(slot.slotId);
    }
    for (const record of latest) {
      let slot = this.slots.find((item) =>
        item.vehiclePhotoId === record.vehiclePhotoId ||
        item.operationId === record.operationId);
      if (!slot) slot = this.slots.find((item) => item.phase === "EMPTY");
      if (!slot) continue; // An unresolved local operation has priority until exact GET.
      if (slot.handle) verifiedSources.push(slot.handle);
      slot.handle = null;
      slot.operationId = record.operationId;
      slot.vehiclePhotoId = record.vehiclePhotoId;
      slot.verifiedAt = record.verifiedAt;
      slot.phase = "UPLOADED_VERIFIED";
      slot.hasCapture = true;
      slot.previewUnavailable = slot.thumbnailUri === null;
    }
    return { discardedThumbs, verifiedSources };
  }

  retake(slotId: number) {
    const slot = this.slots.find((item) => item.slotId === slotId);
    if (!slot || !["CAPTURED_LOCAL", "UPLOAD_FAILED"].includes(slot.phase))
      return null;
    const source = slot.handle;
    const thumbnailUri = slot.thumbnailUri;
    this.slots[slotId - 1] = emptySlot(slotId);
    return { source, thumbnailUri };
  }

  /** Clears transient sources. Unknown uploads keep exact operation identity for GET. */
  suspend(inFlightOperationId: string | null) {
    const sources: string[] = [];
    const thumbnails: string[] = [];
    for (const slot of this.slots) {
      if (slot.handle) sources.push(slot.handle);
      slot.handle = null;
      if (slot.phase !== "UPLOADED_VERIFIED" && slot.thumbnailUri)
        thumbnails.push(slot.thumbnailUri);
      if (slot.phase === "UPLOADED_VERIFIED") continue;
      if (slot.operationId && (slot.operationId === inFlightOperationId ||
          slot.phase === "UPLOAD_PENDING" || slot.phase === "RETRY_PENDING")) {
        slot.phase = "RETRY_PENDING";
        slot.hasCapture = false;
        slot.thumbnailUri = null;
        slot.previewUnavailable = true;
      } else this.slots[slot.slotId - 1] = emptySlot(slot.slotId);
    }
    return { sources, thumbnails };
  }

  clear() {
    const sources = this.slots.flatMap((slot) => slot.handle ? [slot.handle] : []);
    const thumbnails = this.slots.flatMap((slot) => slot.thumbnailUri ? [slot.thumbnailUri] : []);
    this.slots = Array.from({ length: 4 }, (_, i) => emptySlot(i + 1));
    this.historicalTotal = 0;
    return { sources, thumbnails };
  }
}
