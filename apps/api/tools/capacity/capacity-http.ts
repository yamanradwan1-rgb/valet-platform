import { performance } from "node:perf_hooks";

import { SAFETY_LIMITS, CapacitySafetyMonitor } from "./capacity-safety";
import { summarize } from "./capacity-statistics";
import type { RequestSample, WorkloadResult } from "./capacity-types";

export interface SafeResponse {
  readonly body: unknown;
  readonly sample: RequestSample;
}

export async function requestJson(
  baseUrl: string,
  operation: string,
  method: string,
  path: string,
  options: { readonly body?: unknown; readonly token?: string } = {},
): Promise<SafeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SAFETY_LIMITS.requestTimeoutMs,
  );
  const started = performance.now();
  try {
    const headers: Record<string, string> = {};
    if (options.body !== undefined)
      headers["content-type"] = "application/json";
    if (options.token !== undefined)
      headers.authorization = `Bearer ${options.token}`;
    const response = await fetch(`${baseUrl}${path}`, {
      headers,
      method,
      signal: controller.signal,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    let body: unknown = undefined;
    try {
      body = await response.json();
    } catch {
      // Response bodies are never retained in output; invalid JSON fails validation.
    }
    const errorCode =
      typeof body === "object" && body !== null && "code" in body
        ? String((body as { code: unknown }).code)
        : undefined;
    return {
      body,
      sample: {
        durationMs: Number((performance.now() - started).toFixed(2)),
        ...(errorCode === undefined ? {} : { errorCode }),
        operation,
        status: response.status,
      },
    };
  } catch (error) {
    return {
      body: undefined,
      sample: {
        durationMs: Number((performance.now() - started).toFixed(2)),
        errorCode:
          error instanceof Error && error.name === "AbortError"
            ? "TIMEOUT"
            : "NETWORK",
        operation,
        status: 0,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runConcurrent(
  name: string,
  count: number,
  concurrency: number,
  monitor: CapacitySafetyMonitor,
  request: (index: number) => Promise<RequestSample>,
): Promise<{
  readonly result: WorkloadResult;
  readonly samples: RequestSample[];
}> {
  const samples: RequestSample[] = [];
  let cursor = 0;
  let failure: unknown;
  let inFlight = 0;
  let maximumInFlight = 0;
  let stopped = false;
  const started = performance.now();
  const workers = Array.from(
    { length: Math.min(count, concurrency) },
    async () => {
      for (;;) {
        if (stopped) return;
        const index = cursor;
        cursor += 1;
        if (index >= count) return;
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        try {
          const sample = await request(index);
          samples.push(sample);
          monitor.record(sample);
          monitor.assertRequestLimits(samples);
        } catch (error) {
          failure ??= error;
          stopped = true;
          return;
        } finally {
          inFlight -= 1;
        }
      }
    },
  );
  await Promise.all(workers);
  if (failure !== undefined) throw failure;
  const durationMs = Number((performance.now() - started).toFixed(2));
  if (maximumInFlight !== Math.min(count, concurrency)) {
    throw new Error("Harness concurrency invariant failed.");
  }
  await monitor.snapshot();
  return {
    result: {
      concurrency,
      durationMs,
      maximumInFlight,
      name,
      retries: 0,
      summary: summarize(samples, durationMs),
    },
    samples,
  };
}
