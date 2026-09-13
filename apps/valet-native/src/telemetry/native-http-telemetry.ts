/**
 * Native HTTP transport telemetry wrapper (MOB-024A).
 *
 * PRIVACY + SAFETY CONTRACT:
 * - Records ONLY: outcome, bounded classification, durationMs, bounded
 *   errorCode (machine error code), and requestId from the bounded
 *   X-Request-Id RESPONSE header. It NEVER reads request.body, request
 *   headers, request.params, or the raw path (paths carry entity IDs).
 * - The business result is PRESERVED: every error is rethrown unchanged
 *   (same instance), every successful response object is returned as-is.
 *   Telemetry must never alter what the caller sees.
 * - Status-aware classification: a 2xx response records outcome "success";
 *   a non-2xx response (which the EmployeeClient will surface as a thrown
 *   EmployeeApiError) records outcome "error" with the bounded machine error
 *   code from the response payload's `code` discriminator — never the
 *   message, never any business field.
 * - Recording itself is fail-open: telemetry must never break the caller.
 */
import {
  createEmployeeTelemetryEvent,
  isSafeTelemetryRequestId,
  EmployeeApiError,
  type EmployeeTelemetryEvent,
  type EmployeeTransport,
  type EmployeeTransportRequest,
  type EmployeeTransportResponse,
} from "@valet/employee-client";

/** Response envelope with the optional correlated request id (see file 5). */
export type NativeTelemetryTransportResponse = EmployeeTransportResponse & {
  readonly requestId?: string | undefined;
};

function boundedErrorCode(code: unknown): string | undefined {
  return typeof code === "string" && isSafeTelemetryRequestId(code)
    ? code
    : undefined;
}

/**
 * Bounded machine error code from a NON-2xx response payload. Only the
 * `code` discriminator is consulted (bounded-safe pattern), never the
 * message, never any business field, and 2xx payloads are never read.
 */
function responseErrorCode(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object" || !("code" in payload)) {
    return undefined;
  }
  return boundedErrorCode((payload as { code?: unknown }).code);
}

export class NativeHttpTelemetryTransport implements EmployeeTransport {
  private readonly record: (event: EmployeeTelemetryEvent) => void;

  constructor(
    private readonly inner: EmployeeTransport,
    record:
      | ((event: EmployeeTelemetryEvent) => void)
      | { record: (event: EmployeeTelemetryEvent) => void },
  ) {
    const sink =
      typeof record === "function"
        ? record
        : (event: EmployeeTelemetryEvent) => record.record(event);
    // Fail-open: a broken telemetry sink must never break the request.
    this.record = (event: EmployeeTelemetryEvent) => {
      try {
        sink(event);
      } catch {
        /* telemetry is never allowed to alter the business result */
      }
    };
  }

  async execute(
    request: EmployeeTransportRequest,
  ): Promise<EmployeeTransportResponse> {
    const startedAt = Date.now();
    try {
      const response: NativeTelemetryTransportResponse =
        await this.inner.execute(request);
      // Status-aware classification: the transport call itself may have
      // succeeded while the response is an application error the caller
      // will see as a thrown EmployeeApiError. 2xx -> success; a 401 is an
      // authorization loss; anything else non-2xx is an error response.
      const notOk = response.status < 200 || response.status >= 300;
      const event = createEmployeeTelemetryEvent({
        classification: notOk
          ? response.status === 401
            ? "auth-loss"
            : "response"
          : "response",
        durationMs: Date.now() - startedAt,
        errorCode: notOk ? responseErrorCode(response.payload) : undefined,
        outcome: notOk ? "error" : "success",
        requestId: isSafeTelemetryRequestId(response.requestId)
          ? response.requestId
          : undefined,
        source: "http",
      });
      if (event !== undefined) this.record(event);
      return response;
    } catch (error) {
      this.recordFailure(error, Date.now() - startedAt);
      throw error;
    }
  }

  private recordFailure(error: unknown, durationMs: number): void {
    const event =
      error instanceof EmployeeApiError
        ? createEmployeeTelemetryEvent({
            classification: error.isNetworkError
              ? "network-failure"
              : error.status === 401
                ? "auth-loss"
                : "response",
            durationMs,
            errorCode: boundedErrorCode(error.code),
            outcome: "error",
            requestId: error.requestId,
            source: "http",
          })
        : createEmployeeTelemetryEvent({
            classification: "network-failure",
            durationMs,
            outcome: "unknown",
            source: "http",
          });
    if (event !== undefined) this.record(event);
  }
}
