import type { PlateOcrRequest } from "@valet/contracts";
import type { PlateOcrConfig } from "./plate-ocr-config";

const regionHints: Record<PlateOcrRequest["plateCountry"], string | undefined> =
  {
    JO: "jo",
    AE: "ae",
    SA: "sa",
    KW: "kw",
    BH: "bh",
    OTHER: undefined,
  };

/** Private, synchronous dispatch gate: never await between permit and fetch. */
export interface PlateOcrDispatchPermit {
  consumeIfFresh(): boolean;
}

export class PlateOcrProviderTransport {
  private readonly abort = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly onCallerAbort = () => this.abort.abort();
  private readonly form = new FormData();
  readonly signal: AbortSignal;
  fetchInvoked = false;
  timedOut = false;

  constructor(
    private readonly config: PlateOcrConfig,
    input: {
      image: Uint8Array;
      plateCountry: PlateOcrRequest["plateCountry"];
    },
    private readonly http: typeof fetch,
    private readonly callerSignal?: AbortSignal,
  ) {
    this.form.append(
      "upload",
      new Blob([new Uint8Array(input.image)], { type: "image/jpeg" }),
      "plate.jpg",
    );
    const hint = regionHints[input.plateCountry];
    if (hint !== undefined) this.form.append("regions", hint);
    this.signal = this.abort.signal;
    this.callerSignal?.addEventListener("abort", this.onCallerAbort, {
      once: true,
    });
    if (this.callerSignal?.aborted) this.onCallerAbort();
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.abort.abort();
    }, config.timeoutMs);
  }

  dispatch(permit: PlateOcrDispatchPermit): Promise<Response> | undefined {
    if (
      this.signal.aborted ||
      !permit ||
      typeof permit.consumeIfFresh !== "function"
    )
      return undefined;
    // Missing, invalid, stale or throwing permits cannot reach the HTTP client.
    // A valid permit is consumed synchronously at the final dispatch boundary.
    try {
      if (permit.consumeIfFresh() !== true) return undefined;
    } catch {
      return undefined;
    }
    this.fetchInvoked = true;
    const request = this.http(this.config.endpoint, {
      method: "POST",
      body: this.form,
      headers: { Authorization: `Token ${this.config.token}` },
      signal: this.signal,
      redirect: "error",
    });
    // Abort is not evidence that the remote peer stopped. Race the local
    // response wait so a noncooperative transport cannot hang this request.
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("ocr-transport-aborted"));
      if (this.signal.aborted) onAbort();
      else this.signal.addEventListener("abort", onAbort, { once: true });
    });
    return Promise.race([request, cancelled]).finally(() => {
      if (onAbort) this.signal.removeEventListener("abort", onAbort);
    });
  }

  cleanup(): void {
    clearTimeout(this.timer);
    this.callerSignal?.removeEventListener("abort", this.onCallerAbort);
  }
}
