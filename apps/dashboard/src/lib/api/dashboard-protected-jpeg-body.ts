import { dashboardMalformedError } from "./dashboard-api-error";

const MAX_JPEG_BYTES = 8 * 1024 * 1024;

/**
 * Read authenticated JPEG bytes with an upper bound *during* streaming, before
 * allocating a renderable Blob. Never buffer an untrusted full response.
 */
export async function readProtectedJpegBody(response: Response, signal?: AbortSignal): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_JPEG_BYTES)) {
    throw dashboardMalformedError();
  }
  if (!response.body) throw dashboardMalformedError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_JPEG_BYTES) throw dashboardMalformedError();
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    reader.releaseLock();
    if (signal?.aborted || total > MAX_JPEG_BYTES) void response.body.cancel().catch(() => {});
  }
}
