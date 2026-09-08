import {
  EmployeeApiError,
  EmployeeClient,
  createEmployeeShiftEndTransport,
  assignTaskResponseSchema,
  employeeAuthenticationRequiredError,
  employeeNetworkError,
  type AcceptTaskResponse,
  type EmployeeOperationalTransport,
  type EmployeeTransport,
  type EmployeeTransportRequest,
  type NativeAuthSession,
  startShiftResponseSchema,
  staffOperationalContextResponseSchema,
  taskQueueResponseSchema,
  type AssignTaskResponse,
  type TaskQueueResponse,
  type EmployeeShiftStartTransport,
  type EmployeeShiftEndTransport,
  type StaffOperationalContextResponse,
} from "@valet/employee-client";

import {
  readNativeResponsePayload,
  validateNativeApiOrigin,
} from "../auth/native-api-http";

class NativeBearerTransport implements EmployeeTransport {
  private readonly apiOrigin: string;

  constructor(
    apiOrigin: string,
    private readonly accessToken: () => string | undefined,
    private readonly onResponse: (status: number) => void,
    private readonly signal?: AbortSignal,
  ) {
    this.apiOrigin = validateNativeApiOrigin(apiOrigin);
  }

  async execute(request: EmployeeTransportRequest) {
    const accessToken = this.accessToken();
    if (accessToken === undefined) throw employeeAuthenticationRequiredError();
    const url = new URL(request.path, this.apiOrigin);
    for (const [key, value] of Object.entries(request.params ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...request.headers,
    };
    const multipart =
      typeof FormData !== "undefined" && request.body instanceof FormData;
    if (request.body !== undefined && !multipart)
      headers["Content-Type"] = "application/json";
    try {
      const response = await fetch(url.toString(), {
        ...(request.body === undefined
          ? {}
          : {
              body: multipart
                ? (request.body as FormData)
                : JSON.stringify(request.body),
            }),
        ...(this.signal === undefined ? {} : { signal: this.signal }),
        credentials: "omit",
        headers,
        method: request.method,
      });
      this.onResponse(response.status);
      return {
        payload: await readNativeResponsePayload(response),
        retryAfter: parseRetryAfter(response.headers.get("Retry-After")),
        status: response.status,
      };
    } catch (error) {
      if (error instanceof EmployeeApiError) throw error;
      throw employeeNetworkError();
    }
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 900
    ? seconds
    : undefined;
}

export function createNativeEmployeeClient(
  apiOrigin: string,
  auth: NativeAuthSession,
  signal?: AbortSignal,
): EmployeeClient {
  const requestGeneration = auth.current().authGeneration;
  const isCurrent = () => auth.current().authGeneration === requestGeneration;
  let responseStatus: number | undefined;
  return new EmployeeClient({
    authorizationRecovery: {
      allowRefresh: true,
      onAuthorizationLoss: () => {
        if (responseStatus === 401 && isCurrent()) {
          void auth.handleDefinitiveAuthorizationLoss(requestGeneration);
        }
      },
      refreshAuthorization: async () => {
        if (!isCurrent()) return "definitive-failure";
        const result = await auth.refresh();
        if (!isCurrent()) return "definitive-failure";
        return result === "refreshed"
          ? "refreshed"
          : result === "transient-failure"
            ? "transient-failure"
            : "definitive-failure";
      },
    },
    transport: new NativeBearerTransport(
      apiOrigin,
      () => (isCurrent() ? auth.getAccessToken() : undefined),
      (status) => {
        responseStatus = status;
      },
      signal,
    ),
  });
}

function invalidResponse(): EmployeeApiError {
  return new EmployeeApiError({
    code: "NATIVE_OPERATIONAL_RESPONSE_INVALID",
    message: "The operational response was invalid.",
    status: 502,
  });
}

export function createNativeOperationalTransport(
  apiOrigin: string,
  auth: NativeAuthSession,
  onOperationalContext?: (
    identityGeneration: number,
    response: StaffOperationalContextResponse,
  ) => void,
): EmployeeOperationalTransport {
  function request<T>(
    input: EmployeeTransportRequest,
    signal?: AbortSignal,
  ): Promise<T> {
    const client = createNativeEmployeeClient(apiOrigin, auth, signal);
    return client.request<T>(input);
  }

  return {
    async assignTask(taskId, expectedVersion) {
      const value = await request<unknown>({
        body: { expectedVersion },
        method: "POST",
        path: `/v1/staff/tasks/${taskId}/assign`,
      });
      const parsed = assignTaskResponseSchema.safeParse(value);
      if (!parsed.success) throw invalidResponse();
      return parsed.data as AssignTaskResponse;
    },
    async acceptTask(taskId, expectedVersion) {
      return request<AcceptTaskResponse>({
        body: { expectedVersion },
        method: "POST",
        path: `/v1/staff/tasks/${taskId}/accept`,
      });
    },
    async loadOperationalContext() {
      const identityGeneration = auth.current().authGeneration;
      const value = await request<unknown>({
        method: "GET",
        path: "/v1/staff/operational-context",
      });
      const parsed = staffOperationalContextResponseSchema.safeParse(value);
      if (!parsed.success) throw invalidResponse();
      onOperationalContext?.(identityGeneration, parsed.data);
      return parsed.data;
    },
    async loadTaskQueue(locationId, signal) {
      const value = await request<unknown>(
        {
          method: "GET",
          params: { locationId },
          path: "/v1/staff/tasks/queue",
        },
        signal,
      );
      const parsed = taskQueueResponseSchema.safeParse(value);
      if (!parsed.success) throw invalidResponse();
      return parsed.data as TaskQueueResponse;
    },
  };
}

export function createNativeShiftStartTransport(
  apiOrigin: string,
  auth: NativeAuthSession,
): EmployeeShiftStartTransport {
  return {
    async startShift(targetLocationId) {
      const client = createNativeEmployeeClient(apiOrigin, auth);
      const value = await client.request<unknown>({
        body: { targetLocationId },
        method: "POST",
        path: "/v1/staff/shifts/start",
      });
      const parsed = startShiftResponseSchema.safeParse(value);
      if (!parsed.success) throw invalidResponse();
      return parsed.data;
    },
  };
}

export function createNativeShiftEndTransport(
  apiOrigin: string,
  auth: NativeAuthSession,
): EmployeeShiftEndTransport {
  return createEmployeeShiftEndTransport(() =>
    createNativeEmployeeClient(apiOrigin, auth),
  );
}
