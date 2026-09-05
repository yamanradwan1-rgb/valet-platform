import {
  plateOcrCandidateSchema,
  type PlateOcrResponse,
} from "@valet/contracts";
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

function parseResult(value: unknown, threshold: number): PlateOcrResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("results" in value) ||
    !Array.isArray(value.results) ||
    value.results.length > 100
  )
    return unavailable;
  const candidates = [];
  for (const item of value.results) {
    if (!item || typeof item !== "object") return unavailable;
    const parsed = plateOcrCandidateSchema.safeParse({
      plateNumberRaw: (item as Record<string, unknown>).plate,
      confidence: (item as Record<string, unknown>).score,
    });
    if (!parsed.success) return unavailable;
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
    ? { status: "NO_MATCH" }
    : { status: "MATCH", candidate: candidates[0] };
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 64 * 1024) throw new Error("Unavailable");
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export class PlateRecognizerSnapshotProvider implements PlateOcrProvider {
  constructor(
    private readonly config: PlateOcrConfig | undefined,
    private readonly http: typeof fetch = fetch,
  ) {}

  async recognize(
    input: Parameters<PlateOcrProvider["recognize"]>[0],
  ): Promise<PlateOcrResponse> {
    const config = this.config;
    if (!config) return unavailable;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), config.timeoutMs);
    try {
      const body = new FormData();
      body.append(
        "upload",
        new Blob([new Uint8Array(input.image)], { type: "image/jpeg" }),
        "plate.jpg",
      );
      const hint = hints[input.plateCountry];
      if (hint !== undefined) body.append("regions", hint);
      const response = await this.http(config.endpoint, {
        method: "POST",
        body,
        headers: { Authorization: `Token ${config.token}` },
        signal: abort.signal,
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        return unavailable;
      }
      return parseResult(await boundedJson(response), config.minScore);
    } catch {
      return unavailable;
    } finally {
      clearTimeout(timer);
    }
  }
}
