import {
  EmployeeApiError,
  EmployeeClient,
  employeeAuthenticationRequiredError,
  employeeNetworkError,
  type AcceptTaskResponse,
  type EmployeeOperationalTransport,
  type EmployeeTransport,
  type EmployeeTransportRequest,
  type NativeAuthSession,
  staffOperationalContextResponseSchema,
  type TaskQueueResponse,
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
        status: response.status,
      };
    } catch (error) {
      if (error instanceof EmployeeApiError) throw error;
      throw employeeNetworkError();
    }
  }
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
): EmployeeOperationalTransport {
  function request<T>(input: EmployeeTransportRequest): Promise<T> {
    const client = createNativeEmployeeClient(apiOrigin, auth);
    return client.request<T>(input);
  }

  return {
    async acceptTask(taskId, expectedVersion) {
      return request<AcceptTaskResponse>({
        body: { expectedVersion },
        method: "POST",
        path: `/v1/staff/tasks/${taskId}/accept`,
      });
    },
    async loadOperationalContext() {
      const value = await request<unknown>({
        method: "GET",
        path: "/v1/staff/operational-context",
      });
      const parsed = staffOperationalContextResponseSchema.safeParse(value);
      if (!parsed.success) throw invalidResponse();
      return parsed.data;
    },
    async loadTaskQueue(locationId) {
      return request<TaskQueueResponse>({
        method: "GET",
        params: { locationId },
        path: "/v1/staff/tasks/queue",
      });
    },
  };
}
