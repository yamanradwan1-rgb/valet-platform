import {
  plateOcrCandidateSchema,
  type PlateOcrResponse,
} from "@valet/contracts";
import { Logger, type OnModuleInit } from "@nestjs/common";
import type {
  PlateOcrObservedOptions,
  PlateOcrObservedResult,
  PlateOcrProvider,
} from "./plate-ocr-provider";
import type { PlateOcrConfig, PlateOcrConfigIssue } from "./plate-ocr-config";
import { readBoundedOcrJson } from "./plate-ocr-provider-json";
import { PlateOcrProviderTransport } from "./plate-ocr-provider-transport";
const unavailable: PlateOcrResponse = { status: "UNAVAILABLE" };

type ProviderDiagnostic =
  | "candidate-validation-failure"
  | "cancelled"
  | PlateOcrConfigIssue
  | "http-non-ok"
  | "http-success"
  | "invalid-json"
  | "invalid-provider-shape"
  | "match"
  | "network-error"
  | "no-match"
  | "pre-dispatch-error"
  | "request-start"
  | "response-body-missing"
  | "response-too-large"
  | "timeout";

type ParsedResult = {
  response: PlateOcrResponse;
  diagnostic: ProviderDiagnostic;
  resultCount?: number;
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

function resultCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || !("results" in value))
    return undefined;
  const results = value.results;
  return Array.isArray(results) && results.length <= 100
    ? results.length
    : undefined;
}

export class PlateRecognizerSnapshotProvider
  implements PlateOcrProvider, OnModuleInit
{
  private readonly logger = new Logger("PlateOcrProvider");

  constructor(
    private readonly config: PlateOcrConfig | undefined,
    private readonly http: typeof fetch = fetch,
    private readonly configIssue: PlateOcrConfigIssue = "provider-config-missing",
  ) {}

  canDispatch(): boolean {
    return this.config !== undefined;
  }

  admissionTimeoutMs(): number | undefined {
    return this.config?.timeoutMs;
  }

  onModuleInit(): void {
    if (!this.config)
      this.logger.warn(`PLATE_OCR_READINESS ${this.configIssue}`);
  }

  private diagnostic(
    classification: ProviderDiagnostic,
    details: { status?: number; resultCount?: number | undefined } = {},
  ): void {
    let message = `PLATE_OCR_PROVIDER ${classification}`;
    if (details.status !== undefined) message += ` status=${details.status}`;
    if (details.resultCount !== undefined)
      message += ` results=${details.resultCount}`;
    this.logger.log(message);
  }

  async recognize(
    input: Parameters<PlateOcrProvider["recognize"]>[0],
  ): Promise<PlateOcrResponse> {
    // The old neutral-only interface is retained for controlled local tests.
    // Production callers must present a sealed one-use permit instead.
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NODE_ENV !== "test"
    )
      return unavailable;
    return (await this.perform(input)).response;
  }

  recognizeObserved(
    input: Parameters<PlateOcrProvider["recognize"]>[0],
    options: PlateOcrObservedOptions,
  ): Promise<PlateOcrObservedResult> {
    return this.perform(input, options);
  }

  private async perform(
    input: Parameters<PlateOcrProvider["recognize"]>[0],
    options?: PlateOcrObservedOptions,
  ): Promise<PlateOcrObservedResult> {
    const started = performance.now();
    let response: PlateOcrResponse = unavailable;
    let httpClass: "NONE" | "2XX" | "4XX" | "5XX" = "NONE";
    let failureClass:
      | "NONE"
      | "TIMEOUT"
      | "CANCELLED"
      | "NETWORK"
      | "PROVIDER"
      | "PARSE"
      | "OTHER" = "NONE";
    let httpResponseComplete = false;
    let transport: PlateOcrProviderTransport | undefined;
    const observed = (): PlateOcrObservedResult => {
      const base = {
        response,
        httpResponseComplete,
        durationMs: Math.max(
          0,
          Math.min(120_000, Math.round(performance.now() - started)),
        ),
      };
      if (!transport?.fetchInvoked) {
        return {
          ...base,
          fetchInvoked: false,
          disposition: "NOT_SENT",
          observationClass: "NOT_INVOKED",
          httpClass: "NONE",
          failureClass:
            failureClass === "CANCELLED" || failureClass === "NONE"
              ? failureClass
              : "OTHER",
        };
      }
      if (httpResponseComplete && httpClass !== "NONE") {
        return {
          ...base,
          fetchInvoked: true,
          disposition: "UNKNOWN",
          observationClass: "HTTP_COMPLETE",
          httpClass,
          failureClass,
        };
      }
      return {
        ...base,
        fetchInvoked: true,
        disposition: "UNKNOWN",
        observationClass: "UNCERTAIN",
        httpClass: "NONE",
        failureClass,
      };
    };
    const config = this.config;
    if (!config) {
      this.diagnostic(this.configIssue);
      return observed();
    }
    try {
      transport = new PlateOcrProviderTransport(
        config,
        input,
        this.http,
        options?.signal,
      );
      const pending = transport.dispatch(options?.permit);
      if (!pending) return observed();
      this.diagnostic("request-start");
      const providerResponse = await pending;
      httpClass =
        providerResponse.status >= 200 && providerResponse.status < 300
          ? "2XX"
          : providerResponse.status >= 400 && providerResponse.status < 500
            ? "4XX"
            : providerResponse.status >= 500 && providerResponse.status < 600
              ? "5XX"
              : "NONE";
      if (!providerResponse.ok) {
        failureClass = "PROVIDER";
        this.diagnostic("http-non-ok", { status: providerResponse.status });
        void providerResponse.body?.cancel().catch(() => undefined);
        return observed();
      }
      const bodyResult = await readBoundedOcrJson(
        providerResponse,
        transport.signal,
      );
      httpResponseComplete =
        bodyResult.ok || bodyResult.diagnostic === "invalid-json";
      if (!bodyResult.ok) {
        failureClass = "PARSE";
        this.diagnostic("http-success", { status: providerResponse.status });
        this.diagnostic(bodyResult.diagnostic, {
          status: providerResponse.status,
        });
        return observed();
      }
      const count = resultCount(bodyResult.value);
      this.diagnostic("http-success", {
        status: providerResponse.status,
        resultCount: count,
      });
      const parsed = parseResult(bodyResult.value, config.minScore);
      if (parsed.response.status === "UNAVAILABLE") failureClass = "PARSE";
      else failureClass = "NONE";
      this.diagnostic(parsed.diagnostic, {
        status: providerResponse.status,
        resultCount: parsed.resultCount,
      });
      response = parsed.response;
      return observed();
    } catch {
      if (!transport?.fetchInvoked) {
        // If preparation failed before dispatch, explicitly burn the private
        // capability before publishing a proven local NOT_SENT observation.
        try {
          options?.permit.consumeIfFresh();
        } catch {
          // This process has still issued no fetch; never retry dispatch.
        }
        failureClass = "OTHER";
      } else if (transport.timedOut) failureClass = "TIMEOUT";
      else if (options?.signal.aborted) failureClass = "CANCELLED";
      else failureClass = "NETWORK";
      this.diagnostic(
        failureClass === "TIMEOUT"
          ? "timeout"
          : failureClass === "CANCELLED"
            ? "cancelled"
            : !transport?.fetchInvoked
              ? "pre-dispatch-error"
              : "network-error",
      );
      return observed();
    } finally {
      transport?.cleanup();
    }
  }
}
