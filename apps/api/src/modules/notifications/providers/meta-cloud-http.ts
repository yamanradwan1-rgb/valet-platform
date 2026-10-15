import { META_HTTP_TIMEOUT_MS, META_RESPONSE_MAX_BYTES } from "../config/meta-cloud-policy.js";
import { classifyMetaReply } from "./meta-cloud-result.js";
import type { OutboundSendResult } from "../contracts/outbound-provider.js";

type FetchLike = typeof fetch;

async function boundedResponseJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > META_RESPONSE_MAX_BYTES)
    throw new Error("response-size-limit");
  if (!response.body) throw new Error("missing-response-body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let finished = false;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) { finished = true; break; }
      length += result.value.byteLength;
      if (length > META_RESPONSE_MAX_BYTES) throw new Error("response-size-limit");
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
    if (!finished) await response.body.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

/** Exactly one POST, no redirects, no internal retry, one bounded deadline. */
export async function sendMetaHttp(args: {
  readonly url: string;
  readonly token: string;
  readonly payload: object;
  readonly upstream: AbortSignal;
  readonly fetchImpl?: FetchLike;
}): Promise<OutboundSendResult> {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  args.upstream.addEventListener("abort", onAbort, { once: true });
  if (args.upstream.aborted) controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, META_HTTP_TIMEOUT_MS);
  try {
    const fetcher = args.fetchImpl ?? fetch;
    const response = await fetcher(args.url, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${args.token}` },
      body: JSON.stringify(args.payload),
    });
    // Redirects, malformed bodies, truncation and uncertain server outcomes cannot be retried.
    if (response.status >= 300 && response.status < 400)
      return { kind: "UNKNOWN", reason: "TRANSPORT" };
    try {
      return classifyMetaReply(response.status, await boundedResponseJson(response),
        response.headers.get("retry-after"));
    } catch {
      return { kind: "UNKNOWN", reason: timedOut ? "TIMEOUT" : "MALFORMED_RESPONSE" };
    }
  } catch {
    return { kind: "UNKNOWN", reason: timedOut ? "TIMEOUT" : "TRANSPORT" };
  } finally {
    clearTimeout(timer);
    args.upstream.removeEventListener("abort", onAbort);
  }
}
