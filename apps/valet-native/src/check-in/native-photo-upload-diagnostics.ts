import { conditionPhotoOperationIdSchema } from "@valet/contracts";
import type { ConditionPhotoTransport } from "@valet/employee-client";
import type { NativePinnedDiagnostics } from "../telemetry/native-pinned-diagnostics";
import { observePhotoStage } from "./native-photo-stage";

/** Tracks only closed stages, never operation IDs, handles or HTTP contents. */
export function instrumentConditionPhotoUpload(
  sourceOrFactory: ConditionPhotoTransport |
    ((onUploadDispatch: () => void,
      onUploadResponse: (outcome: "success" | "error") => void) => ConditionPhotoTransport),
  pinned: NativePinnedDiagnostics,
  uuid: () => string = () => {
    if (typeof globalThis.crypto?.randomUUID !== "function")
      throw new Error("CONDITION_PHOTO_RANDOM_UNAVAILABLE");
    return globalThis.crypto.randomUUID();
  },
) {
  let active: number | null = null;
  let dispatchedToken: number | null = null;
  let responseErrorToken: number | null = null;
  const source = typeof sourceOrFactory === "function"
    ? sourceOrFactory(() => {
      if (active !== null) {
        dispatchedToken = active;
        pinned.stage("photo", active, "upload-body", "success");
      }
    }, (outcome) => {
      if (active !== null) {
        pinned.stage("photo", active, "upload-response", outcome);
        if (outcome === "error") responseErrorToken = active;
      }
    }) : sourceOrFactory;
  const cancel = () => {
    if (active !== null) pinned.cancel("photo", active);
    active = null;
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
        if (active === token) active = null;
      }
    },
  };
  return { cancel, createOperationId, transport };
}
