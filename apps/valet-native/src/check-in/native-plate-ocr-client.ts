import {
  plateOcrRequestSchema,
  plateOcrResponseSchema,
  type NativeAuthSession,
  type PlateOcrResponse,
} from "@valet/employee-client";
import { createNativeEmployeeClient } from "../tasks/native-operational-http";

export async function recognizeNativePlate(
  apiOrigin: string,
  auth: NativeAuthSession,
  metadata: { targetLocationId: string; plateCountry: string },
  uri: string,
  signal: AbortSignal,
): Promise<PlateOcrResponse> {
  const input = plateOcrRequestSchema.parse(metadata);
  if (signal.aborted) return { status: "UNAVAILABLE" };
  const body = new FormData();
  body.append("targetLocationId", input.targetLocationId);
  body.append("plateCountry", input.plateCountry);
  // React Native's fetch consumes a local file part without base64/JSON copying.
  body.append("image", {
    uri,
    name: "plate.jpg",
    type: "image/jpeg",
  } as unknown as Blob);
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 15_000);
  const generation = auth.current().authGeneration;
  try {
    const result = await createNativeEmployeeClient(
      apiOrigin,
      auth,
      abort.signal,
    ).request<unknown>({
      method: "POST",
      path: "/v1/staff/check-in/plate-ocr",
      body,
    });
    if (
      signal.aborted ||
      abort.signal.aborted ||
      auth.current().authGeneration !== generation
    )
      return { status: "UNAVAILABLE" };
    return plateOcrResponseSchema.parse(result);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
