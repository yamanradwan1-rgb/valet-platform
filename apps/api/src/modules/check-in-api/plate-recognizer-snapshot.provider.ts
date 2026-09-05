import {
  plateOcrCandidateSchema,
  type PlateOcrResponse,
} from "@valet/contracts";
import { Logger } from "@nestjs/common";
import type { PlateOcrProvider } from "./plate-ocr-provider";
import type { PlateOcrConfig } from "./plate-ocr-config";

const hints = {
  JO: "jo",
  AE: "ae",
  SA: "sa",
  KW: "kw",
  BH: "bh",
  OTHER: undefined,
};
const unavailable: PlateOcrResponse = { status: "UNAVAILABLE" };

type ProviderDiagnostic =
  | "candidate-validation-failure"
  | "config-unavailable"
  | "http-non-ok"
  | "http-success"
  | "invalid-json"
  | "invalid-provider-shape"
  | "match"
  | "network-error"
  | "no-match"
  | "request-start"
  | "response-body-missing"
  | "response-too-large"
  | "timeout";

type ParsedResult = {
  response: PlateOcrResponse;
  diagnostic: ProviderDiagnostic;
  resultCount?: number;
};

type BoundedJsonResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      diagnostic:
        "invalid-json" | "response-body-missing" | "response-too-large";
    };

function parseResult(value: unknown, threshold: number): ParsedResult {
  if (
    !value ||
    typeof value !== "object" ||
    !("results" in value) ||
    !Array.isArray(value.results) ||
    value.results.length > 100
  )
    return { response: unavailable, diagnostic: "invalid-provider-shape" };
  const resultCount = value.results.length;
  const candidates = [];
  for (const item of value.results) {
    if (!item || typeof item !== "object")
      return {
        response: unavailable,
        diagnostic: "invalid-provider-shape",
        resultCount,
      };
    const parsed = plateOcrCandidateSchema.safeParse({
      plateNumberRaw: (item as Record<string, unknown>).plate,
      confidence: (item as Record<string, unknown>).score,
    });
    if (!parsed.success)
      return {
        response: unavailable,
        diagnostic: "candidate-validation-failure",
        resultCount,
      };
    if (parsed.data.confidence >= threshold) candidates.push(parsed.data);
  }
  candidates.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      (a.plateNumberRaw < b.plateNumberRaw
        ? -1
        : a.plateNumberRaw > b.plateNumberRaw
          ? 1
          : 0),
  );
  return candidates[0] === undefined
    ? {
        response: { status: "NO_MATCH" },
        diagnostic: "no-match",
        resultCount,
      }
    : {
        response: { status: "MATCH", candidate: candidates[0] },
        diagnostic: "match",
        resultCount,
      };
}

async function boundedJson(response: Response): Promise<BoundedJsonResult> {
  if (!response.body) return { ok: false, diagnostic: "response-body-missing" };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
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
    await reader.cancel().catch(() => undefined);
  }
}

function resultCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || !("results" in value))
    return undefined;
  const results = value.results;
  return Array.isArray(results) && results.length <= 100
    ? results.length
    : undefined;
}

function diagnosticsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
  );
}

export class PlateRecognizerSnapshotProvider implements PlateOcrProvider {
  private readonly logger = new Logger("PlateOcrProvider");

  constructor(
    private readonly config: PlateOcrConfig | undefined,
    private readonly http: typeof fetch = fetch,
  ) {}

  private diagnostic(
    classification: ProviderDiagnostic,
    details: { status?: number; resultCount?: number | undefined } = {},
  ): void {
    if (!diagnosticsEnabled()) return;
    let message = `PLATE_OCR_PROVIDER ${classification}`;
    if (details.status !== undefined) message += ` status=${details.status}`;
    if (details.resultCount !== undefined)
      message += ` results=${details.resultCount}`;
    this.logger.log(message);
  }

  async recognize(
    input: Parameters<PlateOcrProvider["recognize"]>[0],
  ): Promise<PlateOcrResponse> {
    const config = this.config;
    if (!config) {
      this.diagnostic("config-unavailable");
      return unavailable;
    }
    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, config.timeoutMs);
    try {
      const body = new FormData();
      body.append(
        "upload",
        new Blob([new Uint8Array(input.image)], { type: "image/jpeg" }),
        "plate.jpg",
      );
      const hint = hints[input.plateCountry];
      if (hint !== undefined) body.append("regions", hint);
      this.diagnostic("request-start");
      const response = await this.http(config.endpoint, {
        method: "POST",
        body,
        headers: { Authorization: `Token ${config.token}` },
        signal: abort.signal,
        redirect: "error",
      });
      if (!response.ok) {
        this.diagnostic("http-non-ok", { status: response.status });
        await response.body?.cancel().catch(() => undefined);
        return unavailable;
      }
      const bodyResult = await boundedJson(response);
      if (!bodyResult.ok) {
        this.diagnostic("http-success", { status: response.status });
        this.diagnostic(bodyResult.diagnostic, { status: response.status });
        return unavailable;
      }
      const count = resultCount(bodyResult.value);
      this.diagnostic("http-success", {
        status: response.status,
        resultCount: count,
      });
      const parsed = parseResult(bodyResult.value, config.minScore);
      this.diagnostic(parsed.diagnostic, {
        status: response.status,
        resultCount: parsed.resultCount,
      });
      return parsed.response;
    } catch {
      this.diagnostic(timedOut ? "timeout" : "network-error");
      return unavailable;
    } finally {
      clearTimeout(timer);
    }
  }
}
