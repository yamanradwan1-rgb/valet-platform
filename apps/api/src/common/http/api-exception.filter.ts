import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";

import {
  MONOTONIC_CLOCK,
  OPERATION_OBSERVER,
  type MonotonicClock,
  type OperationObserver,
} from "../observability/operation-observability";
import { resolveRequestId, type ApiRequest } from "./api-request";
import { setNoStoreResponseHeaders } from "./no-store-response";

interface FilterRequest extends ApiRequest {
  readonly method: string;
  readonly originalUrl: string;
}

interface FilterResponse {
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  status(status: number): FilterResponse;
}

const operationRoutes: ReadonlyArray<{
  method: string;
  operation: string;
  path: RegExp;
}> = [
  {
    method: "POST",
    operation: "STAFF_AUTH_LOGIN",
    path: /^\/v1\/staff\/auth\/login$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_REFRESH",
    path: /^\/v1\/staff\/auth\/refresh$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_LOGOUT",
    path: /^\/v1\/staff\/auth\/logout$/,
  },
  {
    method: "POST",
    operation: "CHECK_IN_INTAKE",
    path: /^\/v1\/staff\/check-in\/intakes$/,
  },
  {
    method: "PUT",
    operation: "CHECK_IN_VEHICLE_IDENTITY",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/vehicle-identity$/,
  },
  {
    method: "POST",
    operation: "CHECK_IN_CONDITION_NOTE",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-notes$/,
  },
  {
    method: "POST",
    operation: "CHECK_IN_CONDITION_NOTE_CORRECTION",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-notes\/[^/]+\/corrections$/,
  },
  {
    method: "POST",
    operation: "CHECK_IN_CONDITION_PHOTO",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-photos$/,
  },
  {
    method: "POST",
    operation: "CHECK_IN_CONDITION_COMPLETION",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-completion$/,
  },
  {
    method: "POST",
    operation: "CHECK_IN_GUEST_ACCESS_ISSUE",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/guest-access\/issue$/,
  },
  {
    method: "POST",
    operation: "CHECK_IN_GUEST_ACCESS_REVOKE",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/guest-access\/revoke$/,
  },
  {
    method: "POST",
    operation: "COMPLETE_CHECK_IN",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/complete$/,
  },
  {
    method: "GET",
    operation: "GUEST_SESSION_READ",
    path: /^\/v1\/guest\/session$/,
  },
  {
    method: "POST",
    operation: "GUEST_RETRIEVAL_REQUEST",
    path: /^\/v1\/guest\/session\/request-retrieval$/,
  },
  {
    method: "POST",
    operation: "SHIFT_START",
    path: /^\/v1\/staff\/shifts\/start$/,
  },
  {
    method: "POST",
    operation: "SHIFT_END",
    path: /^\/v1\/staff\/shifts\/[^/]+\/end$/,
  },
  {
    method: "GET",
    operation: "SHIFT_ACTIVE_LOOKUP",
    path: /^\/v1\/staff\/shifts\/active$/,
  },
  {
    method: "POST",
    operation: "KEY_SLOT_ASSIGN",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/key-slot\/assign$/,
  },
  {
    method: "POST",
    operation: "KEY_SLOT_CLEAR",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/key-slot\/clear$/,
  },
];

const guestAccessOperations = new Set([
  "CHECK_IN_GUEST_ACCESS_ISSUE",
  "CHECK_IN_GUEST_ACCESS_REVOKE",
  "GUEST_SESSION_READ",
  "GUEST_RETRIEVAL_REQUEST",
]);

function routedOperation(request: FilterRequest): string | undefined {
  const path = request.originalUrl.split("?", 1)[0] ?? "";
  return operationRoutes.find(
    (route) => route.method === request.method && route.path.test(path),
  )?.operation;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("CheckInApi");

  constructor(
    @Inject(MONOTONIC_CLOCK)
    private readonly clock: MonotonicClock,
    @Inject(OPERATION_OBSERVER)
    private readonly observer: OperationObserver,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  private reportUnexpected(requestId: string, operation: string): void {
    this.logger.error(
      `INTERNAL_ERROR operation=${operation} requestId=${requestId}`,
    );
  }

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const context = host.switchToHttp();
    const request = context.getRequest<FilterRequest>();
    const response = context.getResponse<FilterResponse>();
    const operation = routedOperation(request);
    if (operation === undefined) {
      new BaseExceptionFilter(this.httpAdapterHost.httpAdapter).catch(
        exception,
        host,
      );
      return;
    }
    const requestId = request.requestId ?? resolveRequestId(request.headers);
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    if (operation.startsWith("STAFF_AUTH_")) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
    }
    if (guestAccessOperations.has(operation)) {
      setNoStoreResponseHeaders(response);
    }

    if (request.operationMeasured === true) {
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      const body =
        exception instanceof HttpException
          ? exception.getResponse()
          : {
              code: "INTERNAL_ERROR",
              message: "The operation could not be completed.",
              requestId,
            };
      if (
        status === HttpStatus.TOO_MANY_REQUESTS ||
        status === HttpStatus.SERVICE_UNAVAILABLE
      ) {
        response.setHeader("Cache-Control", "no-store");
      }
      const retryAfter = (exception as { retryAfter?: unknown }).retryAfter;
      if (
        status === HttpStatus.TOO_MANY_REQUESTS &&
        typeof retryAfter === "number"
      ) {
        response.setHeader("Retry-After", String(retryAfter));
      }
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        this.reportUnexpected(requestId, operation);
      }
      response.status(status).json(body);
      return;
    }

    const isBadRequest =
      exception instanceof HttpException &&
      exception.getStatus() === HttpStatus.BAD_REQUEST;
    const code = isBadRequest ? "REQUEST_INVALID" : "INTERNAL_ERROR";
    const status = isBadRequest
      ? HttpStatus.BAD_REQUEST
      : HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      code,
      message: isBadRequest
        ? "The request is invalid."
        : "The operation could not be completed.",
      requestId,
    });
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.reportUnexpected(requestId, operation);
    }

    const startedAt = this.clock.now();
    request.operationMeasured = true;
    try {
      await this.observer.observe({
        durationMs: Math.max(0, this.clock.now() - startedAt),
        errorCode: code,
        operation,
        outcome: "ERROR",
        requestId,
      });
    } catch {
      // The safe error response is already committed.
    }
  }
}
