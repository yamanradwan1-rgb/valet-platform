import {
  createEmployeeConditionPhotoTransport,
  type NativeAuthSession,
} from "@valet/employee-client";
import { createNativeEmployeeClient } from "../tasks/native-operational-http";
import type { NativeConditionPhotoFiles } from "./native-condition-photo-files";

/** Expo File implements the actual multipart body; no URI descriptors or JSON bytes. */
export function createNativeConditionPhotoTransport(
  apiOrigin: string,
  auth: NativeAuthSession,
  files: NativeConditionPhotoFiles,
  onUploadDispatch?: (signal: AbortSignal) => void,
  onUploadResponse?: (signal: AbortSignal, outcome: "success" | "error") => void,
) {
  return createEmployeeConditionPhotoTransport(
    (signal) => createNativeEmployeeClient(apiOrigin, auth, signal),
    (operationId, handle) => {
      const body = new FormData();
      body.append("operationId", operationId);
      body.append("image", files.file(handle));
      return body;
    },
    onUploadDispatch,
    onUploadResponse,
  );
}
