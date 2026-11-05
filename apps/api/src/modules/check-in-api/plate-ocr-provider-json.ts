export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      diagnostic:
        "invalid-json" | "response-body-missing" | "response-too-large";
    };

/** A peer that ignores stream abort must not hold the HTTP request open forever. */
export async function readBoundedOcrJson(
  response: Response,
  signal: AbortSignal,
): Promise<BoundedJsonResult> {
  if (!response.body) return { ok: false, diagnostic: "response-body-missing" };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const signalAbort = () => rejectAbort(new Error("ocr-body-aborted"));
  signal.addEventListener("abort", signalAbort, { once: true });
  if (signal.aborted) signalAbort();
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 64 * 1024)
        return { ok: false, diagnostic: "response-too-large" };
      chunks.push(chunk.value);
    }
    try {
      return {
        ok: true,
        value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
      };
    } catch {
      return { ok: false, diagnostic: "invalid-json" };
    }
  } finally {
    signal.removeEventListener("abort", signalAbort);
    // Cancellation is best effort; it is not proof the remote provider stopped.
    void reader.cancel().catch(() => undefined);
  }
}
