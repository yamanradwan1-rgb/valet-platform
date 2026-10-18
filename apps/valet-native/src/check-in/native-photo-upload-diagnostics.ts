import { conditionPhotoOperationIdSchema } from "@valet/contracts";
import type { ConditionPhotoTransport } from "@valet/employee-client";
import type { NativePinnedDiagnostics } from "../telemetry/native-pinned-diagnostics";
import { observePhotoStage } from "./native-photo-stage";
import { nativeSecureRandomUUID } from "../crypto/native-secure-crypto";

/** Tracks only closed stages, never operation IDs, handles or HTTP contents. */
export function instrumentConditionPhotoUpload(
  sourceOrFactory: ConditionPhotoTransport |
    ((onUploadDispatch: (signal: AbortSignal) => void,
      onUploadResponse: (signal: AbortSignal, outcome: "success" | "error") => void) => ConditionPhotoTransport),
  pinned: NativePinnedDiagnostics,
  uuid: () => string = () => {
    try { return nativeSecureRandomUUID(); }
    catch { throw new Error("CONDITION_PHOTO_RANDOM_UNAVAILABLE"); }
  },
) {
  let active: number | null = null;
  let dispatchedToken: number | null = null;
  let responseErrorToken: number | null = null;
  let activeSignal: AbortSignal | null = null;
  const source = typeof sourceOrFactory === "function"
    ? sourceOrFactory((signal) => {
      if (active !== null && activeSignal === signal && !signal.aborted) {
        dispatchedToken = active;
        pinned.stage("photo", active, "upload-body", "success");
      }
    }, (signal, outcome) => {
      if (active !== null && activeSignal === signal && !signal.aborted) {
        pinned.stage("photo", active, "upload-response", outcome);
        if (outcome === "error") responseErrorToken = active;
      }
    }) : sourceOrFactory;
  const cancel = () => {
    if (active !== null) pinned.cancel("photo", active);
    active = null;
    activeSignal = null;
  };
  const createOperationId = () => {
    const token = pinned.begin("photo");
    active = token;
    try {
      return observePhotoStage((stage, outcome) =>
        pinned.stage("photo", token, stage, outcome),
      "upload-uuid", () => conditionPhotoOperationIdSchema.parse(uuid()));
    } catch (error) {
      pinned.complete("photo", token, "failed", "not-attempted");
      active = null;
      throw error;
    }
  };
  const transport: ConditionPhotoTransport = {
    ...source,
    async upload(sessionId, operationId, handle, signal) {
      const token = active ?? pinned.begin("photo");
      active = token;
      activeSignal = signal;
      dispatchedToken = null;
      responseErrorToken = null;
      pinned.stage("photo", token, "upload-body", "start");
      pinned.stage("photo", token, "upload-transport", "start");
      try {
        const result = await source.upload(sessionId, operationId, handle, signal);
        if (active === token && !signal.aborted) {
          pinned.stage("photo", token, "upload-transport", "success");
          pinned.stage("photo", token, "upload-response",
            result.status === "REJECTED" || result.status === "EXPIRED"
              ? "error" : "success");
          pinned.complete("photo", token,
            result.status === "VERIFIED" ? "success" :
              result.status === "PENDING" ? "unknown" : "failed",
            result.status === "VERIFIED" ? "verified" : "server-responded");
        }
        return result;
      } catch (error) {
        if (active === token && !signal.aborted) {
          const dispatched = dispatchedToken === token;
          if (responseErrorToken !== token)
            pinned.stage("photo", token,
              dispatched ? "upload-transport" : "upload-body", "error");
          pinned.complete("photo", token, "failed",
            dispatched ? "attempted-unknown" : "not-attempted");
        }
        throw error;
      } finally {
        if (active === token) { active = null; activeSignal = null; }
      }
    },
  };
  return { cancel, createOperationId, transport };
}
