import {
  employeeSessionServiceUnavailableError,
  normalizeEmployeeApiError,
} from "./api-error";
import {
  shouldRefreshAndRetryEmployeeRequest,
  shouldReportEmployeeAuthorizationLoss,
  type EmployeeAuthorizationRefreshResult,
  type EmployeeHttpMethod,
} from "./recovery-policy";

export interface EmployeeTransportRequest {
  readonly body?: unknown | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly method: EmployeeHttpMethod;
  readonly params?:
    | Readonly<Record<string, string | number | boolean | undefined | null>>
    | undefined;
  readonly path: string;
}

export interface EmployeeTransportResponse {
  readonly payload: unknown;
  readonly status: number;
}

export interface EmployeeTransport {
  execute(
    request: EmployeeTransportRequest,
  ): Promise<EmployeeTransportResponse>;
}

export interface EmployeeAuthorizationRecovery {
  readonly allowRefresh: boolean;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly refreshAuthorization?:
    (() => Promise<EmployeeAuthorizationRefreshResult>) | undefined;
}

export interface EmployeeClientOptions {
  readonly authorizationRecovery?: EmployeeAuthorizationRecovery | undefined;
  readonly transport: EmployeeTransport;
}

/**
 * Transport-neutral Employee request orchestration. It may retry one safe read
 * after an explicit authorization refresh, but never replays a mutation.
 */
export class EmployeeClient {
  private readonly authorizationRecovery?:
    EmployeeAuthorizationRecovery | undefined;
  private readonly transport: EmployeeTransport;

  constructor(options: EmployeeClientOptions) {
    this.authorizationRecovery = options.authorizationRecovery;
    this.transport = options.transport;
  }

  request<T>(request: EmployeeTransportRequest): Promise<T> {
    return this.execute<T>(request, false);
  }

  private async execute<T>(
    request: EmployeeTransportRequest,
    alreadyRetried: boolean,
  ): Promise<T> {
    const response = await this.transport.execute(request);
    if (response.status >= 200 && response.status < 300) {
      return response.payload as T;
    }

    const recovery = this.authorizationRecovery;
    const mayRefresh =
      recovery?.allowRefresh === true &&
      recovery.refreshAuthorization !== undefined &&
      shouldRefreshAndRetryEmployeeRequest(
        request.method,
        response.status,
        alreadyRetried,
      );

    if (mayRefresh) {
      const refreshResult = await recovery.refreshAuthorization!();
      if (refreshResult === "refreshed") {
        return this.execute<T>(request, true);
      }
      if (refreshResult === "transient-failure") {
        throw employeeSessionServiceUnavailableError();
      }
      recovery.onAuthorizationLoss?.();
    } else if (shouldReportEmployeeAuthorizationLoss(response.status)) {
      recovery?.onAuthorizationLoss?.();
    }

    throw normalizeEmployeeApiError(response.status, response.payload);
  }
}
